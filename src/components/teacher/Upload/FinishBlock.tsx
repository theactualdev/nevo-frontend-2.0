"use client";

import Link from "next/link";
import { REVIEW_STEPS, type FinishView } from "@/components/teacher/LessonReview/reviewModel";
import { reviewHrefFor } from "@/lib/lessons/signOff";
import { cn } from "@/lib/utils";

/**
 * C07j LU-04, LU-04b and LU-04c (1397ec4): the top of the upload's finish
 * screen, by where the lesson's review stands on the SERVER.
 *
 * The Hub's decisions of 6 Nov, against the deployed contract:
 *  1. LU-04's "The read, listen and watch versions are built." is DROPPED:
 *     formats are per section, and pictures and narration are often still
 *     being made when the lesson opens (Lydia's 4 Nov principle).
 *  2. "Give them a quick review and the lesson's ready to assign - nothing
 *     reaches your students until you have." is KEPT: nothing reaches a child
 *     until it is assigned, and Assign waits on the review.
 *  3. LU-04b's step bar is the review's REAL five steps (the frame drew four,
 *     before the checks step).
 *  4. "Your students won't see it until the review is finished." only while
 *     the server's `readyToAssign` is false - after that it could be
 *     assigned, and the sentence would be untrue.
 *  5. "You've approved the structure and are on the key points." only when
 *     it is exactly so; otherwise the heading alone, "You're part-way
 *     through reviewing this". Lydia has been asked for a line per step.
 *  6. LU-04c's record from the sign-offs on record.
 * The sections list, the split-source notice and "Try that again" stay below
 * until she rules (7).
 */

const PRIMARY =
  "inline-flex h-[50px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[22px] text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93";
const SECONDARY =
  "inline-flex h-[50px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-[22px] text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6";

function Tick() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function FinishBlock({
  view,
  lessonId,
  title,
  fileName,
  readyToAssign,
  onUploadAnother,
}: {
  view: FinishView;
  lessonId: string;
  title: string;
  fileName: string;
  readyToAssign: boolean;
  onUploadAnother: () => void;
}) {
  const eyebrow =
    view.stage === "reviewed" ? "Reviewed" : view.stage === "partway" ? "Reviewing" : "Ready to review";
  return (
    <section aria-label={eyebrow} className="flex flex-col items-center pt-2 text-center">
      <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-nevo-violet-text uppercase">
        {eyebrow}
      </span>
      <span className="mt-1.5 text-[13.5px] text-nevo-near-black/55">{fileName}</span>

      {view.stage === "unstarted" && (
        <>
          <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[25px]">
            {`“${title}” is ready for your review`}
          </h2>
          <p className="mt-2.5 max-w-[540px] text-[14.5px] leading-[1.6] text-nevo-near-black/66">
            Give them a quick review and the lesson&rsquo;s ready to assign - nothing reaches your
            students until you have.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href={reviewHrefFor(lessonId)} className={PRIMARY}>
              Review lesson
            </Link>
            <button type="button" onClick={onUploadAnother} className={SECONDARY}>
              Upload another
            </button>
          </div>
        </>
      )}

      {view.stage === "partway" && (
        <>
          <ol aria-label="Review steps" className="mt-5 flex list-none flex-wrap items-center justify-center gap-[7px] p-0 xl:gap-2.5">
            {REVIEW_STEPS.map((label, i) => {
              const n = i + 1;
              const done = view.done[i] && n !== view.next;
              const current = n === view.next;
              return (
                <li key={label} className="flex items-center gap-[7px]">
                  <span
                    className={cn(
                      "inline-flex size-[24px] items-center justify-center rounded-full text-[11.5px] font-semibold",
                      done || current
                        ? "bg-nevo-navy text-nevo-cream"
                        : "border-[1.5px] border-nevo-navy/30 text-nevo-near-black/50",
                    )}
                  >
                    {done ? <Tick /> : n}
                  </span>
                  <span
                    className={cn(
                      "text-[12.5px] whitespace-nowrap",
                      current ? "font-semibold text-nevo-near-black" : "text-nevo-near-black/55",
                    )}
                  >
                    {label}
                    {done && <span className="sr-only"> (done)</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <h2 className="mt-5 text-[22px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[25px]">
            You&rsquo;re part-way through reviewing this
          </h2>
          {(view.onKeyPoints || !readyToAssign) && (
            <p className="mt-2.5 max-w-[540px] text-[14.5px] leading-[1.6] text-nevo-near-black/66">
              {[
                view.onKeyPoints ? "You’ve approved the structure and are on the key points." : null,
                !readyToAssign ? "Your students won’t see it until the review is finished." : null,
              ]
                .filter(Boolean)
                .join(" ")}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href={`${reviewHrefFor(lessonId)}?step=${view.next}`} className={PRIMARY}>
              Continue review
            </Link>
            <Link href="/teacher/lessons" className={SECONDARY}>
              Back to my library
            </Link>
          </div>
        </>
      )}

      {view.stage === "reviewed" && (
        <>
          <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[25px]">
            {`“${title}” is reviewed and ready`}
          </h2>
          <p className="mt-2.5 max-w-[540px] text-[14.5px] leading-[1.6] text-nevo-near-black/66">
            You&rsquo;ve reviewed every section. It&rsquo;s in your library and ready to assign to a
            class.
          </p>
          {view.reviewedBy && (
            <span className="mt-4 inline-flex items-center gap-[9px] rounded-full bg-nevo-violet/16 px-[15px] py-2 text-[13px] text-nevo-near-black/78">
              {view.reviewedBy}
            </span>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href={`/teacher/lessons/assign?lesson=${lessonId}`} className={PRIMARY}>
              Assign to a class
            </Link>
            <Link href={`/teacher/lessons/${lessonId}`} className={SECONDARY}>
              View in library
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
