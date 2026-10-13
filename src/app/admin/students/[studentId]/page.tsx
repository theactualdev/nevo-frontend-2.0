import type { Metadata } from "next";
import { StudentDetailView } from "@/components/admin/Students/StudentDetailView";
import { readBack } from "@/components/admin/back";

export const metadata: Metadata = {
  title: "Student - Nevo",
};

// D7b Student detail. Next.js 16: `params` is a Promise and must be awaited.
//
// `?back=` is where the admin came from - see `components/admin/back.ts`.
export default async function AdminStudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ back?: string | string[]; backLabel?: string | string[] }>;
}) {
  const { studentId } = await params;
  return <StudentDetailView studentId={studentId} back={readBack(await searchParams)} />;
}
