import type { Metadata } from "next";
import { LearnerProfileView } from "@/components/admin/Senco/LearnerProfileView";
import { readBack } from "@/components/admin/back";

export const metadata: Metadata = {
  title: "Learner profile - Nevo",
};

// D8b Learner Profile. Next.js 16: `params` is a Promise and must be awaited.
export default async function AdminLearnerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ back?: string | string[]; backLabel?: string | string[] }>;
}) {
  const { studentId } = await params;
  return <LearnerProfileView studentId={studentId} back={readBack(await searchParams)} />;
}
