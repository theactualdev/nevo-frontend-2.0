import type { Metadata } from "next";
import { AdaptationLogView } from "@/components/admin/Adaptations/AdaptationLogView";
import { readBack } from "@/components/admin/back";

export const metadata: Metadata = {
  title: "Adaptation log - Nevo",
};

// D21 - the receipts behind the Overview's adaptation figure.
export default async function AdminAdaptationsPage({
  searchParams,
}: {
  searchParams: Promise<{ back?: string | string[]; backLabel?: string | string[] }>;
}) {
  return <AdaptationLogView back={readBack(await searchParams)} />;
}
