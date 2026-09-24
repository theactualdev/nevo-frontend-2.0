import type { UploadStage, UploadStatus } from "@/lib/api/uploads";
import { cn } from "@/lib/utils";

/**
 * SCRUM-172 LU-01: what Nevo is doing with a lesson, while it does it.
 *
 * "Processing a lesson takes time and that time is currently dead. The teacher
 * gets nothing to read and nothing to understand, so the only available
 * conclusion is that the product has hung." A single-lesson upload showed a
 * spinner and two sentences for what backend measures at about 115 seconds of
 * text work plus up to 600 per generated picture.
 *
 * FOUR STAGES, NOT THE FRAME'S FIVE, and this is design's own ruling applied
 * rather than a corner cut. On 14 Sep the block path's ladder was cut from
 * four rungs to three for exactly this reason - the fourth was invented to
 * match a drawing and driven by a mock clock, and `PARSE_STAGES` still carries
 * design's words for it: *"never draw a rung the backend doesn't report."*
 * LU-01 says the same thing itself - "no invented progress".
 *
 * Four of the frame's five have a real signal behind them:
 *
 * | stage                     | what says so                          |
 * |---------------------------|---------------------------------------|
 * | Receiving the file        | the upload POST is in flight          |
 * | Reading the document      | `stage: "lessons"`                    |
 * | Finding the sections      | `stage: "structure"`                  |
 * | Ready to assign           | `stage: "complete"`, `status: ready`  |
 *
 * **The fifth stage was struck on 23 Sep, and the ground moved under the
 * ruling the same day.** Design struck it because there was no work behind
 * it: *"adaptation in this product is generated on demand at serve time and
 * discarded, which means no adaptation work happens at upload at all... four
 * stages is not a degraded version of five, it is the accurate one."* They
 * attached a condition to their own ruling - *"if Teslim says otherwise and
 * something genuinely is prepared at upload, bring it back to me with what
 * that work is and I will re-rule."*
 *
 * BACKEND THEN SAID OTHERWISE AND NAMED THE WORK. `UploadStage` now reports
 * `adaptations`, between `structure` and `complete`, covering pictures,
 * narration and the two depth rewrites. It is deployed, and a live upload was
 * watched reporting it. The condition design set has been met, so the ask is
 * back with them with the work named.
 *
 * UNTIL THEY RULE, THE LADDER HOLDS - it does not grow a rung on this side.
 * `adaptations` maps to "Finding the sections", the last rung that is true,
 * because the alternative in place until now was a teacher walking BACKWARDS
 * to "Receiving the file" and sitting there through the longest part of the
 * wait. That is not a smaller version of the choice design is making. It is
 * the bug that appeared the moment the enum gained a value this file did not
 * know.
 *
 * ONE THING MOVES. The running stage carries the motion and nothing else does,
 * per LU-01 - five spinners is a screen that looks busier than the work is.
 * Completed stages take a navy mark, never green, and stages not yet reached
 * are present but held back in weight, so the whole shape of the wait is
 * visible from the first moment.
 *
 * NOTHING NUMERIC. No percentage, no count, no estimate. The server reports no
 * figure for any of this and an invented one is a promise a teacher will time.
 */

export type StageKey = "receiving" | "reading" | "sections" | "ready";

export const PROCESSING_STAGES: { key: StageKey; label: string }[] = [
  { key: "receiving", label: "Receiving the file" },
  { key: "reading", label: "Reading the document" },
  { key: "sections", label: "Finding the sections" },
  { key: "ready", label: "Ready to assign" },
];

/**
 * Which stage a teacher is watching, from what the server has actually said.
 *
 * `uploadId === null` is the POST still in flight: the file is being received,
 * and that is the one stage this side of the wire can see for itself.
 *
 * NOTHING HERE WALKS BACKWARDS, and that is the rule this function got wrong
 * once. It is pure - it has no memory of where the ladder was - so "hold the
 * ladder where it is" was never something it could do by answering with the
 * first rung for a value it did not know. When `adaptations` arrived that is
 * exactly what happened: the ladder reached "Finding the sections" and reset
 * to "Receiving the file" for the rest of the parse.
 *
 * So an unrecognised stage returns `reading` rather than `receiving`. It is
 * still a guess, but `receiving` is the one answer we KNOW to be false - the
 * POST has plainly landed, because the server is the thing reporting a stage.
 */
export function stageOf(
  uploadId: string | null,
  stage: UploadStage | null,
  status: UploadStatus | null,
): StageKey {
  if (uploadId === null) return "receiving";
  if (status === "ready" || status === "confirmed" || stage === "complete") {
    return "ready";
  }
  // `adaptations` comes AFTER `structure` and has no rung of its own until
  // design re-rules, so it holds on the last rung that is true rather than
  // this file inventing the fifth.
  if (stage === "adaptations" || stage === "structure") return "sections";
  if (stage === "lessons") return "reading";
  // No stage at all is the gap between the POST resolving and the first poll
  // answering, and there the file really has only been received.
  return stage === null ? "receiving" : "reading";
}

const Mark = ({ state }: { state: "done" | "running" | "waiting" }) => {
  if (state === "done") {
    return (
      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-nevo-navy">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f7f1e6" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    );
  }
  if (state === "running") {
    return (
      <span
        className="size-[22px] shrink-0 rounded-full border-[3px] border-nevo-violet/30 border-t-nevo-violet motion-safe:animate-spin motion-safe:[animation-duration:900ms]"
        aria-hidden
      />
    );
  }
  return (
    <span
      className="box-border size-[22px] shrink-0 rounded-full border-2 border-nevo-near-black/16"
      aria-hidden
    />
  );
};

export function ProcessingStages({
  lessonName,
  current,
  /** The stage that stopped, when one did (LU-05). */
  failedAt,
}: {
  lessonName: string;
  current: StageKey;
  failedAt?: StageKey | null;
}) {
  const at = PROCESSING_STAGES.findIndex((s) => s.key === current);

  return (
    <div className="w-full max-w-[560px]">
      {/* LU-01: "the lesson's own name sits at the top". A teacher who
          uploaded three things needs to know which one this is. */}
      <p className="text-[13px] font-medium text-nevo-near-black/55">
        {lessonName}
      </p>

      <ul className="mt-4 flex list-none flex-col gap-[18px] p-0">
        {PROCESSING_STAGES.map((s, i) => {
          const stopped = failedAt === s.key;
          const state = stopped
            ? "waiting"
            : i < at
              ? "done"
              : i === at
                ? "running"
                : "waiting";
          return (
            <li key={s.key} className="flex items-center gap-3.5">
              {/* `state` already carries the stop: `stopped` short-circuits
                  it to "waiting", and every stage after the failure is
                  "waiting" anyway. A second guard here read as load-bearing
                  and was not - a mutation run removing it changed nothing,
                  which is how it was found. */}
              <Mark state={state} />
              <span
                className={cn(
                  "text-[15.5px] leading-[1.4]",
                  // LU-01's weights: what is done and what is happening are
                  // at full strength; what has not started is present but
                  // held back, so the shape of the wait is legible without
                  // any of it shouting.
                  i <= at
                    ? "font-medium text-nevo-near-black"
                    : "text-nevo-near-black/40",
                )}
              >
                {s.label}
                {stopped && (
                  /* LU-05 names the stage it happened at, in the list as it
                     stood. No red anywhere - a parse that stopped is not an
                     alarm, and the earlier stages really did finish. */
                  <span className="text-nevo-near-black/55">
                    {" — stopped"}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
