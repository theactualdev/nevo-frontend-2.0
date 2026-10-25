import type { Metadata } from "next";
import { LessonMediaRoute } from "@/components/teacher/Media/LessonMedia";

export const metadata: Metadata = {
  title: "Lesson media - Nevo",
};

// C06c Lesson Media - a live lesson's pictures and narration, and pulling one
// that shouldn't be there, with an undo while the teacher stays (design
// 82c213b, 23 Oct). Reached from C06b's "Pictures and narration".
//
// Next.js 16: `params` is a Promise and must be awaited.
export default async function LessonMediaPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <LessonMediaRoute lessonId={lessonId} />;
}
