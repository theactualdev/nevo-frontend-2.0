import type { Metadata } from "next";
import { ClearPinScreen } from "@/components/teacher/Student/ClearPinScreen";

export const metadata: Metadata = {
  title: "Clear PIN - Nevo",
};

// C19 B3, the one-thumb Clear PIN a "forgot PIN" notification opens on a
// phone. Carries its class, like the profile, because the roster is the
// teacher's read of who this child is.
//
// Next.js 16: `params` and `searchParams` are Promises and must be awaited.
export default async function TeacherClearPinPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ class?: string }>;
}) {
  const { studentId } = await params;
  const { class: classId } = await searchParams;
  return <ClearPinScreen studentId={studentId} classId={classId} />;
}
