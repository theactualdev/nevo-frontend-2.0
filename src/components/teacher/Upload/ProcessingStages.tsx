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
 * FIVE STAGES, THE FRAME'S FIVE, AND EVERY ONE OF THEM REPORTED. Every rung
 * here has a signal behind it, which is the only rule this ladder has ever had
 * - design, 14 Sep: *"never draw a rung the backend doesn't report."* LU-01
 * says the same thing itself: "no invented progress".
 *
 * | stage                      | what says so                          |
 * |----------------------------|---------------------------------------|
 * | Receiving the file         | the upload POST is in flight          |
 * | Reading the document       | `stage: "lessons"`                    |
 * | Finding the sections       | `stage: "structure"`                  |
 * | Preparing the adaptations  | `stage: "adaptations"`                |
 * | Ready to assign            | `stage: "complete"`, `status: ready`  |
 *
 * **THE FIFTH RUNG TOOK THREE RULINGS TO GET HERE, and the record is worth
 * keeping because it is an argument about evidence rather than taste.**
 *
 * 21 Sep - asked for a stage value, since the frame drew five and the enum
 * reported three. 23 Sep - design STRUCK the fifth: *"adaptation in this
 * product is generated on demand at serve time and discarded, which means no
 * adaptation work happens at upload at all... four stages is not a degraded
 * version of five, it is the accurate one."* They attached a condition to
 * their own ruling: *"if Teslim says otherwise and something genuinely is
 * prepared at upload, bring it back to me with what that work is and I will
 * re-rule."*
 *
 * Backend said otherwise the same day and named the work: `UploadStage` gained
 * `adaptations`, between `structure` and `complete`, covering pictures,
 * narration and the two depth rewrites. A live upload was watched reporting it
 * rather than the enum being taken on trust. 24 Sep - design re-ruled:
 * *"my strike was based on nothing happening at upload and that is now false.
 * Adaptations is real work and it is named... the ladder gets its fifth rung."*
 *
 * SO IT IS DRAWN. The rung that held `adaptations` on "Finding the sections"
 * for a day is gone, and nothing in between was ever invented: that hold
 * existed because the alternative was walking a teacher BACKWARDS to
 * "Receiving the file" through the longest part of the wait.
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

export type StageKey =
  | "receiving"
  | "reading"
  | "sections"
  | "adapting"
  | "ready";

export const PROCESSING_STAGES: { key: StageKey; label: string }[] = [
  { key: "receiving", label: "Receiving the file" },
  { key: "reading", label: "Reading the document" },
  { key: "sections", label: "Finding the sections" },
  // The frame's own words for it, kept rather than renamed.
  { key: "adapting", label: "Preparing the adaptations" },
  { key: "ready", label: "Ready to assign" },
];

/**
 * THE LONGEST RUNG, AND THE ONLY ONE A TEACHER NEEDS WARNING ABOUT.
 *
 * Exported because the sentence beside the ladder depends on which rung is
 * running, and this is the one that runs for minutes. Backend's note on the
 * enum: it "is the longest wait of the four by a wide margin - a generated
 * picture alone can take ten minutes".
 */
export const LONGEST_STAGE: StageKey = "adapting";

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
  if (stage === "adaptations") return "adapting";
  if (stage === "structure") return "sections";
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
