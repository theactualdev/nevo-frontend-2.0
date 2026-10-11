"use client";

import { HoldMessage } from "@/components/student/Entry/WaitingOnConsent";
import { OnboardingShell } from "./OnboardingShell";

/** The Welcome, where both doors into 05 Entry live. */
const WELCOME = "/student/onboarding";

/**
 * The Entry frame's "On hold" state (05, state 6; D121): a child identified,
 * and held for something on their record the school has to settle.
 *
 * IN THE ENTRY SCREEN'S OWN CHROME - the chevron row with Back and the
 * wordmark - because that is where the frame draws it. It was 00d's screen,
 * which has a wordmark and nothing else, so on a shared classroom tablet the
 * next child could not get past it: the child held had no way off it, and
 * neither did anyone after them.
 *
 * Back goes to the Welcome, and it is the only control. "A calm hold with no
 * button, because nothing a child can do moves it along" - Back moves nothing
 * along; it leaves.
 *
 * Wherever the age check holds a child who has no session - on 05's lookup,
 * on the new PIN after a teacher's clear, or at the end of a first run whose
 * PIN the server refused - this is the screen.
 */
export function AgeCheckHold() {
  return (
    <OnboardingShell backHref={WELCOME}>
      <HoldMessage hold="age-check" className="px-3 sm:px-4" />
    </OnboardingShell>
  );
}
