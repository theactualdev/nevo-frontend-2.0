import type { UploadStage } from "@/lib/api/uploads";
import { cn } from "@/lib/utils";

/**
 * Block-path parse progress (C07e, SCRUM-102.3): one calm present-tense line
 * at a time, the non-numeric four-rung ladder showing position, and the plain
 * leave-and-return note. As soon as a level is identified the teacher can
 * open it and start steering while later levels run - the done rungs carry
 * "Open and steer" into the structure tree.
 *
 * Presentational: the wizard decides the rung - from the staged upload's
 * own `stage` on a real unit, from the walkthrough's beats signed out. NOTE: the C07e frame's own head reads "STEP 2 OF 5 / 40%", which
 * contradicts the C07g flow map (parse = step 3) - the wizard keeps 3 OF 5
 * at 50% per the audit; flagged to design.
 */

/**
 * FOUR RUNGS, EACH STANDING BEHIND SOMETHING THE SERVER DOES (Lydia, 9 Nov,
 * item 5): "Their four steps are accepted, because each one stands behind
 * something the server actually does, which the two existing lines did not."
 *
 * | rung                                  | what says so                          |
 * |---------------------------------------|---------------------------------------|
 * | Finding the lessons                   | `reading_document` (was `lessons`)   |
 * | Finding the sections in each lesson   | `finding_sections` (was `structure`) |
 * | Preparing the adaptations             | `preparing_adaptations` (`adaptations`) |
 * | Ready for your review                 | `ready_to_assign` (was `complete`)   |
 *
 * C07e drew "Splitting sections into segments" and "Writing the recaps and
 * previews", and neither has a signal behind it; design's own rule since 14
 * Sep is "never draw a rung the backend doesn't report". The third rung is
 * LU-01's word for the work the server does name - pictures, narration and
 * the depth rewrites. The last reads "Ready for your review", NOT "Ready to
 * review": "so it names whose job it is".
 *
 * Keyed by the enum rather than positional, so a new stage value cannot
 * silently shift a teacher onto the wrong rung.
 */
export const PARSE_STAGES: { stage: UploadStage; label: string }[] = [
  { stage: "lessons", label: "Finding the lessons" },
  { stage: "structure", label: "Finding the sections in each lesson" },
  { stage: "adaptations", label: "Preparing the adaptations" },
  { stage: "complete", label: "Ready for your review" },
];

/**
 * The running step's present-tense line, under the spinner as C07e draws it:
 * the rung's own words, so it can never name a step the ladder doesn't, with
 * the ellipsis of work under way - and none once nothing is still running.
 */
export function parseLine(stage: number): string {
  const rung = PARSE_STAGES[stage] ?? PARSE_STAGES[0];
  return stage >= PARSE_STAGES.length - 1 ? rung.label : `${rung.label}…`;
}

/**
 * Where a stage sits on the ladder. `-1` for a value we do not know, and for
 * `null` - which the hook uses before the first poll answers. A stage nobody
 * has met cannot be placed, and the spinner is at least not a claim about
 * where the parse has got to.
 *
 * Both sets of the server's names land on the same rungs (deploy order): the
 * older `lessons | structure | adaptations | complete` and today's
 * `receiving_file | reading_document | finding_sections |
 * preparing_adaptations | ready_to_assign`.
 */
export function rungFor(stage: UploadStage | null | undefined): number {
  const now: Partial<Record<UploadStage, UploadStage>> = {
    receiving_file: "lessons",
    reading_document: "lessons",
    finding_sections: "structure",
    preparing_adaptations: "adaptations",
    ready_to_assign: "complete",
  };
  const known = stage ? (now[stage] ?? stage) : stage;
  return PARSE_STAGES.findIndex((s) => s.stage === known);
}

export function ParseProgress({
  stage,
  onSteer,
}: {
  stage: number;
  /**
   * What "Open and steer" does. A CALLBACK, not a URL.
   *
   * This was a `<Link href="/teacher/lessons/upload/structure">` into a
   * standalone route that was this repo's invention - C07e draws the control as
   * a button. The route it pointed at served a hardcoded P5 Science fixture to
   * signed-in teachers, and clicking it mid-parse also discarded the in-flight
   * poll, because `useStagedUpload` state lives in the wizard and that page
   * mounted a component with no API client at all.
   *
   * So the honest re-point is the wizard's own structure tree, one branch away,
   * which is already driven by the real parse. Omitted means no control: a rung
   * with nowhere to go should not offer to take you there.
   */
  onSteer?: () => void;
}) {
  return (
    // `flex-1` for the live path, where it is a flex item (see UploadWizard).
    <div className="flex min-h-full flex-1 flex-col items-center justify-center">
      <div className="flex w-full max-w-[460px] flex-col items-center">
        <div className="flex flex-col items-center gap-[18px]">
          <span className="size-[52px] shrink-0 rounded-full border-4 border-nevo-navy/16 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:950ms]" />
          {/* A polite live region: a screen reader hears the step move on,
              which the ladder below only shows. */}
          <div
            role="status"
            aria-live="polite"
            className="text-center text-[19px] font-semibold tracking-[-0.01em] text-nevo-near-black xl:text-[21px]"
          >
            {parseLine(stage)}
          </div>
        </div>

        <div className="mt-[30px] flex w-full flex-col gap-[9px]">
          {PARSE_STAGES.map((s, i) => {
            const done = i < stage;
            const active = i === stage;
            return (
              <div
                key={s.stage}
                className={cn(
                  "flex items-center gap-[13px] rounded-[12px] px-[15px] py-[11px]",
                  active && "bg-nevo-violet/20",
                  done && "bg-nevo-navy/7",
                )}
              >
                <span
                  className={cn(
                    "flex size-[26px] shrink-0 items-center justify-center rounded-full",
                    done && "bg-nevo-navy text-nevo-cream",
                    active &&
                      "bg-nevo-violet text-nevo-cream motion-safe:animate-nevo-stage-pulse",
                    !done && !active && "bg-nevo-near-black/10 text-nevo-near-black/40",
                  )}
                >
                  {done ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12l4 4L19 6" />
                    </svg>
                  ) : (
                    <span className="text-xs font-semibold">{i + 1}</span>
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 text-sm",
                    active
                      ? "font-semibold text-nevo-near-black"
                      : done
                        ? "font-medium text-nevo-near-black/72"
                        : "font-medium text-nevo-near-black/40",
                  )}
                >
                  {s.label}
                </span>
                {active && (
                  <span className="text-[11.5px] font-semibold whitespace-nowrap text-nevo-navy">
                    Working&hellip;
                  </span>
                )}
                {done && onSteer && (
                  <button
                    type="button"
                    onClick={onSteer}
                    className="inline-flex cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/30 px-[11px] py-[5px] text-[11.5px] font-semibold whitespace-nowrap text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                  >
                    Open and steer
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex w-full items-center gap-2.5 rounded-[12px] bg-nevo-violet/14 px-4 py-3">
          <span className="shrink-0 text-nevo-navy">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5M21 12H9" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 text-[13px] leading-[1.5] text-nevo-near-black/75">
            You can leave this - we&rsquo;ll keep going and save a draft.
          </span>
        </div>
      </div>
    </div>
  );
}
