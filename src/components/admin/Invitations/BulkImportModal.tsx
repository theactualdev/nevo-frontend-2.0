"use client";

import { useRef, useState } from "react";
import type { AdminClass } from "@/lib/api/classes";
import {
  invitesApi,
  type BulkInviteResult,
  type InviteRole,
} from "@/lib/api/invites";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  GHOST_BTN,
  Modal,
  PRIMARY_BTN,
  Spinner,
} from "../Roster/primitives";
import {
  MAX_ROWS,
  TEMPLATE,
  parseInviteCsv,
  toDraft,
  type ParsedRow,
} from "./csv";
import { confirmedSent, needsManualDelivery } from "./deliveryCopy";
import { LinkHandout } from "./LinkHandout";
import { RejectedRows } from "./RejectedRows";

/**
 * D19 bulk import: upload, read, preview, send, confirm.
 *
 * PARTIAL SEND IS CORRECT HERE, and it is worth being explicit because the
 * other spec in this area says the opposite. SCRUM-40 claims CSV import is
 * all-or-nothing, "matching SCRUM-79" - but D19 IS the SCRUM-79 surface, and
 * it draws "3 valid, 3 with issues", "You can send invites for the valid rows
 * now. Fix the CSV and re-upload to catch the rest", and a confirmation
 * reading "3 invites sent · 3 rows skipped due to errors". The API agrees:
 * `POST /api/v1/invites/bulk` returns `{created, rejected}`. Frame and backend
 * against a secondhand summary in a different ticket, so partial send ships.
 *
 * The preview is the point of step 2. Every row is checked against the
 * school's own classes BEFORE anything is sent, and each problem row carries a
 * plain reason in violet - never red, per D19's own note on tone.
 *
 * The confirmation counts come from the RESPONSE, not from our tally: the
 * backend rejects rows we cannot anticipate (a duplicate against people
 * already invited, say), and reporting our own optimistic number would tell a
 * school it invited people it did not.
 *
 * AND THE CONFIRMATION READS `deliveryStatus`, WHICH IT DID NOT.
 * The title said "N invites sent" over a navy tick for every created row. A
 * comment below this one used to assert that the bulk response "carries no
 * delivery state at all"; it is wrong, and it justified the claim for a week.
 * `created` is an array of full `InvitationResponse`, each carrying
 * `deliveryStatus` AND `token`.
 *
 * That matters because `email_not_configured` is a live condition here - the
 * spec defines it as "the invitation exists and its link is valid, but nobody
 * was emailed, so the caller has to deliver it another way". A school with no
 * mail set up imports 200 staff on day one, every invite is created, none is
 * emailed, and the console says "200 invites sent". The tokens to recover with
 * were in hand on that very response and were dropped when this modal
 * unmounted, and no other screen in the console builds a join link. The
 * school's entire staff never gets in.
 */

type Phase = "upload" | "reading" | "preview" | "sending" | "done" | "failed";

const CELL = "px-3 py-2.5 text-[13px] text-nevo-near-black/75";

