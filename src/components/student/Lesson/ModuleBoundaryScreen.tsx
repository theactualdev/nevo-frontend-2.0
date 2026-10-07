"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, CircleChevronRight, SquareCheckBig } from "lucide-react";
import { ProgressBar } from "@/components/shared";
import { cn } from "@/lib/utils";
import { moduleName } from "@/lib/utils/modules";
import type { LessonModule } from "@/lib/types";

/**
 * Module boundary (SCRUM-101.1/101.2, `Nevo Module Boundary`). A calm landing
 * between two stretches of a lesson - a full player screen, never a modal, and
 * it never blocks: "Yes, continue" is immediately pressable. It names where the
 * student is, what they finished and what is next. No confetti, no celebration
 * - the value is knowing the shape of the work.
 *
 * ONE ACTION, NO BREAK OFFER (design D91, 6 Oct). The frame's "Take a break
 * first" sat beside it and opened the full break module: "No. The module
 * boundary already carries the stretch, and offering a break on top of a
 * break turns a rhythm into a negotiation." The pause is this screen.
 *
 * With the attention accommodation active, a recap of the finished module and
 * a preview of the next render between the heading and the actions -
 * supportive, never required, and absent text degrades cleanly to the plain
 * screen.
 */
export function ModuleBoundaryScreen({
  lessonTitle,
  finished,
  next,
  nextModuleIndex,
  moduleCount,
  lessonProgress,
  showRecap,
  onReached,
  onAction,
  onEnterNext,
}: {
  lessonTitle: string;
  finished: LessonModule;
  next: LessonModule;
  /** 0-based index of the module being entered. */
  nextModuleIndex: number;
  moduleCount: number;
  /** 0-1 through the whole lesson - the bar stays continuous across boundaries. */
  lessonProgress: number;
  /** Attention accommodation (SCRUM-71) - enriches, never gates. */
  showRecap: boolean;
  /** Emits `module_boundary_reached` - fired once on mount. */
  onReached: () => void;
  /** Emits `module_boundary_action` with the student's choice. */
  onAction: (action: "continue") => void;
  /** Advance into the next module's first segment. */
  onEnterNext: () => void;
}) {
  const reached = useRef(false);
  useEffect(() => {
    if (reached.current) return; // StrictMode double-invoke guard
    reached.current = true;
    onReached();
    // Mount-only signal; onReached is stable for the screen's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLast = nextModuleIndex === moduleCount - 1;
  const heading = `You've finished ${moduleName(finished, "done", false)}. Ready for ${moduleName(next, "next", isLast)}?`;

  const recap = showRecap ? finished.recap : undefined;
  const preview = showRecap ? next.preview : undefined;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      {/* Quiet header: lesson title + module position chip */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-8 sm:py-5">
        <span className="truncate text-sm font-medium text-nevo-near-black/42 sm:text-base">
          {lessonTitle}
        </span>
        <span className="shrink-0 rounded-full bg-nevo-navy/8 px-3 py-[5px] font-mono text-[11px] font-semibold tracking-[0.04em] text-nevo-navy/75">
          Module {nextModuleIndex + 1} of {moduleCount}
        </span>
      </div>

      {/* Boundary body - steps to cream-elevated so it reads as a distinct place */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-nevo-cream-elevated">
        <div className="mx-auto flex min-h-full w-full max-w-[360px] flex-col px-6 py-6 sm:max-w-[560px] sm:px-8 sm:py-10">
          <div className="flex flex-1 flex-col items-center text-center">
            {/* Static anchor - a quiet centre for the pause */}
            <div
              className={cn(
                "flex w-full items-center justify-center",
                recap || preview
                  ? "min-h-[150px]"
                  : "min-h-[150px] flex-1 sm:min-h-[200px]",
              )}
            >
              <div className="flex size-[116px] items-center justify-center rounded-full border-2 border-nevo-violet/50 bg-nevo-violet/16 sm:size-[156px]">
                <span className="flex size-14 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream shadow-[0_8px_20px_rgba(59,63,110,0.3)] sm:size-[74px]">
                  <ArrowRight className="size-6 sm:size-8" strokeWidth={1.9} />
                </span>
              </div>
            </div>

            <span className="font-mono text-[11px] font-semibold tracking-[0.1em] text-nevo-near-black/48 uppercase">
              Section complete
            </span>
            <h2 className="mt-3 text-[23px] leading-[1.28] font-semibold tracking-[-0.012em] text-pretty text-nevo-near-black sm:text-[30px]">
              {heading}
            </h2>

            {/* Module dots: done navy, just-finished violet pill, upcoming outline */}
            <div className="mt-[18px] flex items-center justify-center gap-[9px]">
              {Array.from({ length: moduleCount }, (_, m) => (
                <span
                  key={m}
                  className={cn(
                    "h-2.5 rounded-full",
                    m < nextModuleIndex - 1 && "w-2.5 bg-nevo-navy",
                    m === nextModuleIndex - 1 && "w-[26px] bg-nevo-violet",
                    m > nextModuleIndex - 1 &&
                      "w-2.5 border-[1.5px] border-nevo-navy/32",
                  )}
                />
              ))}
            </div>

            {(recap || preview) && (
              <div className="mt-6 flex w-full flex-col gap-3 text-left">
                {recap && (
                  <RecapBlock
                    label="What you just did"
                    text={recap}
                    glyph="recap"
                  />
                )}
                {preview && (
                  <RecapBlock
                    label="What's coming next"
                    text={preview}
                    glyph="next"
                  />
                )}
              </div>
            )}

            {/* The one action, pinned to the base of the column */}
            <div className="mt-auto flex w-full flex-col gap-2.5 pt-6 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  onAction("continue");
                  onEnterNext();
                }}
                className="flex h-14 w-full shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy px-[22px] text-[15.5px] font-semibold text-nevo-cream shadow-[0_6px_18px_rgba(59,63,110,0.28)] transition-[filter,transform] hover:brightness-106 active:scale-[0.98] sm:w-auto sm:flex-1"
              >
                Yes, continue
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Whole-lesson progress, continuous across the boundary */}
      <ProgressBar
        value={lessonProgress}
        className="shrink-0"
        aria-label={`Module ${nextModuleIndex + 1} of ${moduleCount}`}
      />
    </div>
  );
}

function RecapBlock({
  label,
  text,
  glyph,
}: {
  label: string;
  text: string;
  glyph: "recap" | "next";
}) {
  return (
    <div className="rounded-[12px] bg-nevo-cream px-[18px] py-4">
      <div className="flex items-center gap-2 text-nevo-violet">
        {glyph === "recap" ? (
          <SquareCheckBig className="size-[15px]" strokeWidth={2} />
        ) : (
          <CircleChevronRight className="size-[15px]" strokeWidth={2} />
        )}
        <span className="text-xs font-semibold tracking-[0.04em] text-nevo-near-black/45 uppercase">
          {label}
        </span>
      </div>
      {/* SCRUM-101.2: "on 375x812 the recap and preview are capped at two
          lines each", so the actions stay above the fold. From tablet up
          there is room, and the whole text shows. */}
      <p className="mt-[9px] line-clamp-2 text-[15px] leading-[1.5] text-pretty text-nevo-near-black sm:line-clamp-none sm:text-base">
        {text}
      </p>
    </div>
  );
}
