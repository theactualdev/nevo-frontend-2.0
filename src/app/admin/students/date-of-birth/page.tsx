import type { Metadata } from "next";
import { DobHoldView } from "@/components/admin/Students/DobHoldView";
import { readBack } from "@/components/admin/back";

export const metadata: Metadata = {
  title: "Date of birth checks - Nevo",
};

// D30 Date of birth checks (SCRUM-243). Next.js 16: `searchParams` is a
// Promise and must be awaited. `?back=` is where the admin came from.
export default async function AdminDobHoldPage({
  searchParams,
}: {
  searchParams: Promise<{ back?: string | string[]; backLabel?: string | string[] }>;
}) {
  return <DobHoldView back={readBack(await searchParams)} />;
}
