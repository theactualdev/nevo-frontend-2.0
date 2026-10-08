"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  classesApi,
  type AdminClass,
  type ClassTeacher,
} from "@/lib/api/classes";
import { PROVIDER_LABELS, ssoApi, type SsoStatus } from "@/lib/api/sso";
import { timeAgo } from "@/lib/relativeTime";
import { yearGroupLabel, yearGroupOptions, yearGroupOrder } from "@/lib/constants/yearGroups";
import { groupByYear, sessionLabel } from "./groupByYear";
import { cn } from "@/lib/utils";
import {
  CARD,
  GHOST_BTN,
  NoTeacherYet,
  PausedNote,
  PRIMARY_BTN,
  PlusIcon,
  ROW_DIVIDER,
} from "../Roster/primitives";
import { useSetupGate } from "@/hooks";
import { BulkClassSheet } from "./BulkClassSheet";
import { ClassFormSheet } from "./ClassFormSheet";
import { NoAccess, failureKind } from "../NoAccess";

/**
 * D5 Classes - the list a school actually works from.
 *
 * SCRUM-40 calls this the operational backbone, and its "done when" is the
 * thing to hold onto: a class with NO TEACHER must be identifiable without
 * opening a row. That single requirement is why this screen fetches more than
 * the list endpoint gives it - see the teacher-label note below.
 *
 * Everything here is enrolment fact. No lesson content, no scores, no
 * adaptation reasoning - the spec calls that boundary structural rather than a
 * matter of taste, and the roster routes honour it.
 *
 * `GET /api/v1/classes` CARRIES ITS TEACHERS NOW (24 Sep) - SCRUM-40's
 * `teachers:[{id,name,role}]` on each row - so the page is one request. It
 * used to resolve each row's teachers with its own `classes/{id}/teachers`
 * call after the list painted; see `teacherLabel` below.
 *
 * DONE, AND IT WAS NEVER BACKEND'S. This note read "no endpoint reports when
 * the SSO roster last synced", then was corrected to "the gap is only that
 * THIS screen does not make that call" - and then sat there, corrected and
 * unacted, while the source line went on saying "your school's connected
 * roster" and naming neither the provider nor the sync.
 *
 * `GET /api/v1/admin/sso/status` carries `provider` and
 * `lastSuccessfulSyncAt`, both required, both declared in `lib/api/sso.ts`.
 * The call is made below, in its own effect, and SCRUM-40's line reads as
 * written: "These classes come from your school's Microsoft 365 roster. Last
 * synced 20 minutes ago."
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

/**
 * Who teaches this class: "Ms. Adeyemi +1" - the primary leads the label, the
 * rest are a count.
 *
 * TAKES THE ROW'S OWN `teachers` NOW. It used to take the result of a
 * per-class `classTeachers` request - one per row, fired after the list
 * painted - because `GET /classes` carried only a count. Backend added the
 * named list on 24 Sep out of the same query that produces the count, so the
 * page costs one request again.
 *
 * `ClassTeacher.name` is a single string rather than the first/last/email
 * triple the assignment route returns, so there is nothing to compose and
 * nothing to fall back through.
 */
function teacherLabel(teachers: ClassTeacher[]): string {
  const named = [...teachers].sort((a, b) =>
    a.role === b.role ? 0 : a.role === "primary" ? -1 : 1,
  );
  const first = named[0];
  const name = first.name.trim() || "Assigned teacher";
  return named.length > 1 ? `${name} +${named.length - 1}` : name;
}

