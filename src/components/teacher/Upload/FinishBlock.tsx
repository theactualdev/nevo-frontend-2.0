"use client";

import Link from "next/link";
import type { FinishView } from "@/components/teacher/LessonReview/reviewModel";
import { reviewHrefFor } from "@/lib/lessons/signOff";

/**
 * C07j LU-04, LU-04b and LU-04c: the top of the upload's finish screen, by
 * where the lesson's review stands on the SERVER. Built against design
 * ac1e61c (8d421d3's corrected C07j) and SCRUM-318 (Lydia, 7 Nov).
 *
 * - LU-04, nothing reviewed yet: "“{title}” is ready for your review", and
 *   the opening line every review state now shares, "Nothing reaches your
 *   class until you have been through it." SCRUM-318 drops "The read, listen
 *   and watch versions are built." (untrue: formats are per section, and
 *   pictures are often still being made) and with it the "Give them a quick
 *   review" that leaned on it.
 * - LU-04b, part-way: "Your lesson is ready for review", the same opening
 *   line, and ONE step line - the overview, the key points or the checks -
 *   only where it is exactly so, else "You're part-way through reviewing
 *   this." NO step ladder and NO number: "Counting the steps here adds
 *   nothing and invites the error this page used to make". Pictures are not a
 *   step here; they are approved inside the review's first step.
 * - LU-04c, reviewed: unchanged - "Reviewed by {names} · {day}", Assign, and
 *   View in library.
 *
 * The split notice and Try that again stay on the page beneath; the list of
 * sections is gone (SCRUM-318).
 */

const OPENING = "Nothing reaches your class until you have been through it.";

const PRIMARY =
  "inline-flex h-[50px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[22px] text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93";
const SECONDARY =
  "inline-flex h-[50px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-[22px] text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6";
const H2 = "mt-4 text-[22px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[25px]";
const LINE = "max-w-[540px] text-[14.5px] leading-[1.6] text-nevo-near-black/66";

export function FinishBlock({
  view,
  lessonId,
  title,
  fileName,
  onUploadAnother,
}: {
  view: FinishView;
  lessonId: string;
  title: string;
  fileName: string;
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
          <h2 className={H2}>{`“${title}” is ready for your review`}</h2>
          <p className={`${LINE} mt-2.5`}>{OPENING}</p>
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
          <h2 className={H2}>Your lesson is ready for review</h2>
          <p className={`${LINE} mt-2.5`}>{OPENING}</p>
          <p className={`${LINE} mt-1.5`}>{view.stepLine}</p>
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
          <h2 className={H2}>{`“${title}” is reviewed and ready`}</h2>
          <p className={`${LINE} mt-2.5`}>
            You&rsquo;ve reviewed every segment. It&rsquo;s in your library and ready to assign to a
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
