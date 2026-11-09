"use client";

import Link from "next/link";
import { useState } from "react";
import { useLessonRegenerate } from "@/hooks/useLessonRegenerate";
import { splitLine } from "./splitLine";
import { useLessonReview } from "@/hooks/useLessonReview";
import { QuestionsLeftOut } from "./QuestionsLeftOut";
import { useSegmentReview } from "@/hooks/useSegmentReview";
import type { LessonDetailResponse } from "@/lib/api/lessons";
import { SplitSourceNotice } from "@/components/teacher/Library/SplitSourceNotice";
import { stillToCheck } from "@/components/teacher/Library/LessonDetailActions";
import { assignRefusal, reviewHrefFor } from "@/lib/lessons/signOff";
import { IncidentLine, SAFETY_HELD_LINE } from "./ParseFallback";
import { FinishBlock } from "./FinishBlock";
import { finishView } from "@/components/teacher/LessonReview/reviewModel";

/**
 * What came back from a real upload (C07g step 3, honestly).
 *
 * The frame's section review groups segments into modules and shows a
 * per-segment minute estimate. Neither exists in the response: modules live in
 * the staged pipeline's `structure`, which the spec declares as a free-form
 * object with no fields, and minutes have no source at all. So this reviews
 * what the parser actually produced - the segments in order, their kind, and
 * which ones it wants confirmed and why.
 *
 * The lesson already exists by the time this renders: the staged upload's
 * confirm creates it, and the wizard reads it back before showing this. So
 * the screen says the lesson is saved rather than implying a pending
 * decision.
 *
 * The staged `structure` is typed as of 31 Aug and gained `lessons[]` on
 * 1 Sep, so the module-grouping half of C07g is built - on the block path,
 * in `LiveStructureTree`. This screen is the SINGLE-lesson outcome and stays
 * as it is.
 *
 * WHAT A TEACHER CAN DO WHEN NEVO GETS IT WRONG (design ruled it into v1,
 * 17 Sep). "Try that again" re-runs the reading over the lesson's own stored
 * text, IN PLACE. That matters more than it sounds: re-uploading was the only
 * remedy before it, and re-uploading leaves two assignable lessons with the
 * same title and nothing to tell them apart, on a product with no delete on
 * any lesson route. Regenerating removes the duplicate rather than adding one,
 * so it is the primary remedy and re-upload is the fallback.
 *
 * The approval gate is the other half of the same answer: since 17 Sep a newly
 * parsed lesson cannot be assigned until a teacher approves every segment, so
 * nothing a teacher has not read reaches a child.
 *
 * "ASSIGN TO A CLASS" LEADS, AS LU-04 AND C14 B1 BOTH DRAW IT, and waits on
 * the same gate as the lesson page (SCRUM-153, LR-04): inactive, with what is
 * left under it, until the server's `readyToAssign` says it can go. Straight
 * after an upload that is the usual case, which is why "Open the lesson" -
 * where the checking happens - stays beside it.
 */

