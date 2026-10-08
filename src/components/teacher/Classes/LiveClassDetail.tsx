"use client";

import Link from "next/link";
import {
  OBSERVATION_COPY,
  observationCount,
} from "@/lib/constants/observations";
import { accountStatus, rosterMarker } from "@/lib/constants/accountStatus";
import { useTeacherFlags } from "@/hooks/useTeacherFlags";
import { useCallback, useState } from "react";
import { PinClearedDialog, RosterRowMenu } from "./RosterRowMenu";
import { useClassLessons } from "@/hooks/useClassLessons";
import type { AssignedClass } from "@/lib/api";
import {
  lastSeenLine,
  studentName,
  useClassRoster,
} from "@/hooks/useClassRoster";
import { cn } from "@/lib/utils";

/**
 * A class the school assigned, drawn from what the backend actually serves:
 * the assignment and - since 30 Aug - the real roster from
 * `GET /api/v1/classes/{class_id}/students`.
 *
 * NO CLASS CODE, since design's 30 Sep rulings. A child now signs in with the
 * school code and their own Student ID, and their roster row exists before
 * they arrive, so a class code joins nobody to anything. C12 (the QR) and C18
 * (the code screen) were deleted from the design that day; the button, its
 * dialog and the `/code` route went with them.
 *
 * What it still does not have is the intelligence layer. The fixture-backed
 * `ClassDetail` shows per-student chips, seats and "worth a glance" dots;
 * none of that has an endpoint, so these rows carry only what is real:
 * who is on the roster, whether Nevo has observed them yet, and when they
 * were last here.
 *
 * Rows link to the student's profile, which reads live since the student
 * endpoints were wired.
 *
 * `observations` and `seatContext` ARE drawn - see the roster rows below.
 * This docblock said they were not, for a week after they were built on
 * 15 Sep, which is the shape of stale note that gets a thing rebuilt: the
 * next reader believes the file over the screen.
 *
 * `observations` is `{pattern, count}` over a closed five-value enum
 * (backend, 3 Sep), so its contents are guaranteed by the schema rather than
 * by an assurance, and the phrasing for each pattern is ours - it lives in
 * `constants/observations.ts` so the two screens that show them cannot drift.
 *
 * CLEARING A FORGOTTEN PIN (SCRUM-216 / SCRUM-217, C05 on 1 Oct). Each row has
 * C05's menu - View profile, Clear PIN - beside the card rather than inside
 * it, since a button cannot sit inside a link. The login identifier is always
 * on the row now (SCRUM-133): it is how a child finds out their ID, by asking
 * their teacher, and it used to hide whenever the row had a seat.
 *
 * WHAT C05 DRAWS THAT THIS DOES NOT, and why. C05 redraws the row as a table -
 * Student, Student ID / Admission Number, Status - with no observation chips,
 * and keeps an Activity tab design struck on 16 Sep. Which roster wins is
 * design's call, so the C16b row stays and gains only what the three tickets
 * add. "Forgot PIN", a "PIN cleared" that survives a reload and "Ask an admin
 * about this" all need something the roster read does not carry yet.
 */
