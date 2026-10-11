import type { Metadata } from "next";
import { AssignWizard } from "@/components/teacher/Assign/AssignWizard";

export const metadata: Metadata = {
  title: "Assign lessons - Nevo",
};

// C07i Lesson Assignment - a standalone takeover (no sidebar in the frame),
// rendered as a fixed layer over the shell. `?lesson=<id>` preselects the
// lesson the teacher came from (the C06b "Assign to a class" entry).
export default async function AssignLessonsPage({
  searchParams,
}: {
  searchParams: Promise<{ lesson?: string; class?: string }>;
}) {
  // `?class=` is the class the teacher came from, when they came from one.
  const { lesson, class: fromClass } = await searchParams;
  return <AssignWizard preselect={lesson} preselectClass={fromClass} />;
}
