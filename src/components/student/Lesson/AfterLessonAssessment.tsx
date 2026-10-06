"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/shared";
import type { CheckOutcome } from "@/lib/lessons/checkOutcome";
import type { Assessment } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AnswerDot,
  AnswerOption,
  AnswerRadio,
  type AnswerTone,
} from "./AnswerOption";
import { LeaveButton } from "./LeaveButton";
import { READING_BODY, READING_HEADING, READING_INK } from "./readingSupport";
import { SpokenPrompt } from "./SpokenPrompt";

/**
 * House recovery copy for questions that don't bring their own.
 *
 * WITHOUT "WE'LL BRING IT BACK LATER" (D40, 1 Oct). The frame's line promised
 * a return, and design ruled that line renders only where the backend returns
 * a next-review signal. Nothing here asks the scheduler anything, so nothing
 * stands behind the promise. The rest of the frame's sentence stays.
 */
const DEFAULT_RECOVERY =
  "That one didn't land - and that's okay. Nothing to fix right now.";

/**
 * After-lesson assessment (Lesson Check frame) — a short check-in framed as
 * low-stakes: no timer, not graded. An intro sets the tone, questions advance
 * one at a time under a calm violet progress line (select, then confirm with
 * Next), a miss is acknowledged gently in violet and never stops the flow, and
 * the result is phrased as growth — concepts, never numbers.
 *
 * A WAY OUT, BEFORE AND DURING THE QUESTIONS (D36). `onLeave` puts the
 * player's exit control on the intro and on every question, and it leaves at
 * once - no warning, nothing that frames going as giving up. What leaving
 * records is the player's business: not completed, never failed, with the
 * answers already given kept. The result screen needs none; Continue is its
 * way on.
 *
 * AND BACK IN WHERE THEY LEFT (B49). `onLeave` is told the place in the list
 * - the next question to ask - and `resumeAt` reopens there, past the intro,
 * which a child who has already started does not need again.
 */
