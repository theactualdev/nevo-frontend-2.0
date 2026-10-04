"use client";

import { useRouter } from "next/navigation";
import { PinCreationScreen } from "@/components/student/Onboarding/PinCreationScreen";

/** Where a child goes once their new PIN is saved: 19 Home, not 16 You're In. */
export const AFTER_NEW_PIN = "/student/dashboard";

/**
 * 15 PIN Creation's "New PIN after a clear" (design, D3; SCRUM-217).
 *
 * The other end of 00a's "Let my teacher know": the teacher has cleared the
 * old PIN, and the child chooses the next one themselves. Same screen, same
 * pad and rows, opening on "Choose a new PIN". On done it goes Home, because
 * this child already has an account and You're In welcomes a new one.
 *
 * NOT ROUTED, ON PURPOSE. How a child reaches this waits on backend
 * (SCRUM-216, the teacher's clear). The live contract has no signal for a
 * cleared PIN: `POST /auth/login/pin` answers 401 with
 * `authentication_failed`, `account_paused` or `too_many_attempts` and
 * nothing that says "cleared", and the teacher's endpoint still issues a PIN
 * rather than clearing one. So nothing sends a child here yet; the screen and
 * where it goes on done are ready for whatever that signal turns out to be.
 *
 * THE PIN IS STORED BY `PinCreationScreen`'s signed-in path, `POST /auth/pin`
 * for the student whose session this is - the only store the contract has for
 * an existing account. The pad's ✓ key and the remembered PIN length are
 * untouched here (SCRUM-179).
 */
export function NewPinAfterClear() {
  const router = useRouter();
  return (
    <PinCreationScreen reset onComplete={() => router.replace(AFTER_NEW_PIN)} />
  );
}
