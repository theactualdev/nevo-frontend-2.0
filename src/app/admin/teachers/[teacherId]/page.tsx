import type { Metadata } from "next";
import { TeacherDetailView } from "@/components/admin/Teachers/TeacherDetailView";
import { readBack } from "@/components/admin/back";

export const metadata: Metadata = {
  title: "Teacher - Nevo",
};

// D6 teacher detail. Next.js 16: `params` is a Promise and must be awaited.
export default async function AdminTeacherDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ teacherId: string }>;
  searchParams: Promise<{ back?: string | string[]; backLabel?: string | string[] }>;
}) {
  const { teacherId } = await params;
  return <TeacherDetailView teacherId={teacherId} back={readBack(await searchParams)} />;
}
