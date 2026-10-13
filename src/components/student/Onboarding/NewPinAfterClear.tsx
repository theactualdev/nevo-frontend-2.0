"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { studentDestination } from "@/lib/auth/entryGate";
import {
  bindFirstPin,
  startEntrySession,
  type EntryIdentity,
  type EntryPinElsewhere,
} from "@/lib/auth/firstPin";
import { rememberOnboardedStudent } from "@/lib/auth/onboarding";
import { PinCreationScreen } from "./PinCreationScreen";

/**
 * 15's "New PIN after a clear" (D3, D115), for a child 05 Entry found with
 * `pinCleared` (B67): a teacher cleared their PIN, and they choose the next
 * one themselves.
 *
 * THE SAME STORE AS A FIRST PIN. A cleared child has no session - sign-in
 * 401s on the PIN they remember - so `POST /auth/pin` has nobody to write to.
 * `POST /student-entry/pin` takes the pair 05 matched, and its answer is their
 * session, stored as the first PIN's is.
 *
 * ON DONE, HOME - not You're In, which welcomes a NEW account (frame 15: "On
 * done, goes to 19 Home"). Through `studentDestination`, so consent is
 * resolved as at every other door, and the device remembers the child first.
 *
 * NOT A FIRST RUN. The baseline is the first run's; this child has sat it.
 */
export function NewPinAfterClear({
  entry,
  onRefused,
}: {
  /** The pair 05 matched the child on. */
  entry: EntryIdentity;
  /** Sign-in, 05's miss or a hold: the entry screen's to show. */
  onRefused: (refusal: EntryPinElsewhere) => void;
}) {
  const router = useRouter();
  /** The identifier storing the PIN hands back, read once it has landed. */
  const identifierRef = useRef<string | null>(null);

  return (
    <PinCreationScreen
      reset
      storePin={async (pin) => {
        const res = await bindFirstPin(entry, pin);
        identifierRef.current = res.loginIdentifier;
        startEntrySession(res);
      }}
      onRefused={onRefused}
      onComplete={() => {
        rememberOnboardedStudent(identifierRef.current);
        // Home, or a hold for a child the server holds.
        void studentDestination().then((to) => router.push(to));
      }}
    />
  );
}
