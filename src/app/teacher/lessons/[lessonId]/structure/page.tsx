import type { Metadata } from "next";
import { LessonStructureRoute } from "@/components/teacher/LessonReview/LessonStructureRoute";

export const metadata: Metadata = {
  title: "Change a lesson - Nevo",
};

// C07d for a lesson already in the library (Teslim d78756b): its names, order
// and sections, reached from step 1 of the review. Next.js 16: `params` is a
// Promise and must be awaited.
export default async function LessonStructurePage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <LessonStructureRoute lessonId={lessonId} />;
}
