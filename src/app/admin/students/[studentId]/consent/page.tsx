import type { Metadata } from "next";
import { WrittenConsentView } from "@/components/admin/Students/WrittenConsentView";

export const metadata: Metadata = {
  title: "Record written consent - Nevo",
};

// D25 PC-02. Next.js 16: `params` is a Promise and must be awaited.
export default async function WrittenConsentPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  return <WrittenConsentView studentId={studentId} />;
}
