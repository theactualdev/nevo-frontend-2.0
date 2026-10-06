/**
 * MasteryDualTrack (`Nevo Teacher MasteryDualTrack`) - one concept, two
 * tracks: how well the student has understood it (navy, the heavier bar) and
 * how much the reading load is shaping the result (violet, deliberately
 * thinner and lighter - it is context, not a score).
 *
 * SCRUM-38 attribution is text-only: a flagged row gets a navy-outlined pill
 * carrying the words, never an alarm colour and never a hue change on the
 * bars. The component repeats down the C08 mastery panel, so its geometry is
 * literal: 92px label column, 34px value column, 12px gaps, 8px/6px rails.
 *
 * THE AUTO-FLAG IS GONE (17 Sep). It read two engine numbers and returned
 * "Concept support needed", "Reading support needed" or "Needs support" from
 * cutoffs of 40 and 60 - a named verdict about a child, computed here, from
 * thresholds this codebase invented. Three rules at once: rule 3 (compute no
 * thresholds), rule 2 (no diagnostic label rendered) and rule 5 (`mastery/
 * student` carries nothing of the kind, and absence is an instruction).
 *
 * It was not fixture copy. No caller passes `flag`, so every pill the product
 * has ever shown was computed - on two live surfaces, the student profile and
 * class insights, against real children's data.
 *
 * The comment it replaces said the rules were "reproduced exactly as the frame
 * computes it rather than 'corrected' - flagged to design". Design has the
 * mastery rework open in the copy audit; this half of it could not wait for
 * that, because what the frame computes is a verdict and we were rendering it.
 *
 * `flag` stays. When the rework lands with a source behind it, a label arrives
 * as a payload and this component renders it. Until then there is no label.
 */

/** Frame clamps to 0-100. Only ever called with a finite value - see below. */
const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function MasteryDualTrack({
  concept,
  understanding,
  reading,
  /** Any string overrides the auto label; the literal "none" suppresses it. */
  flag,
}: {
  concept: string;
  understanding: number;
  reading: number;
  flag?: string;
}) {
  /*
   * NO VALUE IS NOT 72%. A non-number fell back to the frame's own example
   * figures - 72 and 48 - so a concept with no measurement was drawn as one
   * a student had mostly understood. Absence is an instruction: no bar.
   */
  if (!Number.isFinite(understanding) || !Number.isFinite(reading)) return null;
  const u = clamp(understanding);
  const r = clamp(reading);
  // No fallback. Nothing computes a label here; "none" is kept as an explicit
  // suppression so a caller can say "not on this row" as well as say nothing.
  const label = !flag || flag === "none" ? "" : flag;

  return (
    <div className="flex w-full flex-col gap-2.5">
      {concept && (
        <div className="flex items-center gap-2.5">
          <span className="text-[14.5px] font-semibold tracking-[-0.005em] text-nevo-near-black">
            {concept}
          </span>
          {label && (
            <span className="rounded-full border border-nevo-navy/45 px-2.5 py-[3px] text-[11px] font-semibold tracking-[0.01em] text-nevo-navy">
              {label}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="w-[92px] shrink-0 text-xs text-nevo-near-black/70">
            Understanding
          </span>
          <div
            role="progressbar"
            aria-label={concept ? `${concept} - understanding` : "Understanding"}
            aria-valuenow={u}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 flex-1 overflow-hidden rounded-[4px] bg-nevo-navy/10"
          >
            <div
              className="h-full rounded-[4px] bg-nevo-navy"
              style={{ width: `${u}%` }}
            />
          </div>
          <span className="w-[34px] shrink-0 text-right text-[13px] font-medium text-nevo-near-black">
            {u}%
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-[92px] shrink-0 text-xs text-nevo-near-black/70">
            Reading level
          </span>
          <div
            role="progressbar"
            aria-label={concept ? `${concept} - reading level` : "Reading level"}
            aria-valuenow={r}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-nevo-violet/10"
          >
            <div
              className="h-full rounded-[3px] bg-nevo-violet"
              style={{ width: `${r}%` }}
            />
          </div>
          <span className="w-[34px] shrink-0 text-right text-[13px] font-medium text-nevo-near-black/70">
            {r}%
          </span>
        </div>
      </div>
    </div>
  );
}
