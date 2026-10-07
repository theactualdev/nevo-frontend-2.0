"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/shared";
import type { AssessmentQuestion, Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";
import { loadReviewAnswers, type ReviewAnswer } from "./reviewStore";

const LESSONS_HREF = "/student/lessons";
const HOME_HREF = "/student/dashboard";

/**
 * Review Answers (frame 18a · Review Answers) — the after-lesson assessment
 * result's "Review answers" destination (A5). A calm look-back, never a mark:
 * no score, no red, no error iconography. A correct pick shows a single navy
 * check; a miss shows the violet-dot "you chose" above the navy-check "the idea".
 *
 * NO "REVISIT SOON" TAG (design D96, 6 Oct). It is a promise of a return, and
 * design renders those only where the engine scheduled one. Nothing this
 * screen reads carries a scheduled return, so the miss is the two rows alone.
 *
 * Renders inside the app shell (like the summary). Reads the student's picks from
 * `reviewStore` (written by the player); if there are none (e.g. opened directly),
 * each question falls back to just showing the answer.
 */
export function ReviewAnswersScreen({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const questions = lesson.assessment?.questions ?? [];

  // Picks live in sessionStorage (client-only) — read after mount.
  const [answers, setAnswers] = useState<ReviewAnswer[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnswers(loadReviewAnswers(lesson.id));
  }, [lesson.id]);

  const labelFor = (q: AssessmentQuestion, id: string | undefined) =>
    q.options.find((o) => o.id === id)?.label;

  return (
    <div className="flex min-h-full flex-col bg-nevo-cream text-nevo-near-black">
      <div className="flex-1 px-6 pt-8 pb-6 sm:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-[560px] lg:max-w-[640px]">
          <span className="font-mono text-[11px] tracking-[0.08em] text-nevo-navy">
            REVIEW ANSWERS
          </span>
          <h1 className="mt-2.5 text-2xl font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
            A look back at the check-in
          </h1>
          {/* The frame adds "Your progress is saved." This screen is its own
              route and cannot know that: the completion write leaves the
              player on the same tap that opens it. So the sentence it could
              not stand behind is dropped, not reworded. */}
          <p className="mt-2.5 text-base leading-[1.6] text-nevo-near-black/72 sm:text-[17px]">
            Nothing to fix here - this is just to look back over.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            {questions.map((q, i) => {
              const picked = answers.find(
                (a) => a.questionIndex === i,
              )?.selectedId;
              const answered = picked != null;
              const isCorrect = picked === q.correctId;
              return (
                <div
                  key={i}
                  className="rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-5"
                >
                  <span className="font-mono text-[10.5px] tracking-[0.06em] text-nevo-near-black/50">
                    QUESTION {i + 1}
                  </span>
                  <p className="mt-2 text-[15px] font-semibold leading-[1.35] text-nevo-near-black sm:text-base">
                    {q.prompt}
                  </p>
                  <div className="mt-3.5 flex flex-col gap-2">
                    {answered && !isCorrect ? (
                      <>
                        <AnswerRow
                          tone="dot"
                          label="YOU CHOSE"
                          text={labelFor(q, picked)}
                        />
                        <AnswerRow
                          tone="check"
                          label="THE IDEA"
                          text={labelFor(q, q.correctId)}
                        />
                      </>
                    ) : (
                      <AnswerRow
                        tone="check"
                        label={answered ? "YOUR ANSWER" : "THE ANSWER"}
                        text={labelFor(q, q.correctId)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-6 pb-8 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-2 sm:flex-row sm:gap-3 lg:max-w-[640px]">
          <Button
            className="w-full sm:flex-1 lg:w-[260px] lg:flex-none"
            onClick={() => router.push(HOME_HREF)}
          >
            Done
          </Button>
          {/* Only where there is a summary to go back to. Without one the
              summary route says "isn't ready yet", which is no way back. */}
          {lesson.summary && (
            <Button
              variant="ghost"
              className="w-full sm:w-auto sm:px-7"
              onClick={() =>
                router.push(`${LESSONS_HREF}/${lesson.id}/summary`)
              }
            >
              Back to summary
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** One answer line: a navy check ("the idea"/correct) or a violet dot ("you chose"). */
function AnswerRow({
  tone,
  label,
  text,
}: {
  tone: "check" | "dot";
  label: string;
  text?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full",
          tone === "check" ? "bg-nevo-navy" : "bg-nevo-violet/35",
        )}
      >
        {tone === "check" ? (
          <Check className="size-3 text-nevo-cream" strokeWidth={2.8} />
        ) : (
          <span className="size-2 rounded-full bg-nevo-violet" />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <span className="font-mono text-[10px] tracking-[0.04em] text-nevo-near-black/50">
          {label}
        </span>
        <span
          className={cn(
            "text-[15px] font-medium leading-[1.4] sm:text-base",
            tone === "dot" ? "text-nevo-near-black/60" : "text-nevo-near-black",
          )}
        >
          {text}
        </span>
      </span>
    </div>
  );
}
