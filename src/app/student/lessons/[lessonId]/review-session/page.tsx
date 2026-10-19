import type { Metadata } from "next";
import { LessonRoute } from "@/components/student/Lesson/LessonRoute";
import { readReviewBack } from "@/lib/lessons/reviewHref";

export const metadata: Metadata = {
  title: "Review session - Nevo",
};

// Review session (37d): spaced retrieval that reuses the whole lesson player as
// a variant. The backend schedules these and links the child in when a concept
// is due; the route renders whatever lesson it is pointed at.
//
// `?concept=` is which concept the review is FOR, carried from the due-review
// chip on Subject Detail. `GET /api/scheduler/due-reviews/{student_id}` returns
// concept ids and the lesson each one can be practised in, so the id exists at
// the entrance and used to be dropped at the door - which is why the review's
// own outcome was never recorded.
//
// `?back=` is the Subject Detail page the review was opened from, where it
// goes back to when it ends or is left before it begins (Olayinka, 14 Oct).
// Read as untrusted: anything but Subject Detail's own address is dropped
// here, and the review goes Home as it always has.
//
// Next.js 16: `searchParams` is a Promise and must be awaited.
export default async function ReviewSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ concept?: string; back?: string | string[] }>;
}) {
  const { lessonId } = await params;
  const { concept, back } = await searchParams;
  return (
    <LessonRoute
      lessonId={lessonId}
      review
      reviewConceptId={concept}
      reviewBack={readReviewBack(back) ?? undefined}
    />
  );
}
