import type { Metadata } from "next";
import { OnboardingResume } from "@/components/student/Onboarding/OnboardingResume";
import { RETURN_PARAM, returnPathOf } from "@/lib/auth/onboardingGate";

export const metadata: Metadata = {
  title: "Getting to know you - Nevo",
};

// Where a signed-in child finishes onboarding when the server says it is not
// finished (409 `onboarding_required`, SCRUM-244): the modules it still names,
// then back to the page that was refused, or Home. See `onboardingGate` for
// why the server's `/student/onboarding` is not followed literally.
//
// The way back arrives in the URL, which anyone can write, so it is checked
// here with the same rule that sent it (`returnPathOf`): anything that is not
// a plain student page is dropped, and finishing goes Home.
export default async function OnboardingContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const back = returnPathOf((await searchParams)[RETURN_PARAM]);
  return <OnboardingResume returnTo={back ?? undefined} />;
}
