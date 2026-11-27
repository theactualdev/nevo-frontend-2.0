"use client";

import { useMemo, useRef, useState } from "react";
import type { AdminClass } from "@/lib/api/classes";
import { invitesApi, type BulkInviteResult } from "@/lib/api/invites";
import { subjectsApi, type SchoolSubject } from "@/lib/api/subjects";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  GHOST_BTN,
  Modal,
  PRIMARY_BTN,
  Spinner,
} from "../Roster/primitives";
import { ReadFailed } from "../ReadFailed";
import { SubjectPicker } from "../Classes/SubjectPicker";
import {
  MAX_ROWS,
  NO_EMAIL,
  TEMPLATE,
  TEMPLATE_ROWS,
  groupTeachers,
  parseInviteCsv,
  toDraft,
  type ImportTeacher,
  type ParsedRow,
  type Teaching,
} from "./csv";
import {
  alsoLine,
  andList,
  answersFrom,
  classesFor,
  fold,
  namesToAdd,
  sameWords,
  subjectFor,
  toSettle,
  type SubjectAnswer,
} from "./staffImport";
import { confirmedSent, needsManualDelivery } from "./deliveryCopy";
import { LinkHandout } from "./LinkHandout";
import { RejectedRows } from "./RejectedRows";

/**
 * D19 bulk import: upload, read, preview, send, confirm.
 *
 * TEACHERS ONLY (Lydia's L2, 14 Oct; SCRUM-215 on the backend). A child gets
 * no invitation, so the student import - its template, its parent contact
 * column and its consent lines - went with the student invite rather than
 * staying behind unreachable. A school adds its children on Students.
 *
 * D19'S STAFF IMPORT, IN FULL (backlog 19; T15, live 21 Nov). One row is one
 * subject in one class; "Rows join into one teacher by email, never by name";
 * a subject Nevo doesn't recognise is settled in its row with the subject
 * picker before anything is saved; a row with no email is left out in the
 * frame's words; and "Save N teachers" waits until nothing is left to settle.
 * Each teacher's invitation carries every class with its subject
 * (`classes: [{classId, subjectId}]`), attached when they accept.
 *
 * WITHOUT step 1's "This file is also how Nevo learns which subjects each
 * class offers" - Lydia dropped the sentence (L62, 25 Nov). Nothing in the
 * contract does that: an invitation names a class and a subject, and
 * acceptance assigns the teacher without adding the subject to the class.
 *
 * Lydia's words (25 Nov): the subtitle's "one invite for each teacher" (L63;
 * rows join by email, so "each row" was untrue), and two of the staff
 * import's lines (L64) - "Use this for rows 15 and 23, which say "X" as
 * well." and the subjects read's failure. The other five stand as drafted.
 *
 * PARTIAL SEND IS CORRECT HERE, and it is worth being explicit because the
 * other spec in this area says the opposite. SCRUM-40 claims CSV import is
 * all-or-nothing, "matching SCRUM-79" - but D19 IS the SCRUM-79 surface, and
 * the API agrees: `POST /api/v1/invites/bulk` returns `{created, rejected}`.
 *
 * The confirmation counts come from the RESPONSE, not from our tally: the
 * backend rejects rows we cannot anticipate (a duplicate against people
 * already invited, say), and reporting our own optimistic number would tell a
 * school it invited people it did not.
 *
 * AND THE CONFIRMATION READS `deliveryStatus`. `email_not_configured` means
 * the invitation exists and nobody was emailed, so the links are handed over
 * here (`LinkHandout`) rather than the console saying "sent".
 */

type Phase = "upload" | "reading" | "preview" | "sending" | "done" | "failed";

const TITLE = "Import teachers";

/** D19's import row: Row, Teacher, Teaches, Status. */
const COLS =
  "grid grid-cols-[44px_minmax(0,1.1fr)_minmax(0,1.5fr)_170px] items-start gap-3.5";

/** The server takes up to 50 names a call. */
function chunks<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Status({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-nevo-navy">
      <span aria-hidden className={cn("size-[7px] flex-none rounded-full", dot)} />
      {children}
    </span>
  );
}

