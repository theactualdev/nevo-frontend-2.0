"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { classesApi, type AdminClass } from "@/lib/api/classes";
import { studentsApi, type AdminStudentRow } from "@/lib/api/students";
import { yearGroupLabel } from "@/lib/constants/yearGroups";
import { cn } from "@/lib/utils";
import {
  ConsentPill,
  mayRequestConsent,
  withoutRecordedConsent,
} from "./ConsentPill";
import { consentRequestLine, useConsentRequests } from "./useConsentRequests";
import { AddStudentSheet } from "./AddStudentSheet";
import { statusLabel, studentStatus } from "./status";
import { NoAccess, failureKind } from "../NoAccess";
import {
  Avatar,
  CARD,
  GHOST_BTN,
  PausedNote,
  PRIMARY_BTN,
  PlusIcon,
  ROW_DIVIDER,
} from "../Roster/primitives";
import { useSetupGate } from "@/hooks";

/**
 * D7 Students - the school roster.
 *
 * ============================================================================
 * WHAT THIS SCREEN CANNOT DO YET, AND WHY IT IS BUILT ANYWAY
 * ============================================================================
 * D7's stated purpose is "the roster with consent front and centre", and as of
 * 7 Sep it can be. The list row now carries a typed `consent` object - status,
 * actor, timestamp and channel - in the four states SCRUM-40 asks for, so the
 * column, the count clause and the row action arrive together rather than being
 * guessed at.
 *
 * What this is still NOT derived from is `status`. An active account is a
 * different fact from a parent having agreed, and a school reading this screen
 * is reading a legal position. A row whose read did not carry consent renders
 * "Unknown", never "Not sent" - see `ConsentPill`.
 */

type Phase = "loading" | "ready" | "failed" | "denied";

const SEARCH_BAR =
  "flex h-[42px] w-full max-w-[340px] flex-1 items-center gap-[9px] rounded-[10px] border-[1.5px] border-nevo-near-black/10 bg-nevo-cream-elevated px-[15px] text-[14.5px] text-nevo-near-black outline-none transition-colors placeholder:text-nevo-near-black/50 focus-within:border-nevo-navy";

const FILTER_PILL =
  "flex h-[42px] cursor-pointer items-center gap-[7px] rounded-[10px] border-[1.5px] border-nevo-near-black/16 px-[14px] text-[13.5px] font-medium text-nevo-near-black/72 transition-colors hover:bg-nevo-navy/[0.06]";

function SearchIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none text-nevo-near-black/50"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </svg>
  );
}