export function LiveClassDetail({ klass }: { klass: AssignedClass }) {
  /**
   * TWO TABS, NOT THREE. Design ruled on 16 Sep: the Lessons tab ships because
   * the library cannot be filtered by class, so nothing else answers "what has
   * this class been given". ACTIVITY IS OUT either way, in design's words "a
   * per-class activity feed is a surveillance surface by default and we have
   * nothing that needs it" - so the sample screen next door, which still drew
   * three, was changed to match rather than this one grown to meet it.
   */
  const [tab, setTab] = useState<"roster" | "lessons">("roster");
  /** Whose row menu is open, by student id. One at a time. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenuFor(null), []);
  /**
   * Children whose PIN this teacher cleared, this visit. The roster read has
   * no field for it, so the row's "PIN cleared" lasts until a reload - true
   * while it shows, because the server has just said so.
   */
  const [cleared, setCleared] = useState<Set<string>>(() => new Set());
  const [clearedName, setClearedName] = useState<string | null>(null);
  const role = klass.role === "co_teacher" ? "Co-teacher" : "Primary teacher";
  const { students, loading, failed } = useClassRoster(klass.classId);
  const observed = students.filter(
    (s) => s.profileStatus === "observed",
  ).length;
  /*
   * C16b's two markers. The attention flags are already read on Home; here they
   * are keyed by student so a roster row can say "Worth a glance" without a
   * second call. A flag the teacher has for a student in ANOTHER class simply
   * does not match, which is the behaviour we want.
   */
  const { flags, failed: flagsFailed } = useTeacherFlags();
  const flagFor = new Map(flags.map((f) => [f.studentId, f]));

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[880px]">
        <Link
          href="/teacher/classes"
          className="inline-flex cursor-pointer items-center gap-[7px] text-sm text-nevo-near-black/60 transition-transform active:scale-[0.99]"
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
          My Classes
        </Link>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
              {klass.className}
            </h1>
            <span className="mt-[5px] block text-[14.5px] text-nevo-near-black/60">
              {students.length > 0
                ? `${role} · ${students.length} ${students.length === 1 ? "student" : "students"}`
                : `${role} · Synced from your school`}
            </span>
          </div>
        </div>


        {/* Roster / Lessons. Read-only on the Lessons side: design was explicit
            that "Library stays the only place a lesson is created". */}
        <div className="mt-6 flex gap-1.5" role="tablist" aria-label="Class views">
          {(["roster", "lessons"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "h-9 cursor-pointer rounded-[9px] px-3.5 text-[13.5px] font-medium capitalize transition-colors",
                tab === t
                  ? "bg-nevo-navy text-nevo-cream"
                  : "text-nevo-near-black/65 hover:bg-nevo-navy/8",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "roster" && loading && (
          <div className="mt-6 flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[68px] animate-pulse rounded-[12px] bg-nevo-cream-elevated"
              />
            ))}
          </div>
        )}

        {tab === "roster" && !loading && students.length > 0 && (
          <>
            <h3 className="mt-7 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:mt-8 xl:text-sm">
              Student observations
            </h3>
            {/* The markers come from the flags read. When it failed, every
                "Worth a glance" vanished with nothing saying so - a roster
                with no markers reads as a class with nothing worth a glance.
                Home's sentence for the same failure. */}
            {flagsFailed && (
              <p className="mt-2 max-w-[560px] text-[13px] leading-[1.5] text-nevo-near-black/55 italic">
                We couldn&rsquo;t read what needs your attention just now, so
                no one below is marked.
              </p>
            )}
            {/*
             * C16b's own line, leading the existing profile count rather than
             * stacked above it.
             *
             * WITHOUT "THIS WEEK", which the frame has. `lib/constants/
             * observations.ts` states the rule and the reason: "the roster
             * route declares no window and no cap, so 'this week' and 'in the
             * last 30 days' are claims the API has not made." Dating a set of
             * observations the contract does not date would be the console
             * inventing a fact about a named child. Raised with design.
             */}
            <p className="mt-2 max-w-[560px] text-[13px] leading-[1.5] text-nevo-near-black/60">
              {"What Nevo has noticed about each student. "}
              {observed === 0
                ? "Nobody here has been watched long enough for a learning profile yet. That starts with their first lesson."
                : `Nevo has a learning profile for ${observed} of ${students.length}. The rest build as they work.`}
            </p>
            {/* C05's line, over the rows that now carry Clear PIN. */}
            <p className="mt-1.5 max-w-[640px] text-[13px] leading-[1.5] text-nevo-near-black/60">
              If a child forgets their PIN, you can clear it and they choose a
              new one themselves. A deactivated learner can&rsquo;t sign in;
              your admin manages access.
            </p>
            <div className="mt-3.5 flex flex-col gap-2 xl:mt-4">
              {students.map((student, i) => {
                const href = `/teacher/students/${student.studentId}?class=${klass.classId}`;
                const firstName = student.firstName?.trim() || studentName(student);
                const marker = rosterMarker(student.status);
                // Account access comes first and replaces the rest (C05).
                const pinCleared =
                  !marker &&
                  cleared.has(student.studentId) &&
                  accountStatus(student.status) !== "deactivated";
                return (
                <div
                  key={student.studentId}
                  className={cn("relative", menuFor === student.studentId && "z-20")}
                >
                <Link
                  href={href}
                  className={cn(
                    "cursor-pointer transition-[filter] hover:brightness-[0.985]",
                    "flex flex-col rounded-[12px] bg-nevo-cream-elevated py-4 pr-14 pl-[18px] shadow-elevation-1 xl:flex-row xl:items-center xl:gap-4 xl:py-5 xl:pr-16 xl:pl-5",
                    student.profileStatus === "observed" &&
                      "border-l-[3px] border-nevo-violet",
                  )}
                >
                  <div className="flex min-w-0 items-baseline gap-1.5 xl:w-[36%] xl:shrink-0 xl:flex-col xl:gap-0">
                    <span className="truncate text-[15px] font-semibold text-nevo-near-black">
                      {studentName(student)}
                    </span>
                    {/* The login identifier, ALWAYS (SCRUM-133): it is how
                        a child finds out their ID - they ask their teacher.
                        It used to give way to `seatContext`, so a class with
                        seats showed nobody's ID. The seat sits beside it. */}
                    {(student.loginIdentifier || student.seatContext) && (
                      <span className="shrink-0 text-[12px] text-nevo-near-black/55 tabular-nums xl:mt-0.5">
                        <span className="xl:hidden">{"· "}</span>
                        {[student.loginIdentifier, student.seatContext]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 min-w-0 xl:mt-0 xl:flex-1">
                    {/*
                     * C16b, "What Nevo has noticed about each student this
                     * week." The payload has been arriving on every roster row
                     * since 3 Sep and was thrown away: `observations` is
                     * `{pattern, count}` over a closed five-value enum, and
                     * `seatContext` alongside it. The frame has been drawn the
                     * whole time.
                     *
                     * WORDING COMES FROM `lib/constants/observations.ts`, which
                     * says so itself: it is the only copy of these five strings,
                     * Zero-Tag governed, and guarded by a test that fails on
                     * trait vocabulary. A second set written here is how two
                     * wordings drift, and this screen is read by teachers about
                     * named children.
                     */}
                    {student.observations && student.observations.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {student.observations.map((o) => {
                          const copy = OBSERVATION_COPY[o.pattern];
                          if (!copy) return null;
                          const times = observationCount(o.pattern, o.count);
                          return (
                            /*
                             * The count is its own chip BESIDE the observation,
                             * never folded into its label. Design's ruling, and
                             * the reason is that "Went back over something · 7
                             * times" reads as a finding about the child even
                             * though neither half says so. `observationCount`
                             * now only answers for `completed_lessons`, so the
                             * second chip is good news or nothing.
                             */
                            <span key={o.pattern} className="contents">
                              <span
                                title={copy.body(student.firstName ?? "They")}
                                className="rounded-full bg-nevo-navy/8 px-2.5 py-1 text-[12.5px] whitespace-nowrap text-nevo-near-black/72"
                              >
                                {copy.title}
                              </span>
                              {times && (
                                <span className="rounded-full bg-nevo-navy/8 px-2.5 py-1 text-[12.5px] whitespace-nowrap text-nevo-near-black/55">
                                  {times}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-[13px] text-nevo-near-black/60">
                        {student.profileStatus === "observed"
                          ? "Learning profile building"
                          : "No profile yet"}
                      </span>
                    )}
                  </div>
                  {/*
                   * WHETHER THE CHILD CAN GET IN AT ALL.
                   *
                   * `status` has been on every roster row the whole time and was
                   * thrown away here, under a comment in `classes.ts` claiming
                   * the spec had no enum for it. It has one, closed at three.
                   *
                   * Design's ruling that this roster carries no consent column
                   * rested on the "Deactivated" pill telling a teacher why a
                   * child cannot get in - but that pill is on the ADMIN roster.
                   * This is the dependency that ruling left behind, and its
                   * whole brief is "no consent, no reason, just whether the
                   * child is active".
                   *
                   * It comes FIRST in this cluster because it changes how to
                   * read the rest of the row: an observation about a child who
                   * has been switched off is history, not a prompt to act.
                   *
                   * NEITHER COLOUR ON THIS ROW IS AVAILABLE. Violet is "has a
                   * learning profile" (the left border and the legend below),
                   * navy is "Sudden change". Admin draws this pill violet;
                   * here that would be a third meaning on a colour that already
                   * carries two. It is outlined and muted instead, so it reads
                   * as a state rather than competing with the attention markers
                   * next to it - and it says its word, like they do.
                   */}
                  {marker && (
                    <span className="mt-1.5 shrink-0 rounded-full border border-nevo-near-black/22 px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-nevo-near-black/62 xl:mt-0">
                      {marker}
                    </span>
                  )}
                  {pinCleared && (
                    <span className="mt-1.5 inline-flex shrink-0 items-center gap-[7px] self-start rounded-full bg-nevo-near-black/7 px-[13px] py-[5px] text-[13px] font-semibold whitespace-nowrap text-nevo-near-black/60 xl:mt-0 xl:self-auto">
                      <span className="size-[7px] shrink-0 rounded-full bg-nevo-near-black/30" aria-hidden />
                      PIN cleared &middot; new one not chosen yet
                    </span>
                  )}
                  {/*
                   * C16b's two markers, LABELLED rather than coloured.
                   *
                   * The frame carries "Worth a glance" as a soft-violet marker
                   * and "Sudden change" as a navy accent with a glyph. Violet
                   * is already spoken for on this row - the left border means
                   * "Nevo has a learning profile for this student", and the
                   * legend below the list says so. Two meanings on one colour
                   * on one row is the kind of thing nobody notices until a
                   * teacher acts on the wrong one, so these say their words.
                   * Colour-only status also fails anyone who cannot separate
                   * the two. Flagged to design.
                   *
                   * A flag for a student in ANOTHER of this teacher's classes
                   * simply does not match, which is what we want.
                   */}
                  {(() => {
                    // C05's precedence: account access first, then a cleared
                    // PIN, then attention - "each replaces the next rather
                    // than stacking". A switched-off child's flag is history,
                    // not a prompt.
                    if (marker || pinCleared) return null;
                    const flag = flagFor.get(student.studentId);
                    if (!flag) return null;
                    return (
                      <span
                        className={cn(
                          "mt-1.5 shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium whitespace-nowrap xl:mt-0",
                          flag.isSudden
                            ? "bg-nevo-navy text-nevo-cream"
                            : "bg-nevo-violet/22 text-nevo-navy",
                        )}
                      >
                        {flag.isSudden ? "Sudden change" : "Worth a glance"}
                      </span>
                    );
                  })()}
                  <span className="mt-1 shrink-0 text-[13px] whitespace-nowrap text-nevo-near-black/55 xl:mt-0">
                    {lastSeenLine(student)}
                  </span>
                </Link>
                <div className="absolute top-3 right-3 xl:top-0 xl:right-4 xl:bottom-0 xl:flex xl:items-center">
                  <RosterRowMenu
                    studentId={student.studentId}
                    firstName={firstName}
                    status={student.status}
                    profileHref={href}
                    open={menuFor === student.studentId}
                    up={students.length > 4 && i >= students.length - 4}
                    onToggle={() =>
                      setMenuFor((open) =>
                        open === student.studentId ? null : student.studentId,
                      )
                    }
                    onClose={closeMenu}
                    onCleared={() => {
                      setCleared((prev) => new Set(prev).add(student.studentId));
                      setMenuFor(null);
                      setClearedName(firstName);
                    }}
                  />
                </div>
                </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-[7px] text-[12px] text-nevo-near-black/55">
              <span className="size-2 shrink-0 rounded-full bg-nevo-violet" />
              Nevo has a learning profile for this student
            </div>
          </>
        )}

        {tab === "roster" && !loading && students.length === 0 && (
          <div className="mt-6 flex max-w-[620px] items-start gap-3.5 rounded-[12px] bg-nevo-cream-elevated px-[22px] py-5 shadow-elevation-1">
            <span className="mt-px shrink-0 text-nevo-navy">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8h.01M11 12h1v4h1" />
              </svg>
            </span>
            <div>
              <h3 className="text-[15.5px] font-semibold text-nevo-near-black xl:text-base">
                {failed
                  ? "We couldn’t load this class’s roster"
                  : "Nobody has joined this class yet"}
              </h3>
              <p className="mt-1.5 text-sm leading-[1.55] text-nevo-near-black/68 xl:text-[14.5px]">
                {failed
                  ? "Nothing has changed for your students. Try again in a moment."
                  : "Your students will appear here as your school adds them."}
              </p>
              {/* "Try again" with nothing to press. The class route's own
                  failure card has always had the button; this one did not. */}
              {failed && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-4 h-10 cursor-pointer rounded-[10px] border-[1.5px] border-nevo-navy/35 px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                >
                  Try again
                </button>
              )}
            </div>
          </div>
        )}
        {tab === "lessons" && <LessonsPanel classId={klass.classId} />}
      </div>

      {clearedName && (
        <PinClearedDialog
          firstName={clearedName}
          onDone={() => setClearedName(null)}
        />
      )}

    </div>
  );
}

/**
 * What this class has been given. Read-only, per design's 16 Sep ruling:
 * "a read-only list of lessons assigned to that class with status. No authoring
 * on that surface. Library stays the only place a lesson is created."
 *
 * So there is no assign control here and no row action. Rows link to the
 * lesson, which is where a teacher acts on it.
 */
function LessonsPanel({ classId }: { classId: string }) {
  const { lessons, loading, failed } = useClassLessons(classId);

  if (loading) {
    return (
      <div className="mt-5 flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[62px] animate-pulse rounded-[12px] bg-nevo-cream-elevated"
          />
        ))}
      </div>
    );
  }

  if (failed) {
    return (
      <p className="mt-5 text-sm leading-[1.55] text-nevo-near-black/68">
        We couldn&rsquo;t load what this class has been given. Nothing has
        changed for your students, so you can try again in a moment.
      </p>
    );
  }

  if (lessons.length === 0) {
    return (
      <p className="mt-5 text-sm leading-[1.55] text-nevo-near-black/68">
        Nothing has been set for this class yet. Lessons you assign from your
        library will appear here.
      </p>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-2">
      {lessons.map((l) => (
        <Link
          key={l.lessonId}
          href={`/teacher/lessons/${l.lessonId}`}
          className="flex cursor-pointer items-center justify-between gap-4 rounded-[12px] bg-nevo-cream-elevated px-[18px] py-4 shadow-elevation-1 transition-[filter] hover:brightness-[0.985]"
        >
          <div className="min-w-0">
            <span className="block truncate text-[15px] font-semibold text-nevo-near-black">
              {l.title}
            </span>
            <span className="mt-0.5 block text-[13px] text-nevo-near-black/60">
              {l.cancelled
                ? "Called off"
                : `${l.studentCount} ${l.studentCount === 1 ? "student" : "students"}`}
            </span>
          </div>
          {/*
           * Words, not a colour. The roster beside this already uses violet for
           * "has a learning profile", and a second meaning on one colour is how
           * a teacher acts on the wrong one.
           */}
          {l.opensAt && !l.cancelled && (
            <span className="shrink-0 rounded-[7px] border border-nevo-navy/25 px-2 py-1 text-[12px] text-nevo-near-black/65">
              Opens later
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
