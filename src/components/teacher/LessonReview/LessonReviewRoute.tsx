"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useHydrated } from "@/hooks/useHydrated";
import { useLessonReviewFlow } from "@/hooks/useLessonReviewFlow";
import { getToken } from "@/lib/auth/session";
import { LessonReviewFlow } from "./LessonReviewFlow";

/**
 * Resolves C07k for one lesson, live only.
 *
 * There is no designed sample of this screen to fall back on, and inventing a
 * lesson's key points for a signed-out visitor would be the fixture problem
 * #141 removed from the lesson route. Signed out, it is a 404 like any other
 * lesson URL a visitor cannot see.
 */
export function LessonReviewRoute({
  lessonId,
  step,
}: {
  lessonId: string;
  step?: 1 | 2 | 3 | 4;
}) {
  const hydrated = useHydrated();
  const flow = useLessonReviewFlow(lessonId);

  if (!hydrated) return null;
  if (!getToken() || flow.missing) notFound();

  const { lesson, review } = flow;
  if (lesson && review) {
    const reviewable =
      (lesson.status === "completed" || lesson.status === "completed_with_review") &&
      lesson.segments.length > 0;
    if (!reviewable) {
      return (
        <Message title={lesson.title} back={lessonId}>
          {lesson.status === "failed"
            ? "Nevo couldn’t read this file, so there is nothing to review."
            : "Nevo is still reading this lesson. You can review it once it’s done."}
        </Message>
      );
    }
    return <LessonReviewFlow flow={{ ...flow, lesson, review }} initialStep={step} />;
  }

  if (flow.failed) {
    return (
      <Message title="We couldn’t load this review" back={lessonId}>
        It hasn&rsquo;t gone anywhere, and nothing you did is lost. Try again in a moment.
      </Message>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
      <div className="h-[55px] flex-none border-b border-nevo-near-black/9 xl:h-[63px]" />
      <div className="mx-auto w-full max-w-[640px] px-7 py-6 xl:max-w-[760px] xl:px-10 xl:py-8">
        <div className="h-3 w-48 animate-pulse rounded-full bg-nevo-cream-elevated" />
        <div className="mt-4 h-8 w-[70%] animate-pulse rounded-[10px] bg-nevo-cream-elevated" />
        <div className="mt-7 h-[180px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
      </div>
    </div>
  );
}

function Message({
  title,
  back,
  children,
}: {
  title: string;
  back: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[660px] rounded-[12px] bg-nevo-cream-elevated px-[26px] py-7 shadow-elevation-1">
        <h1 className="text-[17px] font-semibold text-nevo-near-black">{title}</h1>
        <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/62">{children}</p>
        <Link
          href={`/teacher/lessons/${back}`}
          className="mt-5 inline-flex h-[46px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
        >
          Back to the lesson
        </Link>
      </div>
    </div>
  );
}