export function StudentsView() {
  const router = useRouter();
  const { stateFor: consentStateFor, send: sendConsent } = useConsentRequests();
  const params = useSearchParams();
  const [phase, setPhase] = useState<Phase>("loading");
  const [students, setStudents] = useState<AdminStudentRow[]>([]);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [classOf, setClassOf] = useState<Record<string, string>>({});
  /**
   * Whether the per-class reads that fill the Class column have all SETTLED.
   * The column used to show a loading bar until a student's class arrived -
   * so a child in no active class, or in a class whose read failed, showed
   * one forever. `partial` means at least one read failed, so an empty cell
   * is unknown rather than "no class".
   */
  const [classReads, setClassReads] = useState<"pending" | "done" | "partial">("pending");
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState(params.get("class") ?? "");
  /*
   * D07's second filter pill, "Any consent", and the reason the screen exists.
   * SCRUM-40 draws it beside the class pill; the roster shipped with the class
   * one alone, so the one question this page is opened to answer - which
   * families have replied - could be read row by row and never narrowed to.
   */
  const [consent, setConsent] = useState("");
  const [adding, setAdding] = useState(false);
  /** D24 / D01b: enrolling pauses while setup is unfinished. */
  const { writesPaused } = useSetupGate();
  /** Set by student detail when a record was erased - see its `onErased`. */
  const erased = params.get("erased");
  const [includeInactive, setIncludeInactive] = useState(false);

  const load = useCallback((cid: string, inactive: boolean) => {
    Promise.all([
      studentsApi.list({
        classId: cid || undefined,
        includeInactive: inactive,
      }),
      classesApi.list(),
    ])
      .then(([rows, cls]) => {
        setStudents(rows);
        setClasses(cls);
        setPhase("ready");
        // One request per class builds studentId -> classId. Skipped entirely
        // when the view is already narrowed to a single class.
        if (cid) {
          setClassOf(Object.fromEntries(rows.map((r) => [r.id, cid])));
          setClassReads("done");
          return;
        }
        setClassReads("pending");
        Promise.allSettled(
          cls.map((c) =>
            studentsApi
              .list({ classId: c.id, includeInactive: inactive })
              .then((inClass) =>
                setClassOf((prev) => {
                  const next = { ...prev };
                  inClass.forEach((s) => {
                    next[s.id] = c.id;
                  });
                  return next;
                }),
              ),
          ),
        ).then((results) =>
          setClassReads(
            results.some((r) => r.status === "rejected") ? "partial" : "done",
          ),
        );
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
  }, []);

  useEffect(() => {
    load(classId, includeInactive);
  }, [load, classId, includeInactive]);

  /** Everyone on the roster who is not deactivated - what the header counts. */
  const enrolled = useMemo(
    () => students.filter((s) => studentStatus(s.status) !== "deactivated"),
    [students],
  );

  const classById = useMemo(
    () => new Map(classes.map((c) => [c.id, c])),
    [classes],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students
      .filter((s) => {
        if (!consent) return true;
        /*
         * NO "no record at all" OPTION, and there was one for a day.
         *
         * It filtered on `!s.consent`, which the contract now rules out:
         * `consent` is required and non-null on `StudentSummaryResponse`, and
         * a student nobody has written to comes back `not_sent` rather than
         * with the object missing. The option could therefore never match a
         * row - a filter that always returns nothing, which is worse than no
         * filter, because it reads as a school with nothing in that state.
         */
        return s.consent.status === consent;
      })
      .filter((s) =>
        needle
          ? s.name.toLowerCase().includes(needle) ||
            (s.loginIdentifier ?? "").toLowerCase().includes(needle)
          : true,
      );
  }, [students, search, consent]);

  const filtering = Boolean(
    search.trim() || classId || includeInactive || consent,
  );

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[960px]">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="m-0 text-[28px] font-semibold tracking-[-0.018em] text-nevo-near-black">
              Students
            </h2>
            {phase === "ready" ? (
              <p className="mt-1.5 text-[14.5px] text-nevo-near-black/60">
                {/* THE SCHOOL'S FIGURES DO NOT MOVE when "Show deactivated"
                    is pressed to LOOK at leavers - the same defect the Classes
                    header had with archived classes. Both counts are over
                    enrolled students only. */}
                {enrolled.length} enrolled
                {/* Was "N can't begin lessons yet", which is not true of
                    `not_sent` or `pending` - see `withoutRecordedConsent`.
                    This says what the school's own records show, which is the
                    thing an admin can actually act on. */}
                {withoutRecordedConsent(enrolled) > 0 ? (
                  <>
                    {" · "}
                    <span className="text-nevo-navy">
                      {withoutRecordedConsent(enrolled)}
                      {" without recorded consent"}
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          {/*
            * D07/D24b: "Enrol a student" opens the add sheet here. It used to
            * leave for the invitation flow, which is a different mechanism -
            * the child accepts a link - and is still reachable from its own
            * place in the sidebar.
            */}
          {phase === "ready" && students.length > 0 ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={writesPaused}
              className={PRIMARY_BTN}
            >
              <PlusIcon />
              Enrol a student
            </button>
          ) : null}
        </div>

        <PausedNote className="mt-3" />

        {phase === "loading" ? (
          <div className={cn(CARD, "mt-[22px] h-[320px] animate-pulse")} />
        ) : null}

        {phase === "denied" ? (
          <NoAccess what="your students" />
        ) : phase === "failed" ? (
          <div className={cn(CARD, "mt-[22px] px-[26px] py-7")}>
            <h3 className="text-[17px] font-semibold text-nevo-near-black">
              We couldn&rsquo;t load your students
            </h3>
            <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
              Nothing has changed - this is only about showing you the roster.
              Try again in a moment.
            </p>
            <button
              type="button"
              onClick={() => {
                setPhase("loading");
                load(classId, includeInactive);
              }}
              className={cn(PRIMARY_BTN, "mt-5")}
            >
              Try again
            </button>
          </div>
        ) : null}

        {phase === "ready" && students.length === 0 && !filtering ? (
          <EmptyState onEnrol={() => setAdding(true)} paused={writesPaused} />
        ) : null}

        {adding ? (
          <AddStudentSheet
            onClose={() => setAdding(false)}
            onAdded={() => {
              setAdding(false);
              load(classId, includeInactive);
            }}
          />
        ) : null}

        {phase === "ready" && (students.length > 0 || filtering) ? (
          <>
            <div className="mt-[18px] flex flex-wrap items-center gap-3">
              <label className={SEARCH_BAR}>
                <SearchIcon />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search students"
                  aria-label="Search students"
                  className="min-w-0 flex-1 border-none bg-transparent outline-none"
                />
              </label>

              <label className={FILTER_PILL}>
                <span className="sr-only">Filter by class</span>
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  className="cursor-pointer appearance-none bg-transparent outline-none"
                >
                  <option value="">All classes</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={FILTER_PILL}>
                <span className="sr-only">Filter by consent</span>
                <select
                  value={consent}
                  onChange={(e) => setConsent(e.target.value)}
                  className="cursor-pointer appearance-none bg-transparent outline-none"
                >
                  <option value="">Any consent</option>
                  <option value="confirmed">Recorded</option>
                  <option value="pending">Asked, no reply yet</option>
                  <option value="not_sent">Not asked yet</option>
                  <option value="withdrawn">Withdrawn</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => setIncludeInactive((v) => !v)}
                aria-pressed={includeInactive}
                className={cn(
                  FILTER_PILL,
                  includeInactive &&
                    "border-nevo-navy bg-nevo-navy/[0.06] text-nevo-navy",
                )}
              >
                {includeInactive ? "Showing deactivated" : "Show deactivated"}
              </button>
            </div>

            {/* The erasure confirmation, read off the navigation that brought
                the admin back here. One plain line, above the roster: the
                record is gone and there is nothing to undo, so this states it
                and nothing more.

                IT SAYS WHAT THE ERASE MODAL SAID. This read "Nothing of it is
                kept", one screen after the modal told the same admin "We're
                required to keep a small amount of it for a statutory period".
                The false one is the reassuring one, which is the direction a
                school would repeat to a parent. */}
            {erased ? (
              <p className="m-0 mt-4 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-navy">
                {`${erased}'s record has been erased. Only the small amount the law requires is kept, and that goes too once its statutory period ends.`}
              </p>
            ) : null}

            <div className={cn(CARD, "mt-[18px]")}>
              {/* Four tracks, matching the rows. Consent sits BEFORE status
                  deliberately: it is the question D07 exists to answer, and the
                  two are easy to conflate when read side by side. */}
              <div className="grid grid-cols-[1.5fr_1fr_112px_112px_136px] gap-4 border-b border-nevo-near-black/8 bg-nevo-near-black/[0.03] px-6 py-[13px] text-[11.5px] font-semibold uppercase tracking-[0.05em] text-nevo-near-black/50">
                <span>Student</span>
                <span>Class</span>
                <span>Consent</span>
                <span>Status</span>
                <span className="sr-only">Consent request</span>
              </div>

              {visible.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className="m-0 text-sm text-nevo-near-black/62">
                    No students match that.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setClassId("");
                      setConsent("");
                      setIncludeInactive(false);
                    }}
                    className="mt-3 cursor-pointer text-sm font-semibold text-nevo-navy hover:opacity-75"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                visible.map((s, i) => {
                  const cls = classOf[s.id]
                    ? classById.get(classOf[s.id])
                    : undefined;
                  // Three states, not two - an invited child is not a
                  // deactivated one. See ./status.
                  const st = studentStatus(s.status);
                  const deactivated = st === "deactivated";
                  return (
                    /*
                     * A CONTAINER, not one big button, so D07's "Send
                     * request" can be a real sibling. Nesting it inside the
                     * row button would be invalid HTML and its click would
                     * open the student instead of sending anything.
                     *
                     * The button keeps the first four cells and takes its
                     * tracks from the parent through `grid-cols-subgrid`, so
                     * the columns still line up with the header and the row
                     * click still opens the record from anywhere in them.
                     */
                    <div
                      key={s.id}
                      className={cn(
                        "grid grid-cols-[1.5fr_1fr_112px_112px_136px] items-center gap-4 transition-colors hover:bg-nevo-navy/[0.03]",
                        i < visible.length - 1 && ROW_DIVIDER,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => router.push(`/admin/students/${s.id}`)}
                        className="col-span-4 grid cursor-pointer grid-cols-subgrid items-center gap-4 py-[15px] pl-6 text-left"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Avatar name={s.name} size={34} />
                          <span className="min-w-0">
                            <span className="block truncate text-[15px] font-semibold text-nevo-near-black">
                              {s.name}
                            </span>
                            {s.loginIdentifier ? (
                              <span className="block truncate text-[13px] text-nevo-near-black/60">
                                {s.loginIdentifier}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="min-w-0 truncate text-sm text-nevo-near-black/66">
                          {cls ? (
                            <>
                              {cls.name}
                              {yearGroupLabel(cls.yearGroup) ? (
                                <span className="text-nevo-near-black/45">
                                  {" "}
                                  · {yearGroupLabel(cls.yearGroup)}
                                </span>
                              ) : null}
                            </>
                          ) : classReads === "pending" ? (
                            <span
                              aria-hidden="true"
                              className="block h-3.5 w-20 rounded bg-nevo-near-black/[0.07]"
                            />
                          ) : classReads === "partial" ? (
                            // A read failed: this cell is unknown, not empty.
                            <span
                              className="text-nevo-near-black/40"
                              title="We couldn't read every class just now"
                            >
                              &mdash;
                            </span>
                          ) : (
                            // Every read answered and none has this child:
                            // not in any active class (archived classes are
                            // not listed).
                            <span className="text-nevo-near-black/45">No active class</span>
                          )}
                        </span>
                        <span className="flex">
                          <ConsentPill consent={s.consent} />
                        </span>
                        <span className="flex">
                          <span
                            className={cn(
                              "inline-flex flex-none items-center rounded-full px-3 py-1 text-[12.5px] font-semibold text-nevo-navy",
                              deactivated
                                ? "bg-nevo-near-black/[0.07] text-nevo-near-black/60"
                                : st === "invited"
                                  ? "bg-nevo-violet/24"
                                  : "bg-nevo-navy/12",
                            )}
                          >
                            {statusLabel(s.status)}
                          </span>
                        </span>
                      </button>
                      <span className="flex justify-end pr-6">
                        {mayRequestConsent(s.consent) ? (
                          <button
                            type="button"
                            onClick={() => sendConsent(s.id)}
                            disabled={consentStateFor(s.id).kind === "sending"}
                            className="cursor-pointer text-[13px] font-semibold text-nevo-navy transition-opacity hover:opacity-75 disabled:cursor-wait disabled:opacity-55"
                          >
                            {consentStateFor(s.id).kind === "sending"
                              ? "Sending…"
                              : consentStateFor(s.id).kind === "done"
                                ? "Sent"
                                : "Send request"}
                          </button>
                        ) : null}
                      </span>
                      {consentRequestLine(consentStateFor(s.id), s.name) &&
                      consentStateFor(s.id).kind !== "sending" ? (
                        <p
                          role="status"
                          className="col-span-5 m-0 px-6 pb-3 text-[13px] leading-[1.5] text-nevo-near-black/62"
                        >
                          {consentRequestLine(consentStateFor(s.id), s.name)}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            {/*
              * D07's footer line, and SCRUM-40 says to keep it by name: "Keep
              * this: it is where admins learn how parent accounts come into
              * being." It was missing entirely, so the one place the product
              * explains where a parent account comes from said nothing.
              *
              * The count is of what is on screen against what came back, so
              * it stays true under every filter above it.
              */}
            <p className="m-0 mt-3 text-[12.5px] leading-[1.5] text-nevo-near-black/55">
              {`Showing ${visible.length} of ${students.length} · a parent account is created automatically once consent is confirmed.`}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ onEnrol, paused }: { onEnrol: () => void; paused: boolean }) {
  return (
    /*
     * Same definite height as the Classes and Teachers empty states: `flex-1`
     * is inert here too, so this centred inside its own content box and sat
     * directly under the heading. Three files, one defect.
     */
    <div className="flex min-h-[52vh] flex-1 flex-col items-center justify-center py-16 text-center">
      <div className="max-w-[440px]">
        <Image
          src="/illustrations/empty-admin-students.png"
          alt=""
          width={320}
          height={200}
          className="mx-auto mb-3 h-[200px] w-auto object-contain"
          priority
        />
        <h3 className="m-0 text-xl font-semibold text-nevo-near-black">
          No students yet
        </h3>
        <p className="mt-2.5 text-[15px] leading-[1.6] text-nevo-near-black/64">
          Enrol your students one at a time, or upload your roster and Nevo
          adds them all. Each one gets their own way in.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={onEnrol} disabled={paused} className={PRIMARY_BTN}>
            <PlusIcon />
            Enrol a student
          </button>
          {/*
            * WAS "Import from SSO", pointing at the IT surface - which came
            * off the sidebar on 24 Sep because provider sign-in is deferred.
            * The same stale link the Classes empty state carried, fixed there
            * in the D05 tidy-up and missed here. D07 draws "Import a roster".
            */}
          <Link href="/admin/roster" className={GHOST_BTN}>
            Import a roster
          </Link>
        </div>
      </div>
    </div>
  );
}
