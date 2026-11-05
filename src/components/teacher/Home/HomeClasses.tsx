"use client";

import Link from "next/link";
import { useClassSummaries } from "@/hooks/useClassSummaries";
import { useTeacherClasses } from "@/hooks/useTeacherClasses";
import {
  homeSummary,
  SummaryDot,
  summaryTone,
} from "@/components/teacher/shared/ClassSummary";
import { ReadFailed } from "@/components/teacher/shared/ReadFailed";
import { classesOnce } from "@/lib/classes/classesOnce";
import { HOME_CLASSES } from "@/lib/mocks/teacherHome";

/**
 * Home's class trio (C03), driven by the teacher's real classes when a
 * session has them: one card per class, its subjects, and the status line the
 * class page's own counts give (`useClassSummaries`). A class that couldn't be
 * counted keeps a quiet line rather than a status nobody read.
 *
 * ONE CARD PER CLASS. Since SCRUM-194 an assignment is per subject, so a
 * teacher who takes a class for two subjects saw it twice, as two identical
 * cards. `classesOnce` folds them, and the subjects line names both.
 *
 * "Never sees three classes that aren't theirs" was not true while the read
 * was IN FLIGHT. The hook returns fixtures for `data === null`, which covers
 * loading as well as failure, and this component read neither flag - so every
 * load showed JSS 2A, JSS 2B and SSS 1 Sciences, with invented headcounts, to
 * whoever was signed in. Skeletons now hold that window, and a failed read
 * says so instead of standing in for it.
 */
export function HomeClasses() {
  const { classes, liveClasses, sample, loading } = useTeacherClasses();
  const byClass = classesOnce(liveClasses);
  const summaries = useClassSummaries(byClass.map((c) => c.classId));

  if (loading) {
    return (
      <div className="mt-3.5 flex flex-wrap gap-3 xl:mt-4 xl:gap-3.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="min-w-[180px] flex-1 animate-pulse rounded-[12px] bg-nevo-cream-elevated px-[18px] py-4 xl:px-[22px] xl:py-5"
          >
            <div className="h-[17px] w-24 rounded bg-nevo-cream-inset" />
            <div className="mt-2 h-3 w-16 rounded bg-nevo-cream-inset" />
            <div className="mt-4 h-3 w-28 rounded bg-nevo-cream-inset" />
          </div>
        ))}
      </div>
    );
  }

  if (sample) {
    // With a way to try again (Lydia, SCRUM-200, 28 Oct), not a line alone.
    return (
      <ReadFailed
        title="We couldn’t load your classes just now"
        body="They haven’t gone anywhere. Try again in a moment."
        className="mt-3.5 xl:mt-4"
      />
    );
  }

  return (
    <div className="mt-3.5 flex flex-wrap gap-3 xl:mt-4 xl:gap-3.5">
      {classes.map((c) => {
        const copy = HOME_CLASSES.find((h) => h.name === c.name);
        return (
          <Link
            key={c.id}
            href={`/teacher/classes/${c.id}`}
            className="min-w-[180px] flex-1 cursor-pointer rounded-[12px] bg-nevo-cream-elevated px-[18px] py-4 shadow-elevation-1 transition-[filter] hover:brightness-[0.985] xl:px-[22px] xl:py-5"
          >
            <span className="text-[15.5px] font-semibold text-nevo-near-black xl:text-[17px]">
              {c.name}
            </span>
            <div className="mt-[3px] text-[12px] text-nevo-near-black/55 xl:mt-1 xl:text-[13px]">
              {c.subjects}
            </div>
            <div className="mt-3 flex items-center gap-2 xl:mt-3.5 xl:gap-[9px]">
              <SummaryDot
                tone={(copy?.glance ?? c.summaryTone === "glance") ? "glance" : "ok"}
              />
              <span className="text-[12.5px] text-nevo-near-black/70 xl:text-[13.5px]">
                <span className="xl:hidden">
                  {copy?.statusShort ?? c.summary}
                </span>
                <span className="hidden xl:inline">
                  {copy?.status ?? c.summary}
                </span>
              </span>
            </div>
          </Link>
        );
      })}

      {byClass.map((c) => {
        const counts = summaries.counts.get(c.classId);
        return (
          <Link
            key={c.classId}
            href={`/teacher/classes/${c.classId}`}
            className="min-w-[180px] flex-1 cursor-pointer rounded-[12px] bg-nevo-cream-elevated px-[18px] py-4 shadow-elevation-1 transition-[filter] hover:brightness-[0.985] xl:px-[22px] xl:py-5"
          >
            <span className="text-[15.5px] font-semibold text-nevo-near-black xl:text-[17px]">
              {c.className}
            </span>
            <div className="mt-[3px] text-[12px] text-nevo-near-black/55 xl:mt-1 xl:text-[13px]">
              {/* No class code anywhere (design reference, 30 Sep): a child
                  joins with the school code and their own ID, so a class code
                  here names something no one can use. An assignment made
                  before subjects has none to name. */}
              {c.subjects.length > 0 ? c.subjects.join(" · ") : "Assigned to you"}
            </div>
            {counts ? (
              <div className="mt-3 flex items-center gap-2 xl:mt-3.5 xl:gap-[9px]">
                <SummaryDot tone={summaryTone(counts, false)} />
                <span className="text-[12.5px] text-nevo-near-black/70 xl:text-[13.5px]">
                  <span className="xl:hidden">{homeSummary(counts, true)}</span>
                  <span className="hidden xl:inline">{homeSummary(counts)}</span>
                </span>
              </div>
            ) : summaries.loading ? (
              <div className="mt-3 h-3 w-24 animate-pulse rounded bg-nevo-cream-inset xl:mt-3.5" />
            ) : (
              <div className="mt-3 text-[12.5px] text-nevo-near-black/50 xl:mt-3.5 xl:text-[13.5px]">
                Synced from your school
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
