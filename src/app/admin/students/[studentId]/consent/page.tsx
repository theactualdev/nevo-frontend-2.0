import type { Metadata } from "next";
import { WrittenConsentView } from "@/components/admin/Students/WrittenConsentView";
import { readBack } from "@/components/admin/back";

export const metadata: Metadata = {
  title: "Record written consent - Nevo",
};

// D25 PC-02. Next.js 16: `params` is a Promise and must be awaited.
export default async function WrittenConsentPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ back?: string | string[]; backLabel?: string | string[] }>;
}) {
  const { studentId } = await params;
  return <WrittenConsentView studentId={studentId} back={readBack(await searchParams)} />;
}
