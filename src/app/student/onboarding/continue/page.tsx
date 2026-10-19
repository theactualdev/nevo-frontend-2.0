import type { Metadata } from "next";
import { OnboardingResume } from "@/components/student/Onboarding/OnboardingResume";

export const metadata: Metadata = {
  title: "Getting to know you - Nevo",
};

// Where a signed-in child finishes onboarding when the server says it is not
// finished (409 `onboarding_required`, SCRUM-244): the modules it still names,
// then Home. See `onboardingGate` for why the server's `/student/onboarding`
// is not followed literally.
export default function OnboardingContinuePage() {
  return <OnboardingResume />;
}
