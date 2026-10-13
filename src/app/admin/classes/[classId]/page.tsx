import type { Metadata } from "next";
import { ClassDetailView } from "@/components/admin/Classes/ClassDetailView";
import { readBack } from "@/components/admin/back";

export const metadata: Metadata = {
  title: "Class - Nevo",
};

// D5b Class detail. Next.js 16: `params` is a Promise and must be awaited.
export default async function AdminClassDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ back?: string | string[]; backLabel?: string | string[] }>;
}) {
  const { classId } = await params;
  return <ClassDetailView classId={classId} back={readBack(await searchParams)} />;
}