export function BulkImportModal({
  classes,
  onClose,
  onSent,
}: {
  classes: AdminClass[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Map<string, SubjectAnswer | null>>(new Map());
  const [school, setSchool] = useState<SchoolSubject[] | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  /** The admin's own pick for a row, by file line. */
  const [settled, setSettled] = useState<Record<number, string>>({});
  /** The row whose subject is being settled. */
  const [settling, setSettling] = useState<number | null>(null);
  const [alsoOthers, setAlsoOthers] = useState(true);
  const [result, setResult] = useState<BulkInviteResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const teachers = useMemo(() => groupTeachers(rows), [rows]);
  const leftOut = rows.filter((r) => r.error);
  const open = toSettle(teachers, answers, settled);
  const merged = teachers.filter((t) => t.lines.length > 1);

  /**
   * What the file's subjects are, asked of the server before the preview -
   * never guessed here. The school's own list comes too, for the picker and
   * for the ids Save needs.
   */
  const check = (parsed: ParsedRow[]) => {
    setPhase("reading");
    setCheckFailed(false);
    const typed = [
      ...new Map(
        parsed
          .filter((r) => !r.error && r.classId && r.subject)
          .map((r) => [fold(r.subject), r.subject] as const),
      ).values(),
    ];
    Promise.all([
      Promise.all(chunks(typed, 50).map((c) => subjectsApi.resolve(c))).then((r) => r.flat()),
      subjectsApi.list().catch(() => null),
    ])
      .then(([resolved, list]) => {
        setAnswers(answersFrom(resolved));
        setSchool(list);
        setSettled({});
        setSettling(null);
        setPhase("preview");
      })
      .catch(() => setCheckFailed(true));
  };

  const readFile = (file: File) => {
    setPhase("reading");
    setFatal(null);
    file
      .text()
      .then((text) => {
        const outcome = parseInviteCsv(text, classes);
        if (outcome.fatal) {
          setFatal(outcome.fatal);
          setRows([]);
          setPhase("upload");
          return;
        }
        setRows(outcome.rows);
        check(outcome.rows);
      })
      .catch(() => {
        setFatal("We couldn't read that file. Is it a .csv?");
        setPhase("upload");
      });
  };

  /** A pick in one row, and - unless untold - in every row that typed the same words. */
  const settle = (t: Teaching, name: string | null) => {
    setSettled((prev) => {
      const next = { ...prev };
      const lines = [t.line, ...(alsoOthers ? sameWords(t, open).map((o) => o.line) : [])];
      for (const line of lines) {
        if (name) next[line] = name;
        else delete next[line];
      }
      return next;
    });
    if (name) setSettling(null);
  };

  const send = async () => {
    if (open.length > 0 || teachers.length === 0) return;
    setPhase("sending");
    try {
      const list = school ?? [];
      // A subject an invitation names must be on the school's list first.
      const added = new Map<string, string>();
      for (const name of namesToAdd(teachers, answers, settled, list)) {
        const s = await subjectsApi.add(name);
        for (const n of [name, s.name, s.displayName]) added.set(fold(n), s.id);
      }
      const res = await invitesApi.bulk(
        teachers.map((t) => toDraft(t.row, classesFor(t, answers, settled, list, added))),
      );
      setResult(res);
      setPhase("done");
      onSent();
    } catch {
      setPhase("failed");
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nevo-teachers-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /** What the server's `row` counts into: one entry per teacher sent. */
  const submitted = (list: ImportTeacher[]): ParsedRow[] =>
    list.map((t) => ({
      ...t.row,
      line: t.lines[0],
      className: andList([...new Set(t.teaches.map((x) => x.className))]),
    }));

  // ------------------------------------------------------------ READING ---
  if (phase === "reading") {
    return (
      <Modal title={TITLE} onClose={onClose} footer={<span />}>
        {checkFailed ? (
          <ReadFailed
            className="py-4"
            line="We couldn’t check your file’s subjects against the ones Nevo knows just now."
            onRetry={() => check(rows)}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Spinner />
            <p className="m-0 text-[15px] font-semibold text-nevo-near-black">
              Reading your file
            </p>
            <p className="m-0 text-sm text-nevo-near-black/62">
              Checking each row against your classes. This takes a moment.
            </p>
          </div>
        )}
      </Modal>
    );
  }

  // --------------------------------------------------------------- DONE ---
  if (phase === "done" && result) {
    const skipped = result.rejected.length + leftOut.length;
    const notEmailed = result.created.filter((i) => needsManualDelivery(i.deliveryStatus));
    const unconfirmed = result.created.filter(
      (i) => !confirmedSent(i.deliveryStatus) && !needsManualDelivery(i.deliveryStatus),
    );
    const undelivered = [...notEmailed, ...unconfirmed];
    const allDelivered = undelivered.length === 0;
    const n = result.created.length;
    const noEmail = leftOut.filter((r) => r.noEmail).length;
    const pairs = merged.every((t) => t.lines.length === 2);
    return (
      <Modal
        title={
          allDelivered
            ? plural(n, "teacher invited", "teachers invited")
            : plural(n, "invitation created", "invitations created")
        }
        onClose={onClose}
        footer={
          <button
            type="button"
            onClick={onClose}
            className={cn(PRIMARY_BTN, "flex-1 justify-center")}
          >
            Done
          </button>
        }
      >
        <div className="flex justify-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop">
            <CheckIcon size={22} />
          </span>
        </div>
        {/* D19 step 3's two lines. */}
        {merged.length > 0 || noEmail > 0 ? (
          <div data-import-summary className="mt-4 text-center text-[14px] leading-[1.6] text-nevo-near-black/72">
            {merged.length > 0 ? (
              <p className="m-0">
                {pairs
                  ? `${plural(merged.length, "pair", "pairs")} of rows joined by email.`
                  : `Rows for ${plural(merged.length, "teacher", "teachers")} joined by email.`}
              </p>
            ) : null}
            {noEmail > 0 ? (
              <p className="m-0">
                {`${plural(noEmail, "row", "rows")} left out because ${noEmail === 1 ? "it has" : "they have"} no email.`}
              </p>
            ) : null}
          </div>
        ) : null}
        {skipped > 0 ? (
          <RejectedRows
            broken={leftOut}
            rejected={result.rejected}
            submitted={submitted(teachers)}
            rowNumberBase={result.rowNumberBase}
            filename="nevo-teachers-not-imported.csv"
          />
        ) : null}
        {undelivered.length > 0 ? (
          <LinkHandout
            className="mt-4"
            invites={undelivered}
            lead={
              unconfirmed.length === 0
                ? notEmailed.length === n
                  ? `No email went out. This school has no mail set up in Nevo, so ${n === 1 ? "this link is" : "these links are"} the only way in.`
                  : `No email went out for ${notEmailed.length} of them, so their links below are the only way in.`
                : notEmailed.length === 0
                  ? `We couldn't confirm an email went out${unconfirmed.length === n ? "" : ` for ${unconfirmed.length} of them`}, so the ${unconfirmed.length === 1 ? "link" : "links"} below ${unconfirmed.length === 1 ? "is" : "are"} the surest way in.`
                  : `No email went out for ${notEmailed.length} of them, and we couldn't confirm one for ${unconfirmed.length} more. Their links are below.`
            }
          />
        ) : null}
      </Modal>
    );
  }

  // ------------------------------------------------------------- FAILED ---
  if (phase === "failed") {
    return (
      <Modal
        title="The upload didn&rsquo;t finish. We&rsquo;re on it."
        onClose={onClose}
        footer={
          <>
            <button
              type="button"
              onClick={() => setPhase("preview")}
              className={cn(GHOST_BTN, "flex-1")}
            >
              Go back
            </button>
            <button
              type="button"
              onClick={send}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              Try again
            </button>
          </>
        }
      >
        <p className="m-0 text-[14.5px] leading-[1.6] text-nevo-near-black/72">
          No invites were sent, and your file is safe. Nothing was half-done -
          you can try the upload again.
        </p>
      </Modal>
    );
  }

  // ------------------------------------------------------------ PREVIEW ---
  if (phase === "preview" || phase === "sending") {
    const items = [
      ...teachers.map((t) => ({ at: t.lines[0], teacher: t, row: null as ParsedRow | null })),
      ...leftOut.map((r) => ({ at: r.line, teacher: null as ImportTeacher | null, row: r })),
    ].sort((a, b) => a.at - b.at);
    const twice = merged.every((t) => t.lines.length === 2);
    const n = teachers.length;

    return (
      <Modal
        busy={phase === "sending"}
        title={TITLE}
        onClose={onClose}
        widthClass="max-w-[880px]"
        footer={
          phase === "sending" ? (
            <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
              <Spinner />
              <span className="text-sm text-nevo-near-black/60">
                Saving {plural(n, "teacher", "teachers")}…
              </span>
            </div>
          ) : (
            <>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-nevo-near-black/60">
                {open.length > 0 ? (
                  <>
                    <span>{`${plural(open.length, "subject", "subjects")} to settle before saving:`}</span>
                    {open.map((t) => (
                      <button
                        key={t.line}
                        type="button"
                        onClick={() => {
                          setSettling(t.line);
                          document
                            .getElementById(`import-row-${t.line}`)
                            ?.scrollIntoView?.({ block: "nearest" });
                        }}
                        className="cursor-pointer font-semibold text-nevo-navy hover:underline"
                      >
                        Row {t.line}
                      </button>
                    ))}
                  </>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  setRows([]);
                  setPhase("upload");
                }}
                className={GHOST_BTN}
              >
                Re-upload
              </button>
              <button
                type="button"
                onClick={send}
                disabled={open.length > 0 || n === 0}
                className={PRIMARY_BTN}
              >
                Save {plural(n, "teacher", "teachers")}
              </button>
            </>
          )
        }
      >
        {/* D19 step 2's summary: rows to teachers, joins, and what's to settle. */}
        <p data-import-lead className="m-0 text-[14.5px] leading-[1.6] text-nevo-near-black/72">
          {`${plural(rows.length, "row", "rows")} became ${plural(n, "teacher", "teachers")}.`}
          {merged.length > 0
            ? ` ${merged.length} ${merged.length === 1 ? "teacher appears" : "teachers appear"} ${twice ? "twice" : "more than once"} with one email, so ${merged.length === 1 ? "their rows are" : "each is"} joined into one.`
            : ""}
          {open.length > 0 ? (
            <span className="font-semibold text-nevo-navy">
              {` ${plural(open.length, "subject", "subjects")} to settle in their rows.`}
            </span>
          ) : null}
        </p>

        <div className="mt-4 overflow-hidden rounded-xl border border-nevo-near-black/10">
          <div
            className={cn(
              COLS,
              "bg-nevo-cream-elevated px-[18px] py-2.5 text-[11px] font-semibold tracking-[0.06em] text-nevo-near-black/60 uppercase",
            )}
          >
            <span>Row</span>
            <span>Teacher</span>
            <span>Teaches</span>
            <span>Status</span>
          </div>
          <div className="max-h-[50vh] overflow-auto">
            {items.map(({ at, teacher, row }, i) => {
              const top = i > 0 ? "border-t border-nevo-near-black/[0.06]" : "";
              if (row) {
                // A row our own parser refused: D19's "Left out".
                return (
                  <div key={`out-${at}`} data-import-row={at} className={cn("px-[18px] py-[13px]", top)}>
                    <div className={COLS}>
                      <span className="text-[13px] tabular-nums text-nevo-near-black/55">{row.line}</span>
                      <div className="min-w-0">
                        <div className="truncate text-[14.5px] font-semibold text-nevo-near-black/60">
                          {row.name || "—"}
                        </div>
                        <div className="truncate text-[12.5px] text-nevo-near-black/55">
                          {row.noEmail ? "No email in the file" : row.email}
                        </div>
                      </div>
                      <span className="min-w-0 text-[13px] text-nevo-near-black/55">
                        {[row.subject, row.className].filter(Boolean).join(" · ")}
                      </span>
                      <Status dot="bg-nevo-near-black/35">Left out</Status>
                    </div>
                    <p className="m-0 mt-2 pl-[58px] text-[13px] leading-[1.55] text-nevo-near-black/66">
                      {row.noEmail
                        ? `${NO_EMAIL} The rest of the file isn’t affected. Add the email to your file and import this row again, or add ${row.name} by hand.`
                        : row.error}
                    </p>
                  </div>
                );
              }
              const t = teacher!;
              const mine = open.filter((o) => t.teaches.some((x) => x.line === o.line));
              const being = t.teaches.find((x) => x.line === settling) ?? null;
              const others = being ? sameWords(being, open) : [];
              return (
                <div
                  key={t.key}
                  data-import-row={at}
                  className={cn("px-[18px] py-[13px]", top, being && "bg-nevo-navy/[0.04]")}
                >
                  <div className={COLS}>
                    <span className="text-[13px] tabular-nums text-nevo-near-black/55">{t.lines.join(", ")}</span>
                    <div className="min-w-0">
                      <div className="truncate text-[14.5px] font-semibold text-nevo-near-black">{t.row.name}</div>
                      <div className="truncate text-[12.5px] text-nevo-near-black/55">{t.row.email}</div>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      {t.teaches.map((x) => {
                        const name = subjectFor(x, answers, settled);
                        return name ? (
                          <span
                            key={x.line}
                            id={`import-row-${x.line}`}
                            className="inline-flex rounded-full bg-nevo-navy/[0.08] px-2.5 py-[3px] text-[12.5px] font-semibold text-nevo-navy"
                          >
                            {`${name} · ${x.className}`}
                          </span>
                        ) : (
                          <button
                            key={x.line}
                            id={`import-row-${x.line}`}
                            type="button"
                            onClick={() => setSettling(settling === x.line ? null : x.line)}
                            aria-expanded={settling === x.line}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-nevo-violet/24 px-2.5 py-[3px] text-[12.5px] text-nevo-navy hover:brightness-[0.97]"
                          >
                            <span className="text-nevo-near-black/60">From file:</span>{" "}
                            <span className="font-semibold">
                              {[x.subject, x.className].filter(Boolean).join(" · ")}
                            </span>{" "}
                            <span className="font-semibold underline">Settle</span>
                          </button>
                        );
                      })}
                    </div>
                    <div>
                      {mine.length > 0 ? (
                        <Status dot="bg-nevo-violet">Subject to settle</Status>
                      ) : t.lines.length > 1 ? (
                        <>
                          <span className="text-[13px] font-semibold text-nevo-navy">
                            {`Merged · rows ${andList(t.lines)}`}
                          </span>
                          <div className="text-[12px] text-nevo-near-black/55">Same email, so one teacher</div>
                        </>
                      ) : (
                        <Status dot="bg-nevo-navy">Ready</Status>
                      )}
                    </div>
                  </div>
                  {being ? (
                    <div className="mt-3 pl-[58px]">
                      <SubjectPicker
                        id={`settle-${being.line}`}
                        listLabel={`Subject for row ${being.line}`}
                        size="sm"
                        value={settled[being.line] ? [settled[being.line]] : []}
                        onChange={(next) => settle(being, next[next.length - 1] ?? null)}
                        subjects={school ?? []}
                      />
                      {others.length > 0 ? (
                        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px] text-nevo-near-black/72">
                          <input
                            type="checkbox"
                            checked={alsoOthers}
                            onChange={(e) => setAlsoOthers(e.target.checked)}
                            className="size-4 cursor-pointer accent-nevo-navy"
                          />
                          {alsoLine(others, being.subject)}
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    );
  }

  // ------------------------------------------------------------- UPLOAD ---
  return (
    <Modal
      title={TITLE}
      subtitle="Upload a CSV with your roster. We'll create one invite for each teacher."
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className={cn(GHOST_BTN, "flex-1")}
        >
          Cancel
        </button>
      }
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) readFile(file);
        }}
        className={cn(
          "flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
          dragging
            ? "border-nevo-navy bg-nevo-navy/[0.06]"
            : "border-nevo-near-black/18 hover:bg-nevo-near-black/[0.03]",
        )}
      >
        <span className="text-[15px] font-semibold text-nevo-near-black">
          Drop CSV here or click to browse
        </span>
        <span className="text-[13px] text-nevo-near-black/55">
          Maximum {MAX_ROWS} rows
        </span>
      </button>

      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) readFile(file);
          e.target.value = "";
        }}
      />

      {fatal ? (
        <p className="mt-3 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-navy">
          {fatal}
        </p>
      ) : null}

      <button
        type="button"
        onClick={downloadTemplate}
        className="mt-4 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:opacity-75"
      >
        Download CSV template
      </button>

      {/* D19 step 1: the template's own rows, and how they're read. */}
      <div className="mt-3 overflow-x-auto rounded-[10px] border border-nevo-near-black/10">
        <table data-template-example className="w-full border-collapse text-left text-[12.5px]">
          <thead className="bg-nevo-cream-elevated text-nevo-near-black/60">
            <tr>
              {TEMPLATE_ROWS[0].map((h) => (
                <th key={h} className="px-2.5 py-1.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TEMPLATE_ROWS.slice(1).map((r, i) => (
              <tr key={i} className="border-t border-nevo-near-black/[0.07] text-nevo-near-black/75">
                {r.map((c, j) => (
                  <td key={j} className="px-2.5 py-1.5 whitespace-nowrap">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[13px] leading-[1.55] text-nevo-near-black/62">
        One row for each subject a teacher takes in each class, so a teacher
        with three appears three times. Rows join into one teacher by email,
        never by name.
      </p>
    </Modal>
  );
}
