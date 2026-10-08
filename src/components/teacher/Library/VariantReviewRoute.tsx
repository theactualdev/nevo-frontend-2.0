"use client";

import Link from "next/link";
import { useHydrated } from "@/hooks/useHydrated";
import { useLessonDetail } from "@/hooks/useLessonDetail";
import { getToken } from "@/lib/auth/session";
import type {
  LessonDetailData,
  LibraryLesson,
} from "@/lib/mocks/teacherLibrary";
import { VariantReview } from "./VariantReview";
import { LiveVariantReview } from "./LiveVariantReview";
import { SampleRegion } from "@/components/shared/SampleRegion";

/**
 * C16d was never actually blocked, and the paragraph that used to sit here
 * said it was. Both of its claims are false, and were false when written
 * (confirmed by backend, 11 Sep 2026):
 *
 *  - "free-form objects with no declared shape" - each variant is a declared
 *    schema now: `textVariant` is `anyOf [TextVariant, null]`, and the other
 *    four likewise.
 *  - "they appear ONLY on `ParsedLessonSegmentResponse` ... no lesson READ
 *    carries them at all" - all five sit on `LessonSegmentResponse`, reached
 *    by `GET /api/v1/lessons/{lesson_id}` and `GET /api/content/lessons/
 *    {lessonId}`, and are typed locally at `lib/api/variants.ts`.
 *
 * So a signed-in teacher gets C16d for real: the route reads the lesson,
 * picks the section by its number, and hands it to `LiveVariantReview`. The
 * fixture screen is for a visitor with no session, and the states at the
 * bottom are the two genuine misses - a lesson that would not load, and a
 * section number it does not have.
 */
export function VariantReviewRoute({
  fixture,
  sectionIndex,
  lessonId,
}: {
  fixture: (LibraryLesson & { detail: LessonDetailData }) | null;
  sectionIndex: number;
  lessonId: string;
}) {
  const hydrated = useHydrated();
  // Hooks run before any early return, per the rules of hooks. The read is
  // cheap and the lesson page has almost always warmed it already.
  const { lesson, loading, missing } = useLessonDetail(lessonId);

  if (!hydrated) return null;

  if (!getToken() && fixture) {
    const max = fixture.detail.sections.length;
    // Marked like its siblings - ClassRoute, LessonRoute, StudentRoute.
    return (
      <SampleRegion kind="teacher:variant-review">
        <VariantReview
          lesson={fixture}
          sectionIndex={Math.min(sectionIndex, max)}
        />
      </SampleRegion>
    );
  }

  // A real lesson, read live. Segments come back in `sequenceOrder`, but the
  // URL counts sections from 1, so sort before indexing rather than trusting
  // the array order the server happened to serialise.
  const segments = lesson
    ? [...lesson.segments].sort((a, b) => a.sequenceOrder - b.sequenceOrder)
    : [];
  const segment = segments[sectionIndex - 1];

  if (segment && lesson) {
    return (
      <LiveVariantReview
        lessonId={lessonId}
        lessonTitle={lesson.title}
        segment={segment}
        sectionIndex={sectionIndex}
        // The route already sorted the full segment list to index into it, so
        // the count is known here and nowhere further down.
        segmentCount={segments.length}
      />
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
        <div className="mx-auto flex max-w-[680px] flex-col gap-4 xl:max-w-[820px]">
          <div className="h-8 w-[62%] animate-pulse rounded-[8px] bg-nevo-cream-elevated" />
          <div className="h-[220px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
        </div>
      </div>
    );
  }

  /*
   * The honest states, and note what is NOT here any more.
   *
   * This route used to answer every signed-in teacher with "Variants aren't
   * available yet ... they're not part of what a lesson gives us back". The
   * variants were on `LessonSegmentResponse` the whole time; they were null on
   * every lesson because the parse was falling back, and we mistook empty data
   * for an absent contract. The screen told teachers a feature was impossible
   * while the field sat, declared, in a response the console had fetched.
   *
   * What remains is a genuine miss - the lesson would not load, or it holds no
   * section with that number - and each says which.
   */
  const outOfRange = Boolean(lesson) && !segment;

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[660px] rounded-[12px] bg-nevo-cream-elevated px-[26px] py-7 shadow-elevation-1">
        <h1 className="text-[17px] font-semibold text-nevo-near-black">
          {missing
            ? "We couldn’t find this lesson"
            : outOfRange
              ? "This lesson has no section " + sectionIndex
              : "We couldn’t load this lesson"}
        </h1>
        <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/62">
          {missing
            ? "It may have been removed from your library."
            : outOfRange
              ? "It may have been re-parsed since this link was made."
              : "It hasn’t gone anywhere. Try again in a moment."}
        </p>
        <Link
          href={`/teacher/lessons/${lessonId}`}
          className="mt-5 inline-flex h-[46px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
        >
          Back to the lesson
        </Link>
      </div>
    </div>
  );
}
