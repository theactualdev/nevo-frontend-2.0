"use client";

import Link from "next/link";
import { useTeacherClasses } from "@/hooks/useTeacherClasses";
import { HOME_CLASSES } from "@/lib/mocks/teacherHome";
import { cn } from "@/lib/utils";

/**
 * Home's class trio, driven by the teacher's real assignments when a session
 * has them. The per-class status line stays fixture copy (the backend serves
 * no summary yet), but the SET of classes is live, so a teacher never sees
 * three classes that aren't theirs. Assignments with no fixture behind them
 * render as quiet cards rather than being dropped or dressed up.
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
    return (
      <p className="mt-3.5 max-w-[560px] text-[13px] leading-[1.5] text-nevo-near-black/60 italic">
        We couldn&rsquo;t reach your school just now, so your classes
        aren&rsquo;t here. They haven&rsquo;t gone anywhere. Try again in
        a moment.
      </p>
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
              <span
                className={cn(
                  "size-[9px] shrink-0 rounded-full",
                  // Worth a glance is an outline (design, 12 Oct).
                  (copy?.glance ?? c.summaryTone === "glance")
                    ? "border-2 border-nevo-violet"
                    : "bg-nevo-navy/30",
                )}
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

      {liveClasses.map((a) => (
        <Link
          key={a.assignmentId}
          href={`/teacher/classes/${a.classId}`}
          className="min-w-[180px] flex-1 cursor-pointer rounded-[12px] bg-nevo-cream-elevated px-[18px] py-4 shadow-elevation-1 transition-[filter] hover:brightness-[0.985] xl:px-[22px] xl:py-5"
        >
          <span className="text-[15.5px] font-semibold text-nevo-near-black xl:text-[17px]">
            {a.className}
          </span>
          <div className="mt-[3px] text-[12px] text-nevo-near-black/55 xl:mt-1 xl:text-[13px]">
            {/* No class code anywhere (design reference, 30 Sep): a child
                joins with the school code and their own ID, so a class code
                here names something no one can use. */}
            Assigned to you
          </div>
          <div className="mt-3 text-[12.5px] text-nevo-near-black/50 xl:mt-3.5 xl:text-[13.5px]">
            Synced from your school
          </div>
        </Link>
      ))}
    </div>
  );
}
