import type { Metadata } from "next";
import { LessonReviewRoute } from "@/components/teacher/LessonReview/LessonReviewRoute";

export const metadata: Metadata = {
  title: "Review a lesson - Nevo",
};

// C07k Lesson Review Flow - five steps, one job each: what Nevo made of the
// lesson, its key points, its checks (SCRUM-291), its rewrites, then live
// (Lydia, 19 and 26 Oct).
//
// `?step=2` opens a step directly, so a link from the lesson page can land on
// the one that needs a teacher. Next.js 16: `params` and `searchParams` are
// Promises and must be awaited.
export default async function LessonReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const [{ lessonId }, { step }] = await Promise.all([params, searchParams]);
  const n = Number.parseInt(step ?? "", 10);
  return (
    <LessonReviewRoute
      lessonId={lessonId}
      step={n >= 1 && n <= 5 ? (n as 1 | 2 | 3 | 4 | 5) : undefined}
    />
  );
}
