"use client";

import Link from "next/link";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTeacherClasses } from "@/hooks/useTeacherClasses";
import { useTeacherHome } from "@/hooks/useTeacherHome";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { SCHOOL_LINE } from "@/lib/mocks/teacherClasses";
import { cn } from "@/lib/utils";

/**
 * My Classes list (C05 / `Nevo Teacher Classes` frame). Desktop: a 3-column
 * grid of class cards with the summary row under a divider. Tablet: cards
 * stack to one column as horizontal rows (name + meta left, summary right).
 * No classes yet renders the calm empty state - assignment is the admin's job,
 * never a dead end.
 *
 * Data is live-first via useTeacherClasses, and a real class is never
 * dressed in a fixture: live classes render as their own cards (name + class
 * code) linking to their real id, and the fixture cards appear only when
 * there is no live list at all - in which case the page says so.
 */

function SummaryDot({ tone }: { tone: "glance" | "ok" }) {
  return (
    <span
      className={cn(
        "size-[9px] shrink-0 rounded-full",
        tone === "glance"
          ? "bg-nevo-violet"
          : "bg-nevo-navy/30",
      )}
    />
  );
}

export function ClassesList() {
  const { classes, liveClasses, sample, live, loading } = useTeacherClasses();
  /**
   * HEADCOUNT, from the one read that carries it.
   *
   * `AssignedClassResponse` - what this list is built from - has no
   * studentCount, so the live card said "Synced from your school" where the
   * sample card beside it said "28 students". The count IS on the wire:
   * `ClassLearningPulseResponse.studentCount` is a required integer on
   * `GET /api/v1/teachers/me/home`, keyed by the same `classId`.
   *
   * That is a second request on this page, because `useLiveQuery` has no cache
   * or in-flight dedupe, so the home read this page would otherwise not make is
   * genuinely extra. One request for a number on every card is the right trade;
   * the alternative is `classStudents()` per class, which is N.
   *
   * Deliberately NOT gated on the home read succeeding: a class simply missing
   * from the pulse keeps the old line rather than showing a wrong number.
   */
  const { pulse } = useTeacherHome();
  const headcounts = new Map(pulse.map((p) => [p.classId, p.studentCount]));
  const identity = useCurrentUser();

  if (classes.length === 0 && liveClasses.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 xl:p-12">
        <div className="flex max-w-[380px] flex-col items-center text-center xl:max-w-[400px]">
          <div className="flex size-20 items-center justify-center rounded-[20px] bg-nevo-cream-elevated text-nevo-violet shadow-elevation-1 xl:size-[88px]">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="xl:size-10">
              <circle cx="9" cy="8" r="3" />
              <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
              <path d="M17 6.5a3 3 0 0 1 0 6" />
              <path d="M18.5 20a6.5 6.5 0 0 0-3.2-5.6" />
            </svg>
          </div>
          <h1 className="mt-6 text-[21px] font-semibold tracking-[-0.01em] text-nevo-near-black xl:mt-[26px] xl:text-[22px]">
            Your classes will appear here once assigned
          </h1>
          <p className="mt-[11px] text-[15.5px] leading-[1.6] text-nevo-near-black/66 xl:mt-3 xl:text-base">
            This usually happens before your first sign-in. If it&rsquo;s
            taking a while, your school admin can set it up.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[1000px]">
        <h1 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
          My Classes
        </h1>
        {/* The real school from `users/me`; the fixture line, term and all,
            belongs only to the designed screens. Absent beats invented.
            `!loading` is load-bearing, not defensive: `live` is false while the
            read is in flight as well as after it fails, so without it a real
            teacher watched "Corona Secondary School · Second term" sit under
            their own heading for the whole window - 1.0-5.6s on this backend -
            before their school replaced it. That is the exact flash
            `useTeacherClasses.loading` was added for, and this was the one
            consumer still reading `live` alone. */}
        {(identity?.school ?? (!live && !loading && SCHOOL_LINE)) && (
          <p className="mt-[7px] text-sm text-nevo-near-black/60 xl:mt-2 xl:text-[15px]">
            {identity?.school ?? SCHOOL_LINE}
          </p>
        )}

        {/* Loading is not failure and is not the designed screen: hold the
            window with skeletons rather than three invented classes. */}
        {loading && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[132px] animate-pulse rounded-[12px] bg-nevo-cream-elevated"
              />
            ))}
          </div>
        )}

        {/* Sample data must never pass for a roster: if the live list didn't
            arrive, say so plainly rather than letting fixtures stand in
            silently. */}
        {sample && (
          <div className="mt-3.5 flex max-w-[560px] items-start gap-2.5 rounded-[10px] bg-nevo-violet/14 px-[14px] py-3">
            <span className="mt-px shrink-0 text-nevo-navy">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8h.01M11 12h1v4h1" />
              </svg>
            </span>
            <span className="text-[13.5px] leading-[1.5] text-nevo-near-black/78">
              We couldn&rsquo;t reach your school just now, so these are sample
              classes.
            </span>
          </div>
        )}

        {/* Desktop grid */}
        <div className="mt-6 hidden grid-cols-3 gap-4 xl:grid">
          {!loading && classes.length > 0 && (
            <SampleRegion kind="teacher:classes-list">
              {classes.map((c) => (
                <Link
                  key={c.id}
                  href={`/teacher/classes/${c.id}`}
                  className="flex cursor-pointer flex-col rounded-[12px] bg-nevo-cream-elevated p-6 shadow-elevation-1 transition-[filter,transform] hover:brightness-[0.985] active:scale-[0.99]"
                >
                  <span className="text-[19px] font-semibold tracking-[-0.01em] text-nevo-near-black">
                    {c.name}
                  </span>
                  <span className="mt-[5px] text-[13.5px] text-nevo-near-black/60">
                    {c.subjects}
                  </span>
                  <span className="mt-0.5 text-[13.5px] text-nevo-near-black/50">
                    {c.count} students
                  </span>
                  <div className="mt-[18px] flex items-center gap-[9px] border-t border-nevo-near-black/8 pt-4">
                    <SummaryDot tone={c.summaryTone} />
                    <span className="text-sm text-nevo-near-black/72">
                      {c.summary}
                    </span>
                  </div>
                </Link>
              ))}
            </SampleRegion>
          )}
          {liveClasses.map((a) => (
            <Link
              key={a.assignmentId}
              href={`/teacher/classes/${a.classId}`}
              className="flex cursor-pointer flex-col rounded-[12px] bg-nevo-cream-elevated p-6 shadow-elevation-1 transition-[filter,transform] hover:brightness-[0.985] active:scale-[0.99]"
            >
              <span className="text-[19px] font-semibold tracking-[-0.01em] text-nevo-near-black">
                {a.className}
              </span>
              <span className="mt-[5px] text-[13.5px] text-nevo-near-black/60">
                {headcounts.has(a.classId)
                  ? `${headcounts.get(a.classId)} ${headcounts.get(a.classId) === 1 ? "student" : "students"}`
                  : "Synced from your school"}
              </span>
            </Link>
          ))}
        </div>

        {/* Tablet: stacked horizontal cards */}
        <div className="mt-5 flex flex-col gap-3 xl:hidden">
          {!loading && classes.length > 0 && (
            <SampleRegion kind="teacher:classes-list">
              {classes.map((c) => (
                <Link
                  key={c.id}
                  href={`/teacher/classes/${c.id}`}
                  className="flex cursor-pointer items-center justify-between gap-4 rounded-[12px] bg-nevo-cream-elevated px-[22px] py-5 shadow-elevation-1 transition-[filter,transform] hover:brightness-[0.985] active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <span className="text-[17px] font-semibold text-nevo-near-black">
                      {c.name}
                    </span>
                    <div className="mt-1 text-[13px] text-nevo-near-black/60">
                      {c.subjects} · {c.count} students
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <SummaryDot tone={c.summaryTone} />
                    <span className="text-[13.5px] text-nevo-near-black/70">
                      {c.summary}
                    </span>
                  </div>
                </Link>
              ))}
            </SampleRegion>
          )}
          {liveClasses.map((a) => (
            <Link
              key={a.assignmentId}
              href={`/teacher/classes/${a.classId}`}
              className="flex cursor-pointer items-center justify-between gap-4 rounded-[12px] bg-nevo-cream-elevated px-[22px] py-5 shadow-elevation-1 transition-[filter,transform] hover:brightness-[0.985] active:scale-[0.99]"
            >
              <div className="min-w-0">
                <span className="text-[17px] font-semibold text-nevo-near-black">
                  {a.className}
                </span>
                {/* C05 tablet: the count sits on the line under the name. */}
                <div className="mt-1 text-[13px] text-nevo-near-black/60">
                  {headcounts.has(a.classId)
                    ? `${headcounts.get(a.classId)} ${headcounts.get(a.classId) === 1 ? "student" : "students"}`
                    : "Synced from your school"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
