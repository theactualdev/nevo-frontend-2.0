import type { Metadata } from "next";
import { StudentEntryStep } from "@/components/student/Onboarding/StudentEntryStep";

export const metadata: Metadata = {
  title: "Find your school - Nevo",
};

// 05 Entry - "I have a school code" on the Welcome. The school code and the
// Student ID / Admission Number on one screen (SCRUM-208).
export default function OnboardingSchoolPage() {
  return <StudentEntryStep framing="school" />;
}
