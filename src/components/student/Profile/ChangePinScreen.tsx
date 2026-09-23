"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Image from "next/image";
import { NevoKeyboard } from "@/components/shared";
import {
  PinCreationScreen,
  PinRow,
} from "@/components/student/Onboarding/PinCreationScreen";
import { authApi } from "@/lib/api";
import { isCurrentPinRejected } from "@/lib/auth/currentPinFailure";
import { STUDENT_PIN_LENGTH } from "@/lib/constants";

const PROFILE_HREF = "/student/profile";

/**
 * Change PIN (frame 27, "Change PIN · current PIN" → the PIN pattern → updated).
 *
 * **STEP 1 EXISTS NOW BECAUSE THE FIELD DOES.** Frame 27 has drawn "Enter your
 * current PIN · Step 1 of 3" since the beginning and there was nowhere to send
 * it - it was list S-B 9. Backend added `currentPin` on 23 Sep and ENFORCES
 * it: on `POST /api/v1/auth/pin` as a signed-in student whose account already
 * has a PIN, a wrong or missing one is a 403 `current_pin_required`. So
 * without this step, changing a PIN would simply have stopped working.
 *
 * Steps 2 and 3 are `PinCreationScreen` unchanged - the frames reuse that
 * pattern wholesale, and it already owns the digits, the physical keyboard,
 * the confirm row and the two failure messages.
 *
 * **THE WRITE CARRIES THE CURRENT PIN THROUGH `storePin`**, which is the seam
 * that already exists for "the caller knows how to store this". That is why
 * `PinCreationScreen` needed no new prop: it does not have to know that this
 * particular store proves something first.
 */
export function ChangePinScreen() {
  const router = useRouter();
  const back = useCallback(() => router.push(PROFILE_HREF), [router]);

  const [currentPin, setCurrentPin] = useState("");
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);

  const pressDigit = useCallback((d: string) => {
    setMismatch(false);
    setCurrentPin((p) => (p + d).slice(0, STUDENT_PIN_LENGTH));
  }, []);
  const backspace = useCallback(
    () => setCurrentPin((p) => p.slice(0, -1)),
    [],
  );

  // Physical keyboard, the same way the PIN pattern does it. A child on a
  // school laptop could not type into either PIN door until 18 Sep; a new one
  // that only took taps would put that straight back.
  useEffect(() => {
    if (confirmed !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        pressDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspace();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmed, pressDigit, backspace]);

  /**
   * Store the new PIN, proving the old one.
   *
   * **A WRONG CURRENT PIN IS NOT A FAILED WRITE**, and the difference decides
   * which of two very different sentences a child reads. `PinCreationScreen`
   * renders *"we couldn't save that just now - that's on us, not you"* for a
   * rejection, and that copy is right for a dropped network or a refused
   * shape - none of which retyping fixes. This one IS the child's and retyping
   * IS the fix, so it goes back to the step that can fix it.
   */
  const store = useCallback(
    async (pin: string) => {
      try {
        await authApi.setPin(pin, currentPin);
      } catch (cause) {
        if (!isCurrentPinRejected(cause)) throw cause;
        setCurrentPin("");
        setMismatch(true);
        setConfirmed(null);
        /*
         * ABANDONED, NOT FAILED - so this promise deliberately never settles.
         *
         * Resolving would tell `PinCreationScreen` the PIN was stored and send
         * the child to Profile on a change that did not happen. Rejecting
         * would show them "that's on us, not you" about something that is
         * theirs to fix. Neither is true, and the flow has already moved: the
         * line above unmounts that screen, its effect cleanup marks itself
         * cancelled, and nothing is left waiting on this.
         */
        await new Promise<never>(() => {});
      }
    },
    [currentPin],
  );

  if (confirmed !== null) {
    return (
      <div className="relative">
        <Chevron onClick={() => setConfirmed(null)} label="Back" />
        <PinCreationScreen storePin={store} onComplete={back} />
      </div>
    );
  }

  const ready = currentPin.length === STUDENT_PIN_LENGTH;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      <Chevron onClick={back} label="Back" />
      <div className="flex h-[60px] shrink-0 items-center px-5 sm:px-8">
        <Image
          src="/brand/nevo-wordmark.png"
          alt="Nevo"
          width={344}
          height={116}
          priority
          className="h-[18px] w-auto sm:h-5"
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-10 pb-6 text-center">
        <h2 className="text-[23px] font-semibold tracking-[-0.01em] sm:text-[25px]">
          Enter your current PIN
        </h2>
        <p className="mt-3 text-[15px] text-nevo-near-black/60">Step 1 of 3</p>

        <PinRow
          filled={currentPin.length}
          offset={0}
          caretAt={currentPin.length}
          error={mismatch}
        />

        <p role="alert" className="mt-4 min-h-5 text-sm text-nevo-violet">
          {/*
            Named as the child's, because it is. The mirror of the save-failure
            copy on the next step, which is careful never to blame them for a
            write they could not have affected.
          */}
          {mismatch ? "That's not your current PIN - try again" : ""}
        </p>

        <button
          type="button"
          disabled={!ready}
          onClick={() => setConfirmed(currentPin)}
          className="mt-6 h-12 cursor-pointer rounded-[10px] bg-nevo-navy px-6 text-base font-semibold text-nevo-cream transition-[filter,transform] hover:brightness-109 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue
        </button>
      </div>

      <NevoKeyboard
        layout="pad"
        presentation="block"
        onKey={pressDigit}
        onBackspace={backspace}
        className="mb-8 shrink-0"
      />
    </div>
  );
}

function Chevron({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="absolute top-4 left-4 z-20 flex size-11 cursor-pointer items-center justify-center rounded-[10px] transition-colors hover:bg-nevo-near-black/[0.06] active:bg-nevo-near-black/[0.12]"
    >
      <ChevronLeft className="size-6 text-nevo-near-black" strokeWidth={2} />
    </button>
  );
}