export function AfterLessonAssessment({
  assessment,
  onFinish,
  onAnswer,
  onReviewAnswers,
  onLeave,
  onComplete,
  resumeAt,
  landedBefore = 0,
  landedPending = false,
  outcome,
  reading = false,
  onAudioBusy,
}: {
  assessment: Assessment;
  onFinish: () => void;
  /**
   * Leave the check part way (D36). Absent, no exit is drawn. Given the next
   * question to ask once the questions have begun; nothing from the intro,
   * where the check has not started.
   */
  onLeave?: (checkPosition?: number) => void;
  /** Every question has been answered: fires once, as the result appears. */
  onComplete?: () => void;
  /**
   * Reopen a check left part way (B49) on this question - or on the result,
   * when it equals the question count. Read once, when the check opens.
   */
  resumeAt?: number;
  /**
   * How many of the questions answered before a resume landed, as the server
   * marked them. Null while that is not known, and then the result claims
   * nothing about it. Zero for a check that was not resumed.
   */
  landedBefore?: number | null;
  /** Those answers are still being read back. */
  landedPending?: boolean;
  /**
   * The server's outcome of the check-in (B26), once the completion write has
   * brought it back. Absent, the result draws only what the lesson itself
   * carries - nothing, for a live lesson (rule 5).
   */
  outcome?: CheckOutcome | null;
  /** The reading accommodation is on - see `readingSupport` (D30). */
  reading?: boolean;
  /** `system_busy` bracket while a spoken question plays (B16). */
  onAudioBusy?: (phase: "start" | "end") => void;
  /** Reports each confirmed answer (comprehension_response signal + review). */
  onAnswer?: (result: {
    questionIndex: number;
    selectedId: string;
    correct: boolean;
    /** From the question appearing to the confirm, monotonic (rule 4). */
    responseTimeMs?: number;
  }) => void;
  /** "Review answers" on the result → the Review Answers screen (A5). */
  onReviewAnswers?: () => void;
}) {
  const [stage, setStage] = useState<"intro" | "questions" | "result">(() =>
    resumeAt === undefined
      ? "intro"
      : resumeAt >= assessment.questions.length
        ? "result"
        : "questions",
  );
  const [qIndex, setQIndex] = useState(() =>
    resumeAt !== undefined && resumeAt < assessment.questions.length
      ? resumeAt
      : 0,
  );
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
  // When the current question was put in front of the child.
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    if (stage === "questions") shownAt.current = performance.now();
  }, [stage, qIndex]);

  if (stage === "intro") {
    return (
      <Intro
        count={assessment.questions.length}
        onStart={() => setStage("questions")}
        onLeave={onLeave ? () => onLeave() : undefined}
        reading={reading}
      />
    );
  }
  if (stage === "result") {
    return (
      <GrowthResult
        // Right answers from before a resume count too. Unknown before it,
        // a right answer since still means something landed.
        landed={
          landedBefore === null
            ? gotRight > 0
              ? gotRight
              : null
            : gotRight + landedBefore
        }
        // Which heading is true waits on them, unless one landed since.
        held={landedPending && gotRight === 0}
        outcome={outcome ?? undefined}
        assessment={assessment}
        onFinish={onFinish}
        onReviewAnswers={onReviewAnswers}
        reading={reading}
      />
    );
  }

  const total = assessment.questions.length;
  const question = assessment.questions[qIndex];
  const isLast = qIndex === total - 1;

  const advance = () => {
    setSelected(null);
    setRevealed(false);
    if (isLast) {
      setStage("result");
      onComplete?.();
    } else setQIndex((i) => i + 1);
  };

  const confirm = () => {
    if (!selected) return;
    const correct = selected === question.correctId;
    const asked = shownAt.current;
    onAnswer?.({
      questionIndex: qIndex,
      selectedId: selected,
      correct,
      ...(asked === null
        ? {}
        : { responseTimeMs: Math.max(0, Math.round(performance.now() - asked)) }),
    });
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
      {/* D36: the player's exit, where the player draws it. An answer
          already confirmed is behind the child, so the place to come back
          to is the question after it. */}
      {onLeave && (
        <div className="flex shrink-0 px-3.5 pt-2.5">
          <LeaveButton
            onLeave={() => onLeave(revealed ? qIndex + 1 : qIndex)}
          />
        </div>
      )}
      {/* Calm progress — position, never a score */}
      <div
        className={cn(
          "shrink-0 px-6 pt-5 sm:px-8 lg:px-10",
          onLeave && "pt-1",
        )}
      >
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
          {/* B16: a spoken question, keyed so each one is said on arrival. */}
          {question.promptAudio && (
            <div className="mb-4">
              <SpokenPrompt
                key={qIndex}
                src={question.promptAudio}
                onBusy={onAudioBusy}
              />
            </div>
          )}
          <h2
            className={cn(
              "text-[23px] font-semibold leading-[1.3] tracking-[-0.01em] text-nevo-near-black sm:text-[26px]",
              reading && READING_HEADING,
            )}
          >
            {question.prompt}
          </h2>

          <div className="mt-6 flex flex-col gap-2.5">
            {question.options.map((option) => (
              <AnswerOption
                key={option.id}
                label={option.label}
                reading={reading}
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
              <p
                className={cn(
                  "text-sm leading-[1.5] text-nevo-near-black",
                  reading && [READING_BODY, READING_INK],
                )}
              >
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
function Intro({
  count,
  onStart,
  onLeave,
  reading,
}: {
  count: number;
  onStart: () => void;
  onLeave?: () => void;
  reading: boolean;
}) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-6 text-center text-nevo-near-black">
      {onLeave && (
        <div className="absolute inset-x-0 top-0 flex px-3.5 pt-2.5">
          <LeaveButton onLeave={onLeave} />
        </div>
      )}
      <div className="flex w-full max-w-[300px] flex-col items-center sm:max-w-[430px]">
        <span className="flex size-[88px] items-center justify-center rounded-full bg-nevo-violet/20">
          <ClipboardCheck className="size-10 text-nevo-navy" strokeWidth={2} />
        </span>
        <h2
          className={cn(
            "mt-7 text-[23px] font-semibold tracking-[-0.01em] sm:text-[26px]",
            reading && READING_HEADING,
          )}
        >
          A few quick questions
        </h2>
        <p
          className={cn(
            "mt-3 text-base leading-[1.6] text-nevo-near-black/72 sm:text-[17px]",
            reading && [READING_BODY, READING_INK],
          )}
        >
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
 *
 * WHICH CONCEPT LANDED IS THE SERVER'S ANSWER NOW (B26). It marks the stored
 * answers and sends the two lists and the note; they are drawn as sent, and
 * the move above applies only to the authored walkthrough's own lists. A
 * concept the server counts as landed is not ours to move.
 *
 * The nothing-landed note no longer says "Nevo will bring it back when you're
 * ready for it". It is D40's promise in other words - a return the scheduler
 * was never asked for - and design ruled that kind of line renders only with
 * a next-review signal behind it.
 */
function GrowthResult({
  landed,
  held,
  outcome,
  assessment,
  onFinish,
  onReviewAnswers,
  reading,
}: {
  /** How many questions landed first time. Null when that is not known. */
  landed: number | null;
  /**
   * Whether anything landed is still being read back. The mark and heading
   * keep their place unseen until it is, rather than one heading being
   * swapped for the other in front of the child.
   */
  held: boolean;
  /** The server's outcome (B26); absent, the lesson's own lists. */
  outcome?: CheckOutcome;
  assessment: Assessment;
  onFinish: () => void;
  onReviewAnswers?: () => void;
  reading: boolean;
}) {
  const note = cn(
    "mt-3 text-center text-base leading-[1.6] text-nevo-near-black/72 sm:text-[17px]",
    reading && [READING_BODY, READING_INK],
  );
  const conceptLabel = cn(
    "text-[15px] font-medium",
    reading && [READING_BODY, READING_INK],
  );
  const nothingLanded = landed === 0 && assessment.questions.length > 0;
  /*
   * B26: THE SERVER'S LISTS WHERE IT SENT THEM. A live lesson carries none of
   * its own, so before the completion write answers - or when it fails - the
   * section is simply not drawn. The authored walkthrough keeps its own.
   */
  const masteredIn = outcome
    ? outcome.mastered
    : (assessment.masteredConcepts ?? []);
  const revisitIn = outcome
    ? outcome.revisit
    : (assessment.revisitConcepts ?? []);
  const resultNote = outcome ? outcome.note : assessment.resultNote;
  const moved = nothingLanded && !outcome;
  const mastered = moved ? [] : masteredIn;
  const revisit = moved ? [...masteredIn, ...revisitIn] : revisitIn;

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center bg-nevo-cream px-6 text-nevo-near-black">
      <div className="mx-auto w-full max-w-[300px] sm:max-w-[430px]">
        <div
          aria-hidden={held || undefined}
          className={cn(held && "invisible")}
        >
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
          <h2
            className={cn(
              "mt-[26px] text-center text-[23px] font-semibold tracking-[-0.01em] sm:text-[26px]",
              reading && READING_HEADING,
            )}
          >
            {nothingLanded
              ? "We’ll come back to this together"
              : "You’re getting the hang of this"}
          </h2>
          {/* The authored note says what the child SHOWED, so it is held back
              when they showed none of it. */}
          {nothingLanded && (
            <p className={note}>
              This one didn&rsquo;t land yet, and that&rsquo;s completely fine.
            </p>
          )}
          {!nothingLanded && resultNote && (
            <p className={note}>{resultNote}</p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          {mastered.map((item) => (
            <div
              key={item}
              className="flex items-center gap-3 rounded-[12px] bg-nevo-cream-elevated px-4 py-3.5 shadow-elevation-1"
            >
              <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-nevo-navy">
                <Check className="size-3 text-nevo-cream" strokeWidth={2.8} />
              </span>
              <span className={conceptLabel}>{item}</span>
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
              <span className={conceptLabel}>
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