export function BulkImportModal({
  role,
  classes,
  onClose,
  onSent,
}: {
  role: InviteRole;
  classes: AdminClass[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [result, setResult] = useState<BulkInviteResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const isStudent = role === "student";
  const noun = isStudent ? "students" : "teachers";
  const title = isStudent ? "Import students" : "Import teachers";

  const valid = rows.filter((r) => !r.error);
  const broken = rows.filter((r) => r.error);

  const readFile = (file: File) => {
    setPhase("reading");
    setFatal(null);
    file
      .text()
      .then((text) => {
        const outcome = parseInviteCsv(text, role, classes);
        if (outcome.fatal) {
          setFatal(outcome.fatal);
          setRows([]);
          setPhase("upload");
          return;
        }
        setRows(outcome.rows);
        setPhase("preview");
      })
      .catch(() => {
        setFatal("We couldn't read that file. Is it a .csv?");
        setPhase("upload");
      });
  };

  const send = () => {
    setPhase("sending");
    invitesApi
      .bulk(valid.map((r) => toDraft(r, role)))
      .then((res) => {
        setResult(res);
        setPhase("done");
        onSent();
      })
      .catch(() => setPhase("failed"));
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE[role]], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nevo-${noun}-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ------------------------------------------------------------ READING ---
  if (phase === "reading") {
    return (
      <Modal title={title} onClose={onClose} footer={<span />}>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Spinner />
          <p className="m-0 text-[15px] font-semibold text-nevo-near-black">
            Reading your file
          </p>
          <p className="m-0 text-sm text-nevo-near-black/62">
            Checking each row against your classes. This takes a moment.
          </p>
        </div>
      </Modal>
    );
  }

  // --------------------------------------------------------------- DONE ---
  if (phase === "done" && result) {
    const skipped = result.rejected.length + broken.length;
    /*
     * Which of the created invitations definitely reached nobody. "Sent" is a
     * claim about an email; "created" is a claim about a record, and only the
     * second one is safe when the backend says it emailed no one.
     */
    /*
     * TWO REASONS A LINK IS NEEDED, and they are told apart because one is a
     * certainty and one is an absence. `email_not_configured` means nobody was
     * emailed; a NULL status means the read carried no answer, which the
     * earlier fix let fall into the confident "sent" arm.
     */
    const notEmailed = result.created.filter((i) =>
      needsManualDelivery(i.deliveryStatus),
    );
    const unconfirmed = result.created.filter(
      (i) =>
        !confirmedSent(i.deliveryStatus) &&
        !needsManualDelivery(i.deliveryStatus),
    );
    const undelivered = [...notEmailed, ...unconfirmed];
    const allDelivered = undelivered.length === 0;
    const n = result.created.length;
    return (
      <Modal
        title={
          allDelivered
            ? `${n} ${n === 1 ? "invite" : "invites"} sent`
            : `${n} ${n === 1 ? "invitation" : "invitations"} created`
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
        {skipped > 0 ? (
          <>
            {isStudent && result.created.length > 0 ? (
              <p className="mt-4 text-center text-[14.5px] leading-[1.6] text-nevo-near-black/72">
                Each student&rsquo;s parent contact was recorded; your school
                still needs to record consent for them.
              </p>
            ) : null}
            {/*
              * CL-06. This was ONE SENTENCE - "N rows were skipped due to
              * errors" - over data that already carried every row number and
              * every reason. `BulkInvitationResponse.rejected` is
              * `{row, reason}` with both required, and our own parser produces
              * `{line, error}`; the screen added the two lengths together and
              * threw the rest away one step from the render. An admin
              * importing thirty classes was handed a count and left to find
              * the four themselves.
              */}
            <RejectedRows
              broken={broken}
              rejected={result.rejected}
              isStudent={isStudent}
              filename={`nevo-${noun}-not-imported.csv`}
            />
          </>
        ) : isStudent && result.created.length > 0 ? (
          /* Was: "Each parent has been sent a consent request." The bulk
             response is `{created, rejected}` and carries no delivery state at
             all, so this had even less behind it than the single-invite claim.
             See `deliveryCopy.ts` - nothing in the product requests consent. */
          <p className="mt-4 text-center text-[14.5px] leading-[1.6] text-nevo-near-black/72">
            {/* The SIBLING of the branch above, and it kept the claim that
                branch was corrected for. SCRUM-80: an unconfirmed consent is
                the school's paperwork and the learner proceeds - only a
                withdrawal stops anything. Fixing one branch and not the one
                three lines below it is the pattern this console keeps
                repeating. */}
            Each student&rsquo;s parent contact was recorded; your school still
            needs to record consent for them.
          </p>
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

        {/*
          * A SECOND LIST OF THE SAME ROWS USED TO SIT HERE, as
          * `Row {r.row + 2}` - the very guess `RejectedRows` above refuses to
          * make, since the contract documents no base for `row`. So every
          * server-rejected row appeared twice, two numbers apart, and at least
          * one of the two pointed the admin at the wrong line.
          */}
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
    return (
      <Modal
        busy={phase === "sending"}
        title={title}
        onClose={onClose}
        widthClass="max-w-[720px]"
        footer={
          phase === "sending" ? (
            <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
              <Spinner />
              <span className="text-sm text-nevo-near-black/60">
                Sending {valid.length}{" "}
                {valid.length === 1 ? "invite" : "invites"}…
              </span>
            </div>
          ) : (
            <>
              <p className="m-0 flex-1 text-[13px] leading-[1.5] text-nevo-near-black/60">
                {valid.length} valid, {broken.length} with issues.
                {broken.length > 0
                  ? " You can send the valid rows now, then fix the CSV and re-upload to catch the rest."
                  : ""}
              </p>
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
                disabled={valid.length === 0}
                className={PRIMARY_BTN}
              >
                Send {valid.length} {valid.length === 1 ? "invite" : "invites"}
              </button>
            </>
          )
        }
      >
        <p className="m-0 text-[14.5px] leading-[1.6] text-nevo-near-black/72">
          Found {rows.length} {rows.length === 1 ? noun.slice(0, -1) : noun} in
          your file.
          {broken.length > 0 ? (
            <>
              {" "}
              <span className="font-semibold text-nevo-navy">
                {broken.length} {broken.length === 1 ? "row has" : "rows have"}{" "}
                issues.
              </span>
            </>
          ) : null}
        </p>

        <div className="mt-4 max-h-[46vh] overflow-auto rounded-xl border border-nevo-near-black/10">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-nevo-cream-elevated">
              <tr className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-nevo-near-black/50">
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Class</th>
                <th className="px-3 py-2.5">
                  {isStudent ? "Student email" : "Email"}
                </th>
                {isStudent ? (
                  <th className="px-3 py-2.5">Parent email</th>
                ) : null}
                <th className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.line}
                  className="border-t border-nevo-near-black/[0.07]"
                >
                  <td className={CELL}>{r.name || "—"}</td>
                  <td className={CELL}>{r.className || "—"}</td>
                  <td className={CELL}>{r.email || "—"}</td>
                  {isStudent ? (
                    <td className={CELL}>{r.parentContact || "—"}</td>
                  ) : null}
                  <td className="px-3 py-2.5">
                    {r.error ? (
                      <span className="text-[13px] font-semibold text-nevo-navy">
                        {r.error}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-nevo-navy/12 px-2.5 py-0.5 text-[12px] font-semibold text-nevo-navy">
                        Ready
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    );
  }

  // ------------------------------------------------------------- UPLOAD ---
  return (
    <Modal
      title={title}
      subtitle={
        isStudent
          ? "Upload a CSV with your roster. We'll create an invite for each row and record each parent's contact."
          : "Upload a CSV with your roster. We'll create an invite for each row."
      }
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

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={downloadTemplate}
          className="cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:opacity-75"
        >
          Download CSV template
        </button>
        <span className="text-[12.5px] text-nevo-near-black/55">
          Columns:{" "}
          {isStudent
            ? "name, class, student_email, parentContact"
            : "name, email, class"}
        </span>
      </div>
    </Modal>
  );
}
