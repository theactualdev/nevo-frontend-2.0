import type { Metadata } from "next";
import { IepExporterView } from "@/components/admin/Senco/IepExporterView";

export const metadata: Metadata = {
  title: "Progress report - Nevo",
};

// D8 IEP Exporter. Review is never skippable: a named member of staff reads
// and checks the draft before anything reaches a family.
//
// `?student=` opens it on that child - the learner profile's "Create a
// progress report" links here with it, so a SENCo is not made to find the
// child they were just looking at a second time.
export default async function AdminIepExportPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string | string[] }>;
}) {
  const { student } = await searchParams;
  return <IepExporterView initialStudentId={typeof student === "string" ? student : ""} />;
}
