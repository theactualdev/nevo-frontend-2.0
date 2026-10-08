import Link from "next/link";
import type {
  LessonDetailData,
  LessonStatus,
  LibraryLesson,
} from "@/lib/mocks/teacherLibrary";
import { cn } from "@/lib/utils";
import { LessonDetailActions } from "./LessonDetailActions";

/**
 * Lesson Detail (C06b) - what's in the lesson, who it's assigned to, and how
 * the class is moving through it. Per-section progress reads as "where people
 * slowed", stated plainly, never a scoreboard (slowed bars go violet, not
 * red). Two designed layouts: assigned (stat cards + progress rows + notes)
 * and ready (banner + plain section list). Drafts have no designed state
 * (flagged to design) and render header + sections only.
 */

const SECTION_H =
  "text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:text-sm";

function statusPill(status: LessonStatus) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold whitespace-nowrap",
        status === "Assigned" && "bg-nevo-violet/24 text-nevo-navy",
        status === "Ready" && "bg-nevo-navy/10 text-nevo-near-black/60",
        status === "Draft" && "bg-nevo-near-black/6 text-nevo-near-black/50",
      )}
    >
      {status}
    </span>
  );
}

function TypeTag({ type }: { type: string }) {
  return (
    <span className="shrink-0 rounded-full bg-nevo-navy/9 px-[9px] py-0.5 text-[11px] font-semibold whitespace-nowrap text-nevo-near-black/55">
      {type}
    </span>
  );
}

