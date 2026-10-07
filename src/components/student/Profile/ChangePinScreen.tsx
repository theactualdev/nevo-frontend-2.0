"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft } from "lucide-react";
import { NevoKeyboard } from "@/components/shared";
import {
  PIN_MISMATCH_COPY,
  PIN_NOT_SAVED_COPY,
  PinRow,
  pinReducer,
} from "@/components/student/Onboarding/PinCreationScreen";
import { authApi } from "@/lib/api";
import { isCurrentPinRejected } from "@/lib/auth/currentPinFailure";
import {
  STUDENT_PIN_LENGTH,
  STUDENT_PIN_MAX,
  STUDENT_PIN_MIN,
} from "@/lib/constants";

const PROFILE_HREF = "/student/profile";
/**
 * A beat for the last box to fill before the write goes - and, because the
 * timer is cleared on cleanup, one write rather than two under StrictMode.
 */
const WRITE_BEAT_MS = 300;
/** How long "Your PIN is updated" stays up before Profile. */
const UPDATED_MS = 1600;

type Step = "current" | "new" | "updated";

/**
 * Change PIN (frame 27, "Change PIN · current PIN" → new PIN → "updated").
 *
 * **STEP 1 EXISTS BECAUSE THE FIELD DOES.** Frame 27 has drawn "Enter your
 * current PIN · Step 1 of 3" since the beginning. Backend added `currentPin`
 * on 23 Sep and ENFORCES it: on `POST /api/v1/auth/pin` as a signed-in student
 * whose account already has a PIN, a wrong or missing one is a 403
 * `current_pin_required`.
 *
 * **STEPS 2 AND 3 ARE THIS SCREEN'S OWN NOW**, not `PinCreationScreen`
 * borrowed whole. Borrowing it brought onboarding with it: a wordmark bar the
 * frame does not draw, no "Step 2 of 3", and "You're all set" shown for a beat
 * BEFORE the write went - a confirmation of a change that had not happened
 * yet, and on a refused current PIN, never did. The reducer, the rows and the
 * failure copy are still shared, so the two doors cannot drift.
 *
 * "Your PIN is updated" renders only once the server has said yes.
 *
 * THE OLD PIN MAY BE ANY LENGTH FROM 4 TO 8 - six for anyone who set theirs
 * before 25 Sep or had it reset by an adult - so step 1 takes the whole range
 * and Continue says when it is done. Only the NEW PIN is held to four.
 *
 * NOT DONE HERE: the unlock screen's remembered box count still says what it
 * said before the change. Design ruled (SCRUM-179) that a PIN's length is to
 * arrive from backend with the PIN, not be remembered by the device, so this
 * screen leaves the device's record alone until that ships.
 */
export function ChangePinScreen() {
  const router = useRouter();
  const back = useCallback(() => router.push(PROFILE_HREF), [router]);

  const [step, setStep] = useState<Step>("current");
  const [currentPin, setCurrentPin] = useState("");
  const [wrongCurrent, setWrongCurrent] = useState(false);

  // Updaters, not values: fast typing lands two keys before a re-render.
  const typeCurrent = useCallback((d: string) => {
    setWrongCurrent(false);
    setCurrentPin((p) => (p + d).slice(0, STUDENT_PIN_MAX));
  }, []);
  const eraseCurrent = useCallback(
    () => setCurrentPin((p) => p.slice(0, -1)),
    [],
  );

  // The confirmation is read, then the child is taken back to Profile.
  useEffect(() => {
    if (step !== "updated") return;
    const t = setTimeout(back, UPDATED_MS);
    return () => clearTimeout(t);
  }, [step, back]);

  if (step === "updated") return <Updated />;

  if (step === "new") {
    return (
      <NewPinStep
        currentPin={currentPin}
        onBack={() => setStep("current")}
        onWrongCurrent={() => {
          setCurrentPin("");
          setWrongCurrent(true);
          setStep("current");
        }}
        onUpdated={() => setStep("updated")}
      />
    );
  }

  return (
    <CurrentPinStep
      pin={currentPin}
      wrong={wrongCurrent}
      onDigit={typeCurrent}
      onBackspace={eraseCurrent}
      onBack={back}
      onContinue={() => setStep("new")}
    />
  );
}

