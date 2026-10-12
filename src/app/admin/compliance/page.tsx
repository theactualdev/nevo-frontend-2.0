import type { Metadata } from "next";
import { ComplianceView } from "@/components/admin/Compliance/ComplianceView";
import { readBack } from "@/components/admin/back";

export const metadata: Metadata = {
  title: "NDPA compliance audit - Nevo",
};

// D22 - the drill-down behind the Overview's compliance card.
export default async function AdminCompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ back?: string | string[]; backLabel?: string | string[] }>;
}) {
  return <ComplianceView back={readBack(await searchParams)} />;
}