export function LessonDetail({
  lesson,
}: {
  lesson: LibraryLesson & { detail: LessonDetailData };
}) {
  const { detail } = lesson;
  const assigned = Boolean(detail.stats);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[860px]">
        <Link
          href="/teacher/lessons"
          className="inline-flex cursor-pointer items-center gap-[7px] text-sm text-nevo-near-black/60 transition-transform active:scale-[0.99]"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Lesson Library
        </Link>

        {/* Header */}
        {/* C06b tablet stacks the actions under the title; desktop sets them beside it. */}
        <div className="mt-3.5 flex flex-col gap-4 xl:mt-4 xl:flex-row xl:flex-wrap xl:items-start xl:justify-between xl:gap-6">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[27px]">
                {lesson.title}
              </h1>
              {!assigned && statusPill(lesson.status)}
            </div>
            <span className="mt-[5px] block text-sm text-nevo-near-black/60 xl:mt-1.5 xl:text-[14.5px]">
              {detail.metaLine}
            </span>
          </div>
          {/* No "Review variants": C16d has no live source, so the demo does
              not promise a capability the product cannot deliver. */}
          <LessonDetailActions lessonId={lesson.id} />
        </div>

        {assigned && detail.stats && (
          <>
            {/* Stat cards - three on desktop, first two on tablet */}
            <div className="mt-[18px] flex gap-2.5 xl:mt-6 xl:gap-3.5">
              <div className="flex-1 rounded-[12px] bg-nevo-cream-elevated px-4 py-3.5 shadow-elevation-1 xl:px-5 xl:py-[18px]">
                <span className="text-[12px] text-nevo-near-black/55 xl:text-[13px]">
                  Assigned to
                </span>
                <div className="mt-1 text-[14.5px] font-semibold text-nevo-near-black xl:text-base">
                  <span className="xl:hidden">{detail.stats.assignedToShort}</span>
                  <span className="hidden xl:inline">{detail.stats.assignedTo}</span>
                </div>
              </div>
              <div className="flex-1 rounded-[12px] bg-nevo-cream-elevated px-4 py-3.5 shadow-elevation-1 xl:px-5 xl:py-[18px]">
                <span className="text-[12px] text-nevo-near-black/55 xl:text-[13px]">
                  <span className="xl:hidden">Finished</span>
                  <span className="hidden xl:inline">Finished so far</span>
                </span>
                <div className="mt-1 text-[14.5px] font-semibold text-nevo-near-black xl:text-base">
                  {detail.stats.finished}
                </div>
              </div>
              <div className="hidden flex-1 rounded-[12px] bg-nevo-cream-elevated px-5 py-[18px] shadow-elevation-1 xl:block">
                <span className="text-[13px] text-nevo-near-black/55">Opened</span>
                <div className="mt-1 text-base font-semibold text-nevo-near-black">
                  {detail.stats.opened}
                </div>
              </div>
            </div>

            <h3 className={cn(SECTION_H, "mt-[26px] xl:mt-[34px]")}>
              How the class moved through it
            </h3>
            {detail.dipNote && (
              <p className="mt-2 hidden text-sm text-nevo-near-black/60 xl:block">
                {detail.dipNote}
              </p>
            )}
          </>
        )}

        {!assigned && detail.readyNote && (
          <div className="mt-[18px] flex max-w-[600px] items-start gap-3.5 rounded-[12px] bg-nevo-cream-elevated px-5 py-4 shadow-elevation-1 xl:mt-[26px] xl:px-6 xl:py-[22px]">
            <span className="mt-px shrink-0 text-nevo-navy">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <div>
              <h3 className="text-[15.5px] font-semibold text-nevo-near-black xl:text-base">
                Ready when you are
              </h3>
              <p className="mt-[5px] text-sm leading-[1.55] text-nevo-near-black/68 xl:mt-1.5 xl:text-[14.5px]">
                {detail.readyNote}
              </p>
            </div>
          </div>
        )}

        {!assigned && (
          <h3 className={cn(SECTION_H, "mt-[26px] xl:mt-8")}>
            What&rsquo;s inside
          </h3>
        )}

        {/* Section rows */}
        <div className="mt-3.5 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1 xl:mt-4">
          {detail.sections.map((section, i) => {
            const pct =
              section.done != null && section.total
                ? Math.round((section.done / section.total) * 100)
                : null;
            return (
              <div
                key={section.title}
                className={cn(
                  "flex items-center gap-3 px-[18px] py-[13px] xl:gap-3.5 xl:px-5 xl:py-[15px]",
                  i < detail.sections.length - 1 &&
                    "border-b border-nevo-near-black/7",
                )}
              >
                <span className="w-[22px] shrink-0 text-[12.5px] font-semibold text-nevo-near-black/60 xl:w-[26px] xl:text-[13px]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-nevo-near-black xl:text-[15px]">
                      {section.title}
                    </span>
                    <span className="hidden xl:inline-flex">
                      <TypeTag type={section.type} />
                    </span>
                    {section.slowed && (
                      <span className="text-[12.5px] text-nevo-navy xl:hidden">
                        slowed here
                      </span>
                    )}
                  </div>
                  {section.slowed && (
                    <p className="mt-[5px] hidden text-[13.5px] text-nevo-navy xl:block">
                      Several students slowed here
                    </p>
                  )}
                </div>
                {pct != null ? (
                  <>
                    <div className="hidden shrink-0 items-center gap-3 xl:flex">
                      <div className="h-1.5 w-[120px] overflow-hidden rounded-full bg-nevo-navy/14">
                        <span
                          style={{ width: `${pct}%` }}
                          className={cn(
                            "block h-full rounded-full",
                            section.slowed ? "bg-nevo-violet" : "bg-nevo-navy",
                          )}
                        />
                      </div>
                      <span className="w-16 text-right text-[13.5px] text-nevo-near-black/60">
                        {section.done}/{section.total}
                      </span>
                    </div>
                    <span className="shrink-0 text-[13px] text-nevo-near-black/60 xl:hidden">
                      {section.done}/{section.total}
                    </span>
                  </>
                ) : (
                  <TypeTag type={section.type} />
                )}
              </div>
            );
          })}
        </div>

        {assigned && detail.aiNote && (
          <div className="mt-[22px] flex items-start gap-3 rounded-[12px] bg-nevo-violet/14 px-[18px] py-4">
            <span className="mt-px shrink-0 text-nevo-navy">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z" />
                <path d="M10 20h4" />
              </svg>
            </span>
            <p className="text-[14.5px] leading-[1.55] text-nevo-near-black/78">
              {detail.aiNote}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
