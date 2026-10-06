import type { Metadata } from "next";
import { WelcomeScreen } from "@/components/student/Welcome/WelcomeScreen";

export const metadata: Metadata = {
  title: "Welcome - Nevo",
};

// The onboarding flow entry is the Welcome Screen (B.1). Both of its doors
// lead to the one entry screen: `/student/onboarding/school` (05) and
// `/student/onboarding/teacher-join` (03).
//
// No `?token=` any more. It was the join link's hand-off, and a child is never
// sent a link (design, D5).
export default function StudentOnboardingPage() {
  return <WelcomeScreen />;
}
