"use client";

import { notFound } from "next/navigation";
import { useLessonDetail } from "@/hooks/useLessonDetail";
import { useHydrated } from "@/hooks/useHydrated";
import { getToken } from "@/lib/auth/session";
import type {
  LessonDetailData,
  LibraryLesson,
} from "@/lib/mocks/teacherLibrary";
import { LessonDetail } from "./LessonDetail";
import { LiveLessonDetail } from "./LiveLessonDetail";
import { SampleRegion } from "@/components/shared/SampleRegion";

/**
 * Resolves a lesson route, live first.
 *
 * A real lesson is only ever itself: the live read is tried before the
 * fixtures, so a lesson can never be answered with a fixture that happens to
 * share its id - the mistake that had a real class showing invented students
 * until #141.
 *
 * A 404 from the API is a 404 here. Any other failure is not: a lesson that
 * exists but could not be loaded gets a retry, because telling a teacher their
 * lesson is gone when the network blinked is the worse error.
 */
export function LessonRoute({
  fixture,
  lessonId,
}: {
  fixture: (LibraryLesson & { detail: LessonDetailData }) | null;
  lessonId: string;
}) {
  const {
    lesson,
    modules,
    assignments,
    assignmentsFailed,
    progress,
    loading,
    missing,
    failed,
  } = useLessonDetail(lessonId);
  const hydrated = useHydrated();

  // Nothing that reads the token may decide before the client is running:
  // on the server every getToken() is false, so a real lesson fell through to
  // notFound() and the page answered 404.
  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
        <div className="mx-auto max-w-[860px]">
          <div className="h-5 w-32 animate-pulse rounded bg-nevo-cream-elevated" />
          <div className="mt-4 h-8 w-72 animate-pulse rounded bg-nevo-cream-elevated" />
          <div className="mt-8 h-[280px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
        </div>
      </div>
    );
  }

  if (lesson) {
    return (
      <LiveLessonDetail
        lesson={lesson}
        modules={modules}
        assignments={assignments}
        assignmentsFailed={assignmentsFailed}
        progress={progress}
        classes={lesson.classes}
      />
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
        <div className="mx-auto max-w-[860px]">
          <div className="h-5 w-32 animate-pulse rounded bg-nevo-cream-elevated" />
          <div className="mt-4 h-8 w-72 animate-pulse rounded bg-nevo-cream-elevated" />
          <div className="mt-8 h-[280px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
        <div className="mx-auto max-w-[660px] rounded-[12px] bg-nevo-cream-elevated px-[26px] py-7 shadow-elevation-1">
          <h2 className="text-[17px] font-semibold text-nevo-near-black">
            We couldn&rsquo;t load this lesson
          </h2>
          <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/62">
            It hasn&rsquo;t gone anywhere. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 h-[46px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Fixtures back the designed screen only when there is no live data at all.
  if (!getToken() && fixture)
    return (
      <SampleRegion kind="teacher:lesson-detail">
        <LessonDetail lesson={fixture} />
      </SampleRegion>
    );

  if (missing || !getToken()) notFound();

  return null;
}