export function UploadResult({
  lesson,
  fileName,
  onUploadAnother,
  onRegenerated,
  reviewNotes,
}: {
  lesson: LessonDetailResponse;
  fileName: string;
  onUploadAnother: () => void;
  /** The re-read lesson, which replaces this one in place. */
  onRegenerated?: (lesson: LessonDetailResponse) => void;
  /**
   * The upload's own review notes (its structure document's), for the
   * questions the parse left out. The lesson read does not carry them.
   */
  reviewNotes?: readonly unknown[];
}) {
  const verdict = useLessonReview(lesson.id);
  // A re-read can change what is flagged, so the verdict is asked again.
  const regenerate = useLessonRegenerate((next) => {
    onRegenerated?.(next);
    verdict.refresh();
  });
  const segments = [...lesson.segments].sort(
    (a, b) => a.sequenceOrder - b.sequenceOrder,
  );
  const sections = useSegmentReview(lesson.id, segments);
  const checking = verdict.loading;
  /* The lesson page's gate, both halves: the server's `readyToAssign` and
     its lesson-wide sign-off, which Assign waits for (Lydia, 25 Oct). */
  const awaitingReview = verdict.signedOff === false;
  const blocked = !verdict.ready || awaitingReview || checking;
  const review = lesson.reviewSegmentCount;
  const rereading = regenerate.state === "running";
  /*
   * A RE-READ A SAFETY CHECK STOPPED (`reasonCode: "safety_held"`, backend
   * 06396db). Said in Lydia's words, as the upload screens say it (9 Nov, item
   * 6), and with no way to send it again: a refusal refuses again. The lesson
   * above is untouched - the re-read replaces it only when it finishes.
   */
  const rereadHeld = regenerate.state === "failed" && regenerate.reasonCode === "safety_held";
  /* SCRUM-319: Assign stays pressable; a tap while held explains it. */
  const [explained, setExplained] = useState(false);
  const refusal = assignRefusal(lesson.id, verdict.outstandingSteps);
  /*
   * C07j LU-04 / 04b / 04c, by the server's own review - and only over an
   * answered read: a loading or failed one draws the screen as it was, with
   * no claim about where the review stands. LU-04c offers Assign, so it is
   * drawn only where Assign is open.
   */
  const read = !checking && !verdict.failed && verdict.signedOff !== null ? verdict.review : null;
  const drawn = read ? finishView(read, segments) : null;
  const finish = drawn && (drawn.stage !== "reviewed" || !blocked) ? drawn : null;

  return (
    <div className="mx-auto w-full max-w-[820px] px-6 pb-10">
      {finish ? (
        <FinishBlock
          view={finish}
          lessonId={lesson.id}
          title={lesson.title}
          fileName={fileName}
          onUploadAnother={onUploadAnother}
        />
      ) : (
        <>
          <h2 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
            {lesson.title}
          </h2>
          <p className="mt-[5px] text-[14.5px] text-nevo-near-black/60">
            {`From ${fileName} · ${splitLine(lesson)}`}
          </p>
        </>
      )}

      {/* The first place a teacher meets the lesson, so the first place this
          can be said. "Saved to your library" below is true either way and
          says nothing about what was saved. */}
      <SplitSourceNotice segments={segments} />

      {/* The questions the parse left out, in the server's words. After a
          re-read, that run's notes: the upload's describe a lesson that has
          since been read again. */}
      <QuestionsLeftOut notes={regenerate.reviewNotes ?? reviewNotes} className="mt-5" />

      <div className="mt-5 flex max-w-[660px] items-start gap-3.5 rounded-[12px] bg-nevo-cream-elevated px-[22px] py-5 shadow-elevation-1">
        <span className="mt-px shrink-0 text-nevo-navy">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </span>
        <div>
          <h3 className="text-[15.5px] font-semibold text-nevo-near-black xl:text-base">
            Saved to your library
          </h3>
          <p className="mt-1.5 text-sm leading-[1.55] text-nevo-near-black/68 xl:text-[14.5px]">
            {/* "Nothing needs your attention" only once the review has said
                so. It counted flagged sections alone, and sat above "2 key
                points still to check" (4 Nov sweep). */}
            {review > 0
              ? `Nevo read your file and split it into ${lesson.segmentCount} ${lesson.segmentCount === 1 ? "segment" : "segments"}. ${review} ${review === 1 ? "is worth" : "are worth"} a look before you assign it.`
              : !checking && !verdict.failed && verdict.ready && !awaitingReview
                ? "Nevo read your file and split it into segments. Nothing needs your attention."
                : "Nevo read your file and split it into segments."}
          </p>
        </div>
      </div>

      {lesson.confirmationSummary && (
        <p className="mt-4 max-w-[68ch] text-[14.5px] leading-[1.6] text-nevo-near-black/72">
          {lesson.confirmationSummary}
        </p>
      )}

      {/* SCRUM-318 (Lydia, 7 Nov): the list of sections comes OUT - "the
          structure step has already shown the teacher every section and had
          them accept it, so showing the same list again asks them to read it
          twice and changes nothing." The split notice above and Try that
          again below stay exactly as they are. */}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        {/* THE WAY INTO THE REVIEW (backlog item 19). Assign was held with
            "Review this lesson to assign it." and nothing to press - the
            teacher had to open the lesson and find "Review in five steps".
            The lesson page's own words, and the one live primary while
            Assign waits. */}
        {/* Below the C07j block, only what it does not already offer: the
            way into the review is its own primary in LU-04 and LU-04b. */}
        {blocked && !checking && !finish && (
          <Link
            href={reviewHrefFor(lesson.id)}
            className="inline-flex h-[50px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[22px] text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
          >
            Review in five steps
          </Link>
        )}
        {finish?.stage === "reviewed" ? null : blocked ? (
          <button
            type="button"
            onClick={() => setExplained(true)}
            aria-expanded={explained}
            className="inline-flex h-[50px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[22px] text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
          >
            Assign to a class
          </button>
        ) : (
          <Link
            href={`/teacher/lessons/assign?lesson=${lesson.id}`}
            className="inline-flex h-[50px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[22px] text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
          >
            Assign to a class
          </Link>
        )}
        {finish?.stage !== "reviewed" && (
          <Link
            href={`/teacher/lessons/${lesson.id}`}
            className="inline-flex h-[50px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-[22px] text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
          >
            Open the lesson
          </Link>
        )}
        {/* Only where a caller can take the new lesson. No handler means no
            control, rather than a button that reads the lesson again and
            throws the result away. */}
        {onRegenerated && !rereadHeld && (
          <button
            type="button"
            onClick={() => regenerate.run(lesson.id)}
            disabled={rereading}
            className="inline-flex h-[50px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-[22px] text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-default disabled:opacity-55"
          >
            {rereading ? "Reading it again…" : "Try that again"}
          </button>
        )}
        {finish?.stage !== "unstarted" && (
          <button
            type="button"
            onClick={onUploadAnother}
            className="inline-flex h-[50px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-[22px] text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
          >
            Upload another
          </button>
        )}
      </div>

      {blocked && !checking && explained && (
        <div role="status" className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-[13px] font-medium text-nevo-navy">
            {refusal.line ?? stillToCheck(verdict.outstanding, sections.remaining, awaitingReview)}
          </p>
          {/* The route back to a NAMED step; with none named, Review in five
              steps beside Assign is already the way in. */}
          {refusal.line && (
            <Link href={refusal.href} className="text-[13px] font-semibold text-nevo-navy underline underline-offset-2">
              {refusal.label}
            </Link>
          )}
        </div>
      )}

      {rereading && (
        <p className="mt-3 max-w-[62ch] text-[14px] leading-[1.55] text-nevo-near-black/68">
          Nevo is reading the same lesson again. It replaces what is above when
          it finishes, so you will not end up with two copies.
        </p>
      )}

      {rereadHeld && (
        <p className="mt-3 max-w-[62ch] text-[14px] leading-[1.55] text-nevo-near-black/68">
          {/* Lydia's line and nothing beyond it: not the server's sentence, not
              the reference (as on the upload screens). */}
          {SAFETY_HELD_LINE}
        </p>
      )}

      {regenerate.state === "failed" && !rereadHeld && (
        <>
          <p className="mt-3 max-w-[62ch] text-[14px] leading-[1.55] text-nevo-near-black/68">
            {/* The server's reason leads where the parse gave one - as it
                does on the upload screens - and ours stands where it did not,
                which is every failure that never reached the parse. */}
            {regenerate.failureReason ??
              "That did not go through, and nothing about the lesson has changed. You can try again, or upload the file once more."}
          </p>
          <IncidentLine id={regenerate.incident} />
        </>
      )}
    </div>
  );
}
