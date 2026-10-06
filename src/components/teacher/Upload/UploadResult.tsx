"use client";

import Link from "next/link";
import { useLessonRegenerate } from "@/hooks/useLessonRegenerate";
import { useLessonReview } from "@/hooks/useLessonReview";
import { useSegmentReview } from "@/hooks/useSegmentReview";
import type { LessonDetailResponse } from "@/lib/api/lessons";
import type {
  ContentModality,
  LessonContentType,
  ParsedLessonSegment,
} from "@/lib/api/content";
import { SplitSourceNotice } from "@/components/teacher/Library/SplitSourceNotice";
import { stillToCheck } from "@/components/teacher/Library/LessonDetailActions";
import { cn } from "@/lib/utils";
import { IncidentLine } from "./ParseFallback";

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

const TYPE_LABEL: Record<LessonContentType, string> = {
  explanatory_text: "Explanatory",
  worked_example: "Worked example",
  practice_question: "Practice",
  visual_diagram: "Diagram",
  definition: "Definition",
  summary: "Summary",
  calculation: "Calculation",
};

const MODALITY_LABEL: Record<ContentModality, string> = {
  text: "text",
  audio: "audio",
  visual: "visual",
  interactive: "interactive",
};

function Segment({
  segment,
  index,
}: {
  segment: ParsedLessonSegment;
  index: number;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 px-[22px] py-4 xl:flex-row xl:items-start xl:gap-4",
        segment.needsReview && "border-l-[3px] border-nevo-violet",
      )}
    >
      <span className="w-6 shrink-0 text-[13px] text-nevo-near-black/40 tabular-nums">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[15px] font-semibold text-nevo-near-black">
            {segment.title ?? `Section ${index + 1}`}
          </span>
          <span className="shrink-0 rounded-full bg-nevo-navy/9 px-[9px] py-0.5 text-[11px] font-semibold whitespace-nowrap text-nevo-near-black/55">
            {TYPE_LABEL[segment.contentType] ??
              segment.contentType.replace(/_/g, " ")}
          </span>
        </div>
        {segment.body && (
          <p className="mt-1.5 line-clamp-2 max-w-[62ch] text-[13.5px] leading-[1.5] text-nevo-near-black/62">
            {segment.body}
          </p>
        )}
        {segment.needsReview && (
          /*
           * "Worth a look", and NOT the reasons.
           *
           * Both this row and the upload result used to append
           * `reviewReasons.map(r => r.replace(/_/g, " ").toLowerCase())` - which
           * is, word for word, the thing `SegmentReviewReason`'s own contract
           * description exists to prevent: "Enumerated so the console can render
           * its own copy per reason instead of printing the raw token with
           * underscores swapped for spaces." A teacher was reading
           * "audio generation failed".
           *
           * The console DOES have that copy, in `LiveVariantReview`, written per
           * reason and in sentences. It is too long for an inline chip, and
           * inventing a second short register for the same six reasons is how
           * two wordings drift. So the row says the one true thing and the
           * variant review link beside it - added the same day - goes to the
           * screen that explains which. Flagged to design.
           */
          <p className="mt-2 text-[13px] leading-[1.5] text-nevo-navy">
            Worth a look
          </p>
        )}
      </div>
      {segment.availableModalities.length > 0 && (
        <span className="shrink-0 text-[12.5px] text-nevo-near-black/45">
          {segment.availableModalities
            .map((m) => MODALITY_LABEL[m] ?? m)
            .join(" · ")}
        </span>
      )}
    </div>
  );
}

export function UploadResult({
  lesson,
  fileName,
  onUploadAnother,
  onRegenerated,
}: {
  lesson: LessonDetailResponse;
  fileName: string;
  onUploadAnother: () => void;
  /** The re-read lesson, which replaces this one in place. */
  onRegenerated?: (lesson: LessonDetailResponse) => void;
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
  const blocked = !verdict.ready || checking;
  const review = lesson.reviewSegmentCount;
  const rereading = regenerate.state === "running";

  return (
    <div className="mx-auto w-full max-w-[860px] px-6 pb-10">
      <h2 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
        {lesson.title}
      </h2>
      <p className="mt-[5px] text-[14.5px] text-nevo-near-black/60">
        {`From ${fileName} · ${lesson.segmentCount} ${lesson.segmentCount === 1 ? "section" : "sections"}`}
      </p>

      {/* The first place a teacher meets the lesson, so the first place this
          can be said. "Saved to your library" below is true either way and
          says nothing about what was saved. */}
      <SplitSourceNotice segments={segments} />

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
            {review > 0
              ? `Nevo read your file and split it into ${lesson.segmentCount} sections. ${review} ${review === 1 ? "is worth" : "are worth"} a look before you assign it.`
              : "Nevo read your file and split it into sections. Nothing needs your attention."}
          </p>
        </div>
      </div>

      {lesson.confirmationSummary && (
        <p className="mt-4 max-w-[68ch] text-[14.5px] leading-[1.6] text-nevo-near-black/72">
          {lesson.confirmationSummary}
        </p>
      )}

      <h3 className="mt-8 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:text-sm">
        What Nevo found
      </h3>
      <div className="mt-3.5 divide-y divide-nevo-near-black/7 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1 xl:mt-4">
        {segments.map((s, i) => (
          <Segment key={s.id} segment={s} index={i} />
        ))}
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        {blocked ? (
          <span
            aria-disabled="true"
            className="inline-flex h-[50px] items-center rounded-[10px] bg-nevo-navy/30 px-[22px] text-[15px] font-semibold text-nevo-cream"
          >
            Assign to a class
          </span>
        ) : (
          <Link
            href={`/teacher/lessons/assign?lesson=${lesson.id}`}
            className="inline-flex h-[50px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[22px] text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
          >
            Assign to a class
          </Link>
        )}
        <Link
          href={`/teacher/lessons/${lesson.id}`}
          className="inline-flex h-[50px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-[22px] text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
        >
          Open the lesson
        </Link>
        {/* Only where a caller can take the new lesson. No handler means no
            control, rather than a button that reads the lesson again and
            throws the result away. */}
        {onRegenerated && (
          <button
            type="button"
            onClick={() => regenerate.run(lesson.id)}
            disabled={rereading}
            className="inline-flex h-[50px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-[22px] text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-default disabled:opacity-55"
          >
            {rereading ? "Reading it again…" : "Try that again"}
          </button>
        )}
        <button
          type="button"
          onClick={onUploadAnother}
          className="inline-flex h-[50px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-[22px] text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
        >
          Upload another
        </button>
      </div>

      {blocked && !checking && (
        <p className="mt-2.5 text-[13px] font-medium text-nevo-navy">
          {stillToCheck(verdict.outstanding, sections.remaining)}
        </p>
      )}

      {rereading && (
        <p className="mt-3 max-w-[62ch] text-[14px] leading-[1.55] text-nevo-near-black/68">
          Nevo is reading the same lesson again. It replaces what is above when
          it finishes, so you will not end up with two copies.
        </p>
      )}

      {regenerate.state === "failed" && (
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
