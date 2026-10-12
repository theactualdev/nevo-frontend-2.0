import type { Metadata } from "next";
import { StudentDetailView } from "@/components/admin/Students/StudentDetailView";

export const metadata: Metadata = {
  title: "Student - Nevo",
};

// D7b Student detail. Next.js 16: `params` is a Promise and must be awaited.
//
// `?class=` is the class the admin came from - class detail's roster links
// carry it - so Back returns to that class rather than to all students.
export default async function AdminStudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ class?: string | string[] }>;
}) {
  const { studentId } = await params;
  const { class: fromClass } = await searchParams;
  return (
    <StudentDetailView
      studentId={studentId}
      fromClassId={typeof fromClass === "string" ? fromClass : null}
    />
  );
}