export function ClassesView() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  /** D24 / D01b: reachable, and visibly locked while setup is unfinished. */
  const { writesPaused } = useSetupGate();
  const [bulking, setBulking] = useState(false);
  /** The row that just arrived, so it can be marked for one shot. */
  const [justCreated, setJustCreated] = useState<string | null>(null);
  /**
   * The provider and its last sync, for the SSO source line.
   *
   * Its own read, deliberately late and deliberately optional: the line above
   * the table is a nicety, and `sso/status` 404s for a school with no provider
   * - which is most of them. It must never hold the list.
   */
  const [sso, setSso] = useState<SsoStatus | null>(null);

  const load = useCallback((includeArchived: boolean) => {
    classesApi
      .list(includeArchived)
      .then((rows) => {
        setClasses(rows);
        setPhase("ready");
        /*
         * ~~One `classTeachers` request per row, fired after the list
         * painted.~~ GONE, 24 Sep. The names arrive on the list itself now,
         * so there is no second wave and no placeholder to settle.
         *
         * Fine at fourteen classes and wrong at four hundred, which is what
         * the ask to backend said. They built it from the same query that
         * produces the count.
         */
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
  }, []);

  useEffect(() => {
    load(showArchived);
  }, [load, showArchived]);

  useEffect(() => {
    ssoApi
      .status()
      .then(setSso)
      .catch(() => setSso(null));
  }, []);

  /** The check badge is a one-shot, per SCRUM-40's "then rest". */
  useEffect(() => {
    if (!justCreated) return;
    const t = setTimeout(() => setJustCreated(null), 2600);
    return () => clearTimeout(t);
  }, [justCreated]);

  const retry = () => {
    setPhase("loading");
    load(showArchived);
  };

  /*
   * THE HEADER COUNTS WHAT THE SCHOOL IS ACTUALLY RUNNING.
   *
   * "Show archived" refetches with `includeArchived`, so `classes` grows - and
   * the header used to sum straight across it. Pressing a filter to LOOK at
   * last year's groups changed the school's own figures underneath the
   * proprietor: "14 classes - 312 students" became "17 classes - 383 students",
   * with nothing saying why or that 71 of those children are in classes nobody
   * teaches any more.
   *
   * The toggle reveals rows. It does not change what the school has.
   */
  const activeClasses = classes.filter((c) => !c.archivedAt);
  const archivedCount = classes.length - activeClasses.length;
  const studentTotal = activeClasses.reduce((sum, c) => sum + c.studentCount, 0);

  // SSO owns the class list where the school signed in with a provider, so
  // Create is ABSENT rather than disabled - the spec is specific that manual
  // controls go away instead of greying out.
  //
  // ACTIVE classes only, for the same reason as the header above: one archived
  // manually-made class from before the provider was connected would flip this
  // `every` the moment somebody pressed "Show archived", and Create would
  // reappear on a school that is not allowed to use it.
  const ssoSourced =
    activeClasses.length > 0 &&
    activeClasses.every((c) => c.source === "roster_sync");

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return classes
      .filter((c) => (year ? c.yearGroup === year : true))
      .filter((c) =>
        needle
          ? c.name.toLowerCase().includes(needle) ||
            (yearGroupLabel(c.yearGroup) ?? "").toLowerCase().includes(needle)
          : true,
      )
      .sort(
        (a, b) =>
          yearGroupOrder(a.yearGroup) - yearGroupOrder(b.yearGroup) ||
          a.name.localeCompare(b.name),
      );
  }, [classes, search, year]);

  const filtering = Boolean(search.trim() || year);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[900px]">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="m-0 text-[28px] font-semibold tracking-[-0.018em] text-nevo-near-black">
              Classes
            </h2>
            {phase === "ready" ? (
              <p className="mt-1.5 text-[14.5px] text-nevo-near-black/60">
                {activeClasses.length}{" "}
                {activeClasses.length === 1 ? "class" : "classes"} &middot;{" "}
                {studentTotal} {studentTotal === 1 ? "student" : "students"}
                {archivedCount > 0 ? (
                  <>
                    {" "}
                    &middot; plus {archivedCount} archived
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          {/*
            * `activeClasses`, matching `ssoSourced` above. Gating on the raw
            * list while `ssoSourced` reads the active one makes this fail OPEN:
            * an SSO school whose last live synced class is archived has
            * `activeClasses.length === 0`, which short-circuits `ssoSourced` to
            * false, and Create - which SCRUM-97 says must be ABSENT - comes
            * back. Introduced by the fix that narrowed `ssoSourced`.
            */}
          {phase === "ready" && activeClasses.length > 0 && !ssoSourced ? (
            <>
              {/*
                * CL-04 sits BESIDE create, behind the same `!ssoSourced` guard.
                * A school whose classes come from the directory must not be
                * offered either door (SCRUM-97), and a bulk one would be the
                * worse of the two to leave standing - it makes a dozen at once.
                */}
              <button
                type="button"
                onClick={() => setBulking(true)}
                disabled={writesPaused}
                className={GHOST_BTN}
              >
                Add several
              </button>
              <button
                type="button"
                onClick={() => setCreating(true)}
                disabled={writesPaused}
                className={PRIMARY_BTN}
              >
                <PlusIcon />
                Add a class
              </button>
            </>
          ) : null}
        </div>

        <PausedNote className="mt-3" />

        {phase === "loading" ? <div className={cn(CARD, "mt-[22px] h-[320px] animate-pulse")} /> : null}

        {phase === "denied" ? (
          <NoAccess what="your classes" />
        ) : phase === "failed" ? (
          <div className={cn(CARD, "mt-[22px] px-[26px] py-7")}>
            <h3 className="text-[17px] font-semibold text-nevo-near-black">
              We couldn&rsquo;t load your classes
            </h3>
            <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
              Nothing has changed - this is only about showing you the list. Try
              again in a moment.
            </p>
            <button type="button" onClick={retry} className={cn(PRIMARY_BTN, "mt-5")}>
              Try again
            </button>
          </div>
        ) : null}

        {phase === "ready" && classes.length === 0 && !showArchived ? (
          <EmptyState
            onCreate={() => setCreating(true)}
            paused={writesPaused}
            onShowArchived={() => setShowArchived(true)}
          />
        ) : null}

        {phase === "ready" && (classes.length > 0 || showArchived) ? (
          <>
            {ssoSourced ? (
              /*
               * SCRUM-40's line, verbatim where we can be: "These classes come
               * from your school's Microsoft 365 roster. Last synced 20 minutes
               * ago."
               *
               * It said "connected roster" and named nothing, on the strength
               * of a TODO(api) in this file's own docblock claiming no endpoint
               * reported the last sync. That was wrong when it was written:
               * `GET /api/v1/admin/sso/status` carries both the provider and
               * `lastSuccessfulSyncAt`, `lib/api/sso.ts` declares them, and
               * SsoView renders them. This screen simply never made the call.
               *
               * Both halves are still conditional on having been told: a status
               * we could not read leaves the generic sentence rather than
               * inventing a provider, and a school that has never completed a
               * sync gets no "last synced" clause rather than "never".
               */
              <p className="mt-[18px] text-[13.5px] leading-[1.55] text-nevo-near-black/62">
                {sso
                  ? `These classes come from your school's ${PROVIDER_LABELS[sso.provider]} roster.`
                  : "These classes come from your school's connected roster."}
                {sso?.lastSuccessfulSyncAt
                  ? ` Last synced ${timeAgo(sso.lastSuccessfulSyncAt)}.`
                  : ""}{" "}
                <Link href="/admin/sso" className="font-semibold text-nevo-navy hover:opacity-75">
                  IT &amp; SSO
                </Link>
              </p>
            ) : null}

            <div className="mt-[18px] flex flex-wrap items-center gap-3">
              <label className={SEARCH_BAR}>
                <SearchIcon />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search classes"
                  aria-label="Search classes"
                  className="min-w-0 flex-1 border-none bg-transparent outline-none"
                />
              </label>

              <label className={cn(FILTER_PILL, "relative")}>
                <span className="sr-only">Filter by year group</span>
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="cursor-pointer appearance-none bg-transparent pr-1 outline-none"
                >
                  <option value="">All years</option>
                  {yearGroupOptions().map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-pressed={showArchived}
                className={cn(
                  FILTER_PILL,
                  showArchived && "border-nevo-navy bg-nevo-navy/[0.06] text-nevo-navy",
                )}
              >
                {showArchived ? "Showing archived" : "Show archived"}
              </button>
            </div>

            {/*
              * "2026/27 session · grouped by year group", the frame's caption.
              * The session is read from the classes themselves and is absent
              * when they disagree or none of them says - never computed from
              * the clock. See `sessionLabel`.
              */}
            <p className="mt-[18px] mb-0 text-[12.5px] text-nevo-near-black/55">
              {sessionLabel(visible)
                ? `${sessionLabel(visible)} session · grouped by year group`
                : "Grouped by year group"}
            </p>

            <div className={cn(CARD, "mt-2")}>
              {/*
                * NO YEAR COLUMN. The 20 Sep restructure replaced it with
                * headings - the year is stated once per group instead of
                * repeated on every row, which is what makes thirty classes
                * scannable. See `groupByYear`.
                */}
              <div className="grid grid-cols-[1.6fr_90px_1.2fr] gap-4 border-b border-nevo-near-black/8 bg-nevo-near-black/[0.03] px-6 py-[13px] text-[11.5px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase max-xl:grid-cols-[1.4fr_70px_1fr] max-xl:px-[18px]">
                <span>Class</span>
                <span>Students</span>
                <span>Teachers</span>
              </div>

              {visible.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className="m-0 text-sm text-nevo-near-black/62">
                    {filtering ? "No classes match that." : "No archived classes."}
                  </p>
                  {filtering ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setYear("");
                      }}
                      className="mt-3 cursor-pointer text-sm font-semibold text-nevo-navy hover:opacity-75"
                    >
                      Clear search
                    </button>
                  ) : null}
                </div>
              ) : (
                /*
                 * GROUPED, with a heading per year. The divider logic moved
                 * inside a section: the last row of a group butts against the
                 * next heading, so it keeps its border, and only the very last
                 * row in the list loses one.
                 */
                groupByYear(visible).map((section, si, all) =>
                  section.classes.map((c, i) => {
                  const assigned = c.teachers;
                  const lastSection = si === all.length - 1;
                  const lastRow = i === section.classes.length - 1;
                  return (
                    <div key={c.id}>
                      {i === 0 ? (
                        <h3 className="m-0 border-b border-nevo-near-black/8 bg-nevo-near-black/[0.015] px-6 py-2 text-[12px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase max-xl:px-[18px]">
                          {section.label}
                        </h3>
                      ) : null}
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/classes/${c.id}`)}
                      className={cn(
                        "grid w-full cursor-pointer grid-cols-[1.6fr_90px_1.2fr] items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-nevo-navy/[0.03] max-xl:grid-cols-[1.4fr_70px_1fr] max-xl:px-[18px] max-xl:py-[13px]",
                        /* Only the very last row in the list loses its
                            divider; a group's last row butts against the next
                            heading and keeps one. */
                        !(lastSection && lastRow) && ROW_DIVIDER,
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[15.5px] font-semibold text-nevo-near-black">
                          {c.name}
                        </span>
                        {/*
                          * The section, which D05 draws beside the name.
                          * `section` arrived on every class and was discarded
                          * until 23 Sep - the type simply did not declare it.
                          * Absent rather than blank when a class has none.
                          */}
                        {c.section ? (
                          <span className="mt-0.5 block text-[12.5px] text-nevo-near-black/55">
                            {c.section}
                          </span>
                        ) : null}
                        {c.archivedAt ? (
                          <span className="mt-1 inline-flex items-center rounded-full bg-nevo-violet/24 px-[9px] py-0.5 text-[11px] font-semibold text-nevo-navy">
                            Archived
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm text-nevo-near-black/66">{c.studentCount}</span>
                      <span className="flex min-w-0 items-center gap-2">
                        {justCreated === c.id ? (
                          <span
                            aria-label="Just created"
                            className="flex size-[18px] flex-none items-center justify-center rounded-full bg-nevo-navy text-[11px] font-bold text-nevo-cream motion-safe:animate-nevo-pop"
                          >
                            ✓
                          </span>
                        ) : null}
                        {/*
                          * NO PLACEHOLDER STATE ANY MORE. It existed because
                          * the names arrived after the list; now they arrive
                          * with it, so an empty array means what it says.
                          */}
                        {assigned.length === 0 ? (
                          <NoTeacherYet />
                        ) : (
                          <span className="truncate text-sm text-nevo-near-black/78">
                            {teacherLabel(assigned)}
                          </span>
                        )}
                      </span>
                    </button>
                    </div>
                  );
                  }),
                )
              )}
            </div>
          </>
        ) : null}
      </div>

      {creating ? (
        <ClassFormSheet
          onClose={() => setCreating(false)}
          /*
           * SCRUM-40's Created state: "Sheet closes, new row enters, nevoPop
           * check badge on the row for one shot, then rest. No toast pile-up."
           *
           * This navigated away to the new class's detail page instead, which
           * is a different thing entirely: an admin creating three classes in
           * a row was taken off the list every time and had to find their way
           * back, and never once saw the list they had just changed.
           */
          onSaved={(id) => {
            setCreating(false);
            setJustCreated(id);
            load(showArchived);
          }}
        />
      ) : null}

      {/*
        * The sheet fetches its own class list, with archived included -
        * see its docblock. Passing this view's `classes` would inherit the
        * "Show archived" toggle and silently miss archived collisions.
        *
        * No `justCreated` badge, deliberately. That is SCRUM-40's one-shot
        * for a single arriving row; a dozen rows pulsing at once is noise,
        * and the sheet's own result already names what was made.
        */}
      {bulking ? (
        <BulkClassSheet
          onClose={() => setBulking(false)}
          onCreated={() => {
            setBulking(false);
            load(showArchived);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The first-run state. Two ways forward, because a school that has connected a
 * provider should not be typing its roster in by hand.
 */
function EmptyState({
  onCreate,
  paused,
  onShowArchived,
}: {
  onCreate: () => void;
  paused: boolean;
  onShowArchived: () => void;
}) {
  return (
    /*
     * The same definite height as `Teachers/TeachersView`'s empty state, and
     * for the same reason: `flex-1` is inert here - the two wrappers above are
     * plain blocks - so this panel centred inside its own content box and
     * rendered directly under the heading. The design check raised it on
     * Teachers only; it is one file's fix in two files.
     */
    <div className="flex min-h-[52vh] flex-1 flex-col items-center justify-center py-16 text-center">
      <div className="max-w-[420px]">
        <Image
          src="/illustrations/empty-admin-classes.png"
          alt=""
          width={320}
          height={200}
          className="mx-auto mb-3 h-[200px] w-auto object-contain"
          priority
        />
        <h3 className="m-0 text-xl font-semibold text-nevo-near-black">No classes yet</h3>
        {/*
          * D05'S NEW EMPTY COPY, and the sentence that earns its place is the
          * last one: a school setting up doubts it has done this right, and
          * nothing else on the screen tells them an empty class is normal.
          *
          * The second action was "Import from SSO". Provider sign-in is
          * deferred - every school is manual - and the route that actually
          * builds classes now is the roster upload, which reads class names
          * out of the file. So it points there.
          */}
        <p className="mt-2.5 text-[15px] leading-[1.6] text-nevo-near-black/64">
          Add a class by hand, or upload your roster and Nevo builds your
          classes from it. Either way works &ndash; a class with no students in
          it yet is perfectly normal.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {/* The roster upload stays open: it is how a school in setup gets
              classes at all. Only building one by hand pauses. */}
          <button type="button" onClick={onCreate} disabled={paused} className={PRIMARY_BTN}>
            <PlusIcon />
            Add a class
          </button>
          <Link href="/admin/roster" className={GHOST_BTN}>
            Create from a staff or student file
          </Link>
        </div>
        {/*
          * A SCHOOL WHOSE CLASSES ARE ALL ARCHIVED lands here too - the list
          * is fetched without archived classes - and the "Show archived"
          * toggle only exists in the list view. So last year's classes were
          * unreachable, while the duplicate-name note told the admin to
          * restore one. Offered every time: if there are none, the archived
          * view says so.
          */}
        <button
          type="button"
          onClick={onShowArchived}
          className="mt-5 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
        >
          Show archived classes
        </button>
      </div>
    </div>
  );
}