/** Step 1: the PIN they have now, whatever its length. */
function CurrentPinStep({
  pin,
  wrong,
  onDigit,
  onBackspace,
  onBack,
  onContinue,
}: {
  pin: string;
  wrong: boolean;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  usePhysicalKeys(onDigit, onBackspace);

  const ready = pin.length >= STUDENT_PIN_MIN;

  return (
    <PinFrame onBack={onBack}>
      <div className="flex flex-1 flex-col items-center justify-center px-10 pb-6 text-center">
        <StepHeading title="Enter your current PIN" step={1} />

        <PinRow
          filled={pin.length}
          offset={0}
          caretAt={pin.length}
          error={wrong}
          length={Math.max(STUDENT_PIN_LENGTH, pin.length)}
          className={FRAME_27_ROW}
        />

        <p role="alert" className="mt-4 min-h-5 text-sm text-nevo-violet">
          {/*
            Named as the child's, because it is. The mirror of the save-failure
            copy on the next step, which is careful never to blame them for a
            write they could not have affected.
          */}
          {wrong ? "That's not your current PIN - try again" : ""}
        </p>

        <button
          type="button"
          disabled={!ready}
          onClick={onContinue}
          className="mt-6 h-12 cursor-pointer rounded-[10px] bg-nevo-navy px-6 text-base font-semibold text-nevo-cream transition-[filter,transform] hover:brightness-109 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue
        </button>
      </div>

      <NevoKeyboard
        layout="pad"
        presentation="block"
        onKey={onDigit}
        onBackspace={onBackspace}
        className="mb-8 shrink-0"
      />
    </PinFrame>
  );
}

/**
 * Steps 2 and 3: "Choose a new PIN", then "Type it again" - TWO SCREENS, each
 * with one row of four, as frame 27 draws them since 6 Oct (D62). It was one
 * screen with both rows, headed "Create a PIN" with "Type it again to
 * confirm" between them: the PIN pattern's layout, borrowed until the frame
 * drew these steps.
 *
 * Still one reducer underneath: the fourth digit moves them to step 3, and a
 * mismatch keeps them there with the first PIN kept (the IA: "mismatch:
 * inline error, stays on Step 3"). Back from step 3 is step 2, emptied.
 *
 * NOT DRAWN: a failed save. Frame 27 has none, so it keeps the shared
 * not-saved line, on step 3, with the new PIN kept.
 *
 * Mounted fresh each time step 1 hands over, so a half-typed new PIN never
 * survives a trip back.
 */
function NewPinStep({
  currentPin,
  onBack,
  onWrongCurrent,
  onUpdated,
}: {
  currentPin: string;
  onBack: () => void;
  onWrongCurrent: () => void;
  onUpdated: () => void;
}) {
  const [{ digits, error, done }, dispatch] = useReducer(pinReducer, {
    digits: "",
    error: false,
    done: false,
  });
  const [saveFailed, setSaveFailed] = useState(false);

  const pressDigit = useCallback((d: string) => {
    setSaveFailed(false);
    dispatch({ type: "digit", value: d });
  }, []);
  const backspace = useCallback(() => dispatch({ type: "backspace" }), []);
  usePhysicalKeys(pressDigit, backspace, !done);

  /**
   * Store the new PIN, proving the old one.
   *
   * **A WRONG CURRENT PIN IS NOT A FAILED WRITE**, and the difference decides
   * which of two very different sentences a child reads. "That's on us, not
   * you" is right for a dropped network or a refused shape - none of which
   * retyping fixes. A wrong current PIN IS the child's and retyping IS the
   * fix, so it goes back to the step that can fix it.
   */
  useEffect(() => {
    if (!done) return;
    let cancelled = false;
    const pin = digits.slice(0, STUDENT_PIN_LENGTH);
    const t = setTimeout(() => {
      authApi.setPin(pin, currentPin).then(
        () => {
          if (!cancelled) onUpdated();
        },
        (cause) => {
          if (cancelled) return;
          if (isCurrentPinRejected(cause)) {
            onWrongCurrent();
            return;
          }
          setSaveFailed(true);
          dispatch({ type: "saveFailed" });
        },
      );
    }, WRITE_BEAT_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // The callbacks are the parent's and change identity every render; the
    // write is about these digits and this current PIN, and nothing else.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, digits, currentPin]);

  /** The new PIN's four are in: this is step 3, the same again. */
  const again = digits.length >= STUDENT_PIN_LENGTH;

  return (
    // No way back while the write is in flight: leaving would hide the answer
    // to a change that may already have landed.
    <PinFrame
      onBack={
        done
          ? undefined
          : again
            ? () => {
                setSaveFailed(false);
                dispatch({ type: "restart" });
              }
            : onBack
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center px-10 pb-6 text-center">
        <StepHeading
          title={again ? "Type it again" : "Choose a new PIN"}
          step={again ? 3 : 2}
        />

        {/* Step 3's row is the second half of the same digits. */}
        <PinRow
          key={again ? "again" : "new"}
          filled={digits.length}
          offset={again ? STUDENT_PIN_LENGTH : 0}
          caretAt={digits.length}
          error={again && error}
          className={FRAME_27_ROW}
        />
        <p role="alert" className="mt-4 min-h-5 text-sm text-nevo-violet">
          {error ? PIN_MISMATCH_COPY : saveFailed ? PIN_NOT_SAVED_COPY : ""}
        </p>
      </div>

      {!done && (
        <NevoKeyboard
          layout="pad"
          presentation="block"
          onKey={pressDigit}
          onBackspace={backspace}
          className="mb-8 shrink-0"
        />
      )}
    </PinFrame>
  );
}

/** Frame 27's rows: 36px under the step line, the boxes 14px apart. */
const FRAME_27_ROW = "mt-9 gap-3.5";

/**
 * Each step's heading and "Step n of 3", as frame 27 draws all three: 22px,
 * and the step line 10px under it.
 */
function StepHeading({ title, step }: { title: string; step: 1 | 2 | 3 }) {
  return (
    <>
      <h2 className="text-[22px] font-semibold sm:text-[25px]">{title}</h2>
      <p className="mt-2.5 text-[15px] text-nevo-near-black/60">
        Step {step} of 3
      </p>
    </>
  );
}

/** Frame 27, "Change PIN · updated" - only ever after the server said yes. */
function Updated() {
  return (
    <div
      role="status"
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
        <Check className="size-[34px] text-nevo-cream" strokeWidth={2.6} />
      </span>
      <h2 className="mt-6 text-[22px] font-semibold">Your PIN is updated</h2>
      <p className="mt-2.5 text-[15px] text-nevo-near-black/60">
        You&apos;ll use the new one next time you sign in.
      </p>
    </div>
  );
}

/**
 * The frame's shell: a 56px bar holding the back chevron, and nothing else in
 * it. The wordmark bar the PIN pattern carries belongs to onboarding; frame 27
 * does not draw one here.
 */
function PinFrame({
  onBack,
  children,
}: {
  /** Absent while the back way is closed; the bar keeps its height. */
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      <div className="flex h-14 shrink-0 items-center px-3">
        {onBack && (
          <button
            type="button"
            aria-label="Back"
            onClick={onBack}
            className="flex size-11 cursor-pointer items-center justify-center rounded-[10px] transition-colors hover:bg-nevo-near-black/[0.06] active:bg-nevo-near-black/[0.12]"
          >
            <ChevronLeft
              className="size-6 text-nevo-near-black"
              strokeWidth={2}
            />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * Digits and Backspace from a physical keyboard, the way the PIN pattern takes
 * them. A child on a school laptop could not type into either PIN door until
 * 18 Sep; a door that only took taps would put that straight back.
 */
function usePhysicalKeys(
  onDigit: (d: string) => void,
  onBackspace: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        onDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        onBackspace();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDigit, onBackspace, enabled]);
}
