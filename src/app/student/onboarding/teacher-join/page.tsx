import type { Metadata } from "next";
import { StudentEntryStep } from "@/components/student/Onboarding/StudentEntryStep";

export const metadata: Metadata = {
  title: "Join your school - Nevo",
};

// 03 Teacher Join - reached from the Welcome's teacher sheet. The same entry
// screen as 05, framed for a child whose teacher reads out the school code.
// The QR and class-code modes it used to switch between were retired on
// 30 Sep (SCRUM-208), so there is no `?mode=` to read and no Suspense needed.
export default function TeacherJoinPage() {
  return <StudentEntryStep framing="teacher" />;
}
