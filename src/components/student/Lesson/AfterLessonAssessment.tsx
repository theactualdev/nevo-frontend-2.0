"use client";

import { useState } from "react";
import { Check, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/shared";
import type { Assessment } from "@/lib/types";
import {
  AnswerDot,
  AnswerOption,
  AnswerRadio,
  type AnswerTone,
} from "./AnswerOption";

/** House recovery copy for questions that don't bring their own. */
const DEFAULT_RECOVERY =
  "That one didn't land - and that's okay. We'll bring it back later. Nothing to fix right now.";

/**
 * After-lesson assessment (Lesson Check frame) — a short check-in framed as
 * low-stakes: no timer, not graded. An intro sets the tone, questions advance
 * one at a time under a calm violet progress line (select, then confirm with
 * Next), a miss is acknowledged gently in violet and never stops the flow, and
 * the result is phrased as growth — concepts, never numbers.
 */
export function AfterLessonAssessment({
  assessment,
  onFinish,
  onAnswer,
  onReviewAnswers,
}: {
  assessment: Assessment;
  onFinish: () => void;
  /** Reports each confirmed answer (comprehension_response signal + review). */
  onAnswer?: (result: {
    questionIndex: number;
    selectedId: string;
    correct: boolean;
  }) => void;
  /** "Review answers" on the result → the Review Answers screen (A5). */
  onReviewAnswers?: () => void;
}) {
  const [stage, setStage] = useState<"intro" | "questions" | "result">("intro");
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  // A wrong confirm flips the question into its recovery state (violet, locked).
  const [revealed, setRevealed] = useState(false);
  /*
   * How many landed first time.
   *
   * `confirm` computed this and threw it away, so the result screen showed the
   * navy success mark, "You're getting the hang of this", and every
   * `masteredConcepts` entry ticked - to a child who had just got every
   * question wrong. The two concepts they had failed were the two ticked as
   * mastered.
   */
  const [gotRight, setGotRight] = useState(0);

  if (stage === "intro") {
    return (
      <Intro
        count={assessment.questions.length}
        onStart={() => setStage("questions")}
      />
    );
  }
  if (stage === "result") {
    return (
      <GrowthResult
        landed={gotRight}
        assessment={assessment}
        onFinish={onFinish}
        onReviewAnswers={onReviewAnswers}
      />
    );
  }

  const total = assessment.questions.length;
  const question = assessment.questions[qIndex];
  const isLast = qIndex === total - 1;

  const advance = () => {
    setSelected(null);
    setRevealed(false);
    if (isLast) setStage("result");
    else setQIndex((i) => i + 1);
  };

  const confirm = () => {
    if (!selected) return;
    const correct = selected === question.correctId;
    onAnswer?.({ questionIndex: qIndex, selectedId: selected, correct });
    if (correct) setGotRight((n) => n + 1);
    if (correct) advance();
    else setRevealed(true);
  };

  const tone = (id: string): AnswerTone => {
    if (revealed) return id === selected ? "violet" : "muted";
    return id === selected ? "navy" : "idle";
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      {/* Calm progress — position, never a score */}
      <div className="shrink-0 px-6 pt-5 sm:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-[600px] lg:max-w-[640px]">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-medium text-nevo-near-black/60">
              Question {qIndex + 1} of {total}
            </span>
            <span className="text-[13px] text-nevo-near-black/45">
              No timer
            </span>
          </div>
          <div
            className="h-[5px] overflow-hidden rounded-full bg-nevo-navy/12"
            role="progressbar"
            aria-valuenow={qIndex + 1}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={`Question ${qIndex + 1} of ${total}`}
          >
            <div
              className="h-full rounded-full bg-nevo-violet"
              style={{ width: `${((qIndex + 1) / total) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-7 sm:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-[600px] lg:max-w-[640px]">
          <h2 className="text-[23px] font-semibold leading-[1.3] tracking-[-0.01em] text-nevo-near-black sm:text-[26px]">
            {question.prompt}
          </h2>

          <div className="mt-6 flex flex-col gap-2.5">
            {question.options.map((option) => (
              <AnswerOption
                key={option.id}
                label={option.label}
                tone={tone(option.id)}
                className="py-4"
                trailing={
                  revealed ? (
                    option.id === selected ? (
                      <AnswerDot />
                    ) : undefined
                  ) : (
                    <AnswerRadio selected={option.id === selected} />
                  )
                }
                onSelect={() => setSelected(option.id)}
              />
            ))}
          </div>

          {/* Recovery note — lands instantly (results never animate) */}
          {revealed && (
            <div
              role="status"
              className="mt-[18px] flex items-start gap-2.5 rounded-[12px] bg-nevo-violet/14 px-4 py-3.5"
            >
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-nevo-violet" />
              <p className="text-sm leading-[1.5] text-nevo-near-black">
                {question.recoveryNote ?? DEFAULT_RECOVERY}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-6 pt-3 pb-6 sm:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-[600px] lg:max-w-[640px]">
          <Button
            className="w-full"
            disabled={!selected}
            onClick={revealed ? advance : confirm}
          >
            {revealed ? "Next question" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Low-stakes framing before the first question - no timer, not graded.
 *
 * NO "ABOUT N MINUTES". The frame draws "4 questions · about 2 minutes", and
 * the minutes were `round(questions / 2)` presented as fact: no field carries
 * how long a check-in takes. The count is real, so it stays.
 */
function Intro({ count, onStart }: { count: number; onStart: () => void }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-6 text-center text-nevo-near-black">
      <div className="flex w-full max-w-[300px] flex-col items-center sm:max-w-[430px]">
        <span className="flex size-[88px] items-center justify-center rounded-full bg-nevo-violet/20">
          <ClipboardCheck className="size-10 text-nevo-navy" strokeWidth={2} />
        </span>
        <h2 className="mt-7 text-[23px] font-semibold tracking-[-0.01em] sm:text-[26px]">
          A few quick questions
        </h2>
        <p className="mt-3 text-base leading-[1.6] text-nevo-near-black/72 sm:text-[17px]">
          This helps Nevo see what landed. There&apos;s no timer, and it
          isn&apos;t graded - take your time.
        </p>
        <Button className="mt-9 w-full max-w-[300px]" onClick={onStart}>
          Start
        </Button>
        <span className="mt-4 text-[13px] text-nevo-near-black/55">
          {count} question{count === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

/**
 * The growth result - what's taking hold and what we'll revisit. No score.
 *
 * ONE CASE DIVERGES FROM THE FRAME, and only one. The Lesson Check frame draws
 * a single result state: the navy check, "You're getting the hang of this",
 * and a mastered/revisit split. Its own note copy assumes a partial outcome -
 * "You showed you understand what photosynthesis is... One idea - the word
 * equation - we'll come back to together." Design drew no state for a child
 * who got nothing right, so that state used to render the success mark and
 * tick the very concepts they had just missed.
 *
 * So when NOTHING landed, the concepts move to the revisit treatment the frame
 * already draws, and the mark and heading stop claiming progress. Every other
 * outcome renders exactly as drawn - a child who got one of two right still
 * sees design's screen, which is what its copy was written for.
 *
 * No score either way: still concepts, never numbers.
 *
 * TODO(design): the nothing-landed heading is ours, built from the frame's own
 * "we'll come back to together". Confirm the wording.
 * TODO(api): questions carry no concept id, so nothing maps an answer to the
 * concept it evidences. Until they do, "which concept landed" cannot be
 * answered and this can only tell all from none.
 */
function GrowthResult({
  landed,
  assessment,
  onFinish,
  onReviewAnswers,
}: {
  /** How many questions landed first time. */
  landed: number;
  assessment: Assessment;
  onFinish: () => void;
  onReviewAnswers?: () => void;
}) {
  const nothingLanded = landed === 0 && assessment.questions.length > 0;
  const mastered = nothingLanded ? [] : (assessment.masteredConcepts ?? []);
  const revisit = nothingLanded
    ? [
        ...(assessment.masteredConcepts ?? []),
        ...(assessment.revisitConcepts ?? []),
      ]
    : (assessment.revisitConcepts ?? []);

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center bg-nevo-cream px-6 text-nevo-near-black">
      <div className="mx-auto w-full max-w-[300px] sm:max-w-[430px]">
        {/* Success mark: navy circle + cream check, one-shot pop (DS state pattern) */}
        {nothingLanded ? (
          // The frame's own revisit mark, not the success check.
          <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-nevo-violet/35 motion-safe:animate-nevo-pop">
            <span className="size-[18px] rounded-full bg-nevo-violet" />
          </span>
        ) : (
          <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
            <Check className="size-[38px] text-nevo-cream" strokeWidth={2.6} />
          </span>
        )}
        <h2 className="mt-[26px] text-center text-[23px] font-semibold tracking-[-0.01em] sm:text-[26px]">
          {nothingLanded
            ? "We’ll come back to this together"
            : "You’re getting the hang of this"}
        </h2>
        {/* The authored note says what the child SHOWED, so it is held back
            when they showed none of it. */}
        {nothingLanded && (
          <p className="mt-3 text-center text-base leading-[1.6] text-nevo-near-black/72 sm:text-[17px]">
            This one didn&rsquo;t land yet, and that&rsquo;s completely fine.
            Nevo will bring it back when you&rsquo;re ready for it.
          </p>
        )}
        {!nothingLanded && assessment.resultNote && (
          <p className="mt-3 text-center text-base leading-[1.6] text-nevo-near-black/72 sm:text-[17px]">
            {assessment.resultNote}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          {mastered.map((item) => (
            <div
              key={item}
              className="flex items-center gap-3 rounded-[12px] bg-nevo-cream-elevated px-4 py-3.5 shadow-elevation-1"
            >
              <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-nevo-navy">
                <Check className="size-3 text-nevo-cream" strokeWidth={2.8} />
              </span>
              <span className="text-[15px] font-medium">{item}</span>
            </div>
          ))}
          {revisit.map((item) => (
            <div
              key={item}
              className="flex items-center gap-3 rounded-[12px] bg-nevo-cream-elevated px-4 py-3.5 shadow-elevation-1"
            >
              <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-nevo-violet/35">
                <span className="size-2 rounded-full bg-nevo-violet" />
              </span>
              <span className="text-[15px] font-medium">
                {item}{" "}
                <span className="font-normal text-nevo-near-black/60">
                  · revisit soon
                </span>
              </span>
            </div>
          ))}
        </div>

        <Button className="mt-7 w-full" onClick={onFinish}>
          Continue
        </Button>
        {onReviewAnswers && (
          <Button
            variant="ghost"
            className="mt-2 h-[46px] w-full text-[15px]"
            onClick={onReviewAnswers}
          >
            Review answers
          </Button>
        )}
      </div>
    </div>
  );
}
