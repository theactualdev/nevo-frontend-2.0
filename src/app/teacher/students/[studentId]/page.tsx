import type { Metadata } from "next";
import { StudentRoute } from "@/components/teacher/Student/StudentRoute";
import { getStudentProfile } from "@/lib/mocks/teacherStudents";

export const metadata: Metadata = {
  title: "Student - Nevo",
};

// C08 Student Profile (teacher view). Reached from a class roster row.
//
// Fetched client-side: these reads are behind a Bearer token in localStorage,
// which the server cannot see. The fixture is resolved here and passed down
// for the signed-out designed screen only.
//
// Next.js 16: `params` is a Promise and must be awaited.
export default async function TeacherStudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ class?: string }>;
}) {
  const { studentId } = await params;
  // The roster row passes the class it came from, so "back" returns there
  // rather than to the class list.
  const { class: classId } = await searchParams;
  return (
    <StudentRoute
      fixture={getStudentProfile(studentId)}
      studentId={studentId}
      classHref={classId ? `/teacher/classes/${classId}` : undefined}
      classId={classId}
    />
  );
}
