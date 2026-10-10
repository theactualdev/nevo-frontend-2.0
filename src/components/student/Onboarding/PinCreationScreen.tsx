"use client";

import Image from "next/image";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Check } from "lucide-react";
import { NevoKeyboard, useNevoKeyboardDock } from "@/components/shared";
import {
  HeldPinBoxes,
  THROTTLED_PAUSE_COPY,
  ThrottleNote,
} from "@/components/student/Auth/ThrottledPause";
import { authApi } from "@/lib/api";
import { STUDENT_PIN_LENGTH } from "@/lib/constants";
import { USER_ROLES } from "@/lib/constants/permissions";
import { entryPinRefusal, type EntryPinElsewhere } from "@/lib/auth/firstPin";
import { getSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/**
 * PIN entry state machine. Kept as a pure reducer so the confirm/mismatch logic
 * lives in one place and rapid input (fast typing, held keys, quick taps) always
 * folds onto the latest state — no stale closures, no setState-in-effect.
 *
 * The PIN is stored somewhere real before the flow advances - the next
 * sign-in checks it there, so celebrating first would be a lie.
 *
 * Two ways to store it, because there are two ways to arrive:
 *   - with a session, `POST /auth/pin` (Bearer-only);
 *   - with no session yet, `storePin` is supplied by the caller and binds the
 *     PIN to the child 05 Entry found - `bindFirstPin`, `POST
 *     /student-entry/pin` (B64). A refusal there is this screen's not-saved
 *     or throttled state, or another screen's (`onRefused`).
 *
 * A path with neither is the one that cannot honestly promise anything, and
 * it no longer pretends: see `onboarding.ts`.
 */
export type PinState = { digits: string; error: boolean; done: boolean };
type PinAction =
  | { type: "digit"; value: string }
  | { type: "backspace" }
  | { type: "saveFailed" }
  | { type: "restart" };

export function pinReducer(state: PinState, action: PinAction): PinState {
  // Back to an empty first row - Change PIN's Back from "Type it again".
  if (action.type === "restart") return { digits: "", error: false, done: false };
  // The server rejected the save: keep their first PIN, re-open the confirm
  // row, and let the alert line explain.
  if (action.type === "saveFailed") {
    return {
      digits: state.digits.slice(0, STUDENT_PIN_LENGTH),
      error: false,
      done: false,
    };
  }
  if (action.type === "backspace") {
    if (state.done) return state;
    return { digits: state.digits.slice(0, -1), error: false, done: false };
  }
  // action.type === "digit"
  // Both rows together: the PIN, then its confirmation.
  const BOTH = STUDENT_PIN_LENGTH * 2;
  if (state.done || state.digits.length >= BOTH) return state;
  const next = state.digits + action.value;
  if (next.length < BOTH) return { digits: next, error: false, done: false };
  // The last digit completes the confirm row — compare the two halves.
  if (next.slice(0, STUDENT_PIN_LENGTH) === next.slice(STUDENT_PIN_LENGTH)) {
    return { digits: next, error: false, done: true };
  }
  // keep first PIN
  return {
    digits: next.slice(0, STUDENT_PIN_LENGTH),
    error: true,
    done: false,
  };
}

/**
 * The two things that can go wrong once a PIN is typed twice. Change PIN
 * draws its own steps around the same reducer and rows, and a second copy of
 * these is how the two would drift.
 *
 * `PIN_NOT_SAVED_COPY` is Change PIN's line now, and only its: frame 27 draws
 * no failed save, so it keeps what it had. PIN Creation has frame 15's own
 * state (D61) - see `PIN_SAVE_FAILED_COPY`.
 */
export const PIN_MISMATCH_COPY = "Those didn't match - let's try once more";
export const PIN_NOT_SAVED_COPY =
  "We couldn't save that just now - that's on us, not you. Your teacher can help.";

/** Frame 15's saving and didn't-save states (D61), verbatim. */
export const PIN_SAVING_COPY = "Saving your PIN…";
export const PIN_SAVE_FAILED_HEADING = "That didn't save";
export const PIN_SAVE_FAILED_COPY =
  "Your PIN is kept. That's on us - try again.";

/**
 * PIN Creation (UI/UX spec) — the last onboarding step before "You're In".
 *
 * Manual students set a PIN (STUDENT_PIN_LENGTH digits), then re-type it to
 * confirm; a mismatch
 * resets the confirm row with a gentle nudge (no lockouts, no attempt counter).
 * SSO students never set a PIN — they get a calm "you're signed in"
 * confirmation instead. Both paths auto-advance once settled.
 *
 * Input comes from the branded on-screen keypad (touch; shown below lg, matching
 * the design) and from the physical keyboard (desktop), so there is no reliance
 * on the OS keyboard.
 *
 * THE CHECK MARK WAITS FOR THE SAVE (design, D8). It used to appear the moment
 * the two rows matched, with "You're all set" held for a beat while the write
 * went - so a PIN that was then refused had already been celebrated, and a
 * path with nowhere to store it was told it was set. "You're all set" is drawn
 * only once the server has it.
 *
 * WHILE IT SAVES, AND IF IT DOESN'T, frame 15 draws its own states (D61): a
 * quiet navy ring and "Saving your PIN…", then - if it does not land - a
 * refresh mark, "That didn't save", and a primary "Try again" that sends the
 * same PIN again. The rows are hidden in both. The PIN is KEPT, not shown:
 * "the child presses Try again without entering four digits a second time".
 * It was the rows left as typed, with the not-saved line and a ghost "Try
 * again" under them.
 *
 * A REFUSAL IS NOT ALWAYS OURS (B68). The PIN route names its refusals now,
 * and `entryPinRefusal` reads them. The rest - a child who has a PIN, a pair
 * that names nobody, a held child - are other screens', and go to `onRefused`.
 *
 * A RATE LIMIT IS D154's PAUSE, not "That didn't save" (9 Oct: it "holds
 * everywhere a child enters a PIN"). It was the not-saved state with D68's
 * wait line under it. Now: "Let's take a moment", the rows HELD - dimmed,
 * empty, inert - and the note under them; no refresh mark, no failure. The
 * frame raises "Forgot PIN?" as its way out, which means nothing to a child
 * choosing one, so this keeps frame 15's "Try again", which sends the kept
 * PIN once more: with no timer to end the pause, it is the only way on.
 * Asked of design.
 */
type SavePhase = "entry" | "saving" | "saved" | "failed" | "throttled";

/** A beat for the last box to fill before the write goes - and one write, not two, under StrictMode. */
const WRITE_BEAT_MS = 300;
/** How long "You're all set" stays up once the PIN is saved (the frame's 1200ms). */
const SAVED_BEAT_MS = 1200;

export function PinCreationScreen({
  sso = false,
  reset = false,
  storePin,
  onRefused,
  onComplete,
}: {
  sso?: boolean;
  /**
   * 15's "New PIN after a clear" (1 Oct, D3): a teacher has cleared the old
   * PIN and the child chooses the next one. The same screen and components;
   * only the opening line changes, so it reads as choosing a new PIN rather
   * than starting again. Where it goes on done is the caller's - Home, not
   * You're In. A cleared child has no session, so the caller stores the PIN
   * through `POST /student-entry/pin` (school code + Student ID, SCRUM-216)
   * via `storePin` - 05 Entry, when the lookup says `pinCleared` (B67).
   */
  reset?: boolean;
  /**
   * Store the PIN when there is no session to store it against - the first
   * PIN, bound to the child 05 Entry found. Rejecting keeps the child on this
   * screen rather than advancing on a PIN that would be refused at the next
   * sign-in.
   */
  storePin?: (pin: string) => Promise<void>;
  /**
   * A refusal that belongs to another screen: sign-in, 05's miss, or a hold.
   * The caller takes the child there; this screen says nothing more. Without
   * it, those refusals are the not-saved state.
   */
  onRefused?: (refusal: EntryPinElsewhere) => void;
  onComplete: () => void;
}) {
  const [{ digits, error, done }, dispatch] = useReducer(pinReducer, {
    digits: "",
    error: false,
    done: false,
  });
  const [phase, setPhase] = useState<SavePhase>("entry");
  /** Bumped by "Try again", which sends the same PIN once more. */
  const [attempt, setAttempt] = useState(0);
  /*
   * THE PAD IS DOCKED AND FOCUS-DRIVEN, per design's ruling D on the PIN
   * frame (15): "a focus-driven pad is transient, and a docked tray reads as
   * transient". It was a permanent block pad, which is 28c's exception for a
   * screen whose pad is the whole point.
   *
   * The boxes are a picture, not an input, so they get a field to focus - the
   * same transparent overlay the sign-back-in form uses. Digits still arrive
   * through the window listener below, which is why the field is read-only.
   * It is focused on arrival, so the pad is up from the start and a child
   * never has to discover that the boxes are tappable.
   */
  const pad = useNevoKeyboardDock();
  const entryRef = useRef<HTMLInputElement>(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  const storePinRef = useRef(storePin);
  useEffect(() => {
    storePinRef.current = storePin;
  }, [storePin]);
  const onRefusedRef = useRef(onRefused);
  useEffect(() => {
    onRefusedRef.current = onRefused;
  }, [onRefused]);

  // Stable handlers — dispatch never goes stale, so rapid input folds correctly.
  const pressDigit = useCallback((d: string) => {
    dispatch({ type: "digit", value: d });
  }, []);
  const backspace = useCallback(() => dispatch({ type: "backspace" }), []);

  // Physical keyboard (desktop and any attached keyboard).
  useEffect(() => {
    if (sso) return;
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
  }, [sso, pressDigit, backspace]);

  useEffect(() => {
    if (sso || done) return;
    entryRef.current?.focus({ preventScroll: true });
  }, [sso, done]);

  // SSO: nothing to store, so the confirmation is true at once and moves on.
  useEffect(() => {
    if (!sso) return;
    const t = setTimeout(() => onCompleteRef.current?.(), 1600);
    return () => clearTimeout(t);
  }, [sso]);

  // Manual: once the rows match, store the PIN. "Set" means stored
  // server-side, and nothing celebrates until it is (D8). A failure keeps both
  // rows as typed instead of advancing on a PIN the next sign-in would reject.
  useEffect(() => {
    if (sso || !done) return;
    let cancelled = false;
    const t = setTimeout(
      () => {
        const pin = digits.slice(0, STUDENT_PIN_LENGTH);
        /*
         * ONBOARDING WINS OVER WHOEVER IS SIGNED IN.
         *
         * This asked `getToken()` first, which is not the question. Both calls
         * post to `/api/v1/auth/pin`, and the server tells them apart by the
         * BODY: `completeAccount` carries an `onboardingToken` and creates the
         * account it names; `setPin` carries only `{pin}` and sets it on
         * whoever's Bearer token happens to be on the device.
         *
         * So any session at all diverted a child creating their first account
         * into "change the signed-in user's PIN":
         * - Signed in as a teacher or admin, the server refuses outright -
         *   403 `{"detail":"PIN is for student accounts"}` - and the child is
         *   told their PIN did not save, which is true but not why.
         * - Signed in as ANOTHER CHILD on a shared classroom tablet, it
         *   SUCCEEDS. The new child's PIN is written onto the previous child's
         *   account, locking them out behind a PIN they have never seen, and
         *   no account is created for the new child at all. Same shape as the
         *   baseline-submit bug: a stale token on a shared device silently
         *   attributing one child's data to another.
         *
         * The two arrivals were always distinguishable without asking about
         * tokens. `storePin` is passed by `ObservedInteractionSequence`, the
         * only screen that renders this one; it binds the PIN to the child 05
         * Entry found and carries its own identity. Change PIN does
         * not render this screen: it draws its own steps around `pinReducer`
         * and calls `setPin` itself, with the current PIN. So the `setPin`
         * branch below is reached only by a caller that passes no `storePin`,
         * and only for a signed-in student - the one case `setPin` is right
         * for. (A child whose PIN a teacher cleared has no session; the entry
         * flow passes `storePin` for them.)
         */
        const session = getSession();
        const store = storePinRef.current
          ? () => storePinRef.current!(pin)
          : session?.role === USER_ROLES.STUDENT
            ? () => authApi.setPin(pin).then(() => undefined)
            : null;
        if (!store) {
          // Nowhere to put it. The caller decides what that means for the
          // device; this screen's job is only not to claim it was saved.
          onCompleteRef.current?.();
          return;
        }
        setPhase("saving");
        void store().then(
          () => {
            if (!cancelled) setPhase("saved");
          },
          (cause: unknown) => {
            if (cancelled) return;
            const refusal = entryPinRefusal(cause);
            if (refusal === "throttled" || refusal === "failed") {
              setPhase(refusal);
              return;
            }
            // Another screen's to show. The ring stays up while the caller
            // takes the child there, rather than flashing a failure first.
            const elsewhere = onRefusedRef.current;
            if (elsewhere) elsewhere(refusal);
            else setPhase("failed");
          },
        );
      },
      WRITE_BEAT_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // `attempt` is "Try again": the same PIN, sent once more.
  }, [done, sso, digits, attempt]);

  // Saved: the frame's beat on "You're all set", then on.
  useEffect(() => {
    if (phase !== "saved") return;
    const t = setTimeout(() => onCompleteRef.current?.(), SAVED_BEAT_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const saved = phase === "saved";
  const saving = phase === "saving";
  // D154's pause, not the not-saved state.
  const throttled = phase === "throttled";
  const failed = phase === "failed";
  // The rows are hidden while it saves and if it does not (D61).
  const showEntry = !sso && phase === "entry";
  const showConfirmation = sso || saved;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      {/* Top bar: wordmark only */}
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
        {showConfirmation && (
          <span className="mb-5 flex size-16 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
            <Check className="size-[34px] text-nevo-cream" strokeWidth={2.6} />
          </span>
        )}
        {saving && (
          <span
            aria-hidden
            className="mb-5 size-11 rounded-full border-[3px] border-nevo-navy/18 border-t-nevo-navy motion-safe:animate-spin"
          />
        )}
        {failed && (
          <span className="mb-5 flex size-16 items-center justify-center rounded-full bg-nevo-violet/22">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="size-[30px] text-nevo-navy"
            >
              <path d="M3 12a9 9 0 1 0 2.6-6.4" />
              <path d="M3 4v4h4" />
            </svg>
          </span>
        )}

        {/* An alert when it did not save, mounted fresh so it is announced. */}
        <div
          key={failed ? "failed" : "steady"}
          role={failed ? "alert" : undefined}
          aria-live={failed ? undefined : "polite"}
          className="flex flex-col items-center"
        >
          <h2 className="text-[23px] font-semibold tracking-[-0.01em] sm:text-[25px]">
            {sso
              ? "You're signed in"
              : saved
                ? "You're all set"
                : throttled
                  ? THROTTLED_PAUSE_COPY.heading
                  : failed
                    ? PIN_SAVE_FAILED_HEADING
                    : reset
                      ? "Choose a new PIN"
                      : "Create a PIN"}
          </h2>
          {!throttled && (
            <p className="mt-3 text-[15px] text-nevo-near-black/60">
              {sso
                ? "We'll remember you next time"
                : saving
                  ? PIN_SAVING_COPY
                  : failed
                    ? PIN_SAVE_FAILED_COPY
                    : "You'll use this to log in next time"}
            </p>
          )}
        </div>

        {throttled && (
          <>
            {/* Both rows, as this screen draws them, held. */}
            <HeldPinBoxes boxClassName="size-12" className="mt-10 gap-3" />
            <HeldPinBoxes boxClassName="size-12" className="mt-[60px] gap-3" />
            <ThrottleNote />
          </>
        )}

        {(failed || throttled) && (
          <button
            type="button"
            onClick={() => {
              // The kept PIN, sent again: straight to saving, so the rows
              // do not flash back for the beat before the write.
              setPhase("saving");
              setAttempt((n) => n + 1);
            }}
            className="mt-7 h-[50px] cursor-pointer rounded-[10px] bg-nevo-navy px-7 text-base font-medium text-nevo-cream transition-[filter,transform] hover:brightness-108 active:scale-[0.985]"
          >
            Try again
          </button>
        )}

        {showEntry && (
          <>
            <div className="relative">
              <input
                ref={entryRef}
                value=""
                readOnly
                inputMode="none"
                autoComplete="off"
                aria-label="Your PIN"
                onFocus={pad.onFocus}
                onBlur={pad.onBlur}
                className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 outline-none"
              />
              <PinRow
                filled={digits.length}
                offset={0}
                caretAt={digits.length}
                error={false}
              />
              <p className="mt-7 mb-3 text-sm font-medium">
                Type it again to confirm
              </p>
              <PinRow
                filled={digits.length}
                offset={STUDENT_PIN_LENGTH}
                caretAt={digits.length}
                error={error}
              />
            </div>
            <p role="alert" className="mt-4 min-h-5 text-sm text-nevo-violet">
              {/*
                ONLY THE CHILD'S OWN MISTAKE IS SAID HERE.

                `error` IS the child's - the two entries did not match, and
                typing again is exactly the fix.

                A failed save never is. By the time it can fire the two entries
                have already matched; what failed is the write. That can be a
                403 because a teacher is signed in on this tablet, a network
                that dropped, or a shape the server refused - and not one of
                them is fixed by retyping. So it is not this line at all: it is
                frame 15's own state above, which keeps the PIN and owns the
                failure. The same distinction the login screen draws between
                "that PIN didn't match" and "on our side".
              */}
              {error ? PIN_MISMATCH_COPY : ""}
            </p>
          </>
        )}
      </div>

      {/* No pad once the rows match: what they typed is kept, not edited. */}
      {showEntry && !done && pad.open && (
        <NevoKeyboard
          layout="pad"
          onKey={pressDigit}
          onBackspace={backspace}
          className="sticky bottom-0 z-40 shrink-0"
        />
      )}
    </div>
  );
}

/**
 * One row of PIN boxes. `offset` is the absolute index of its first box.
 *
 * Exported because the change-PIN flow's first step draws the same boxes for
 * the CURRENT pin. Two copies of "what a PIN entry looks like" eventually
 * disagree about the caret, the error colour or the box count, and a child
 * would meet two different-looking PIN rows inside one flow.
 */
export function PinRow({
  filled,
  offset,
  caretAt,
  error,
  length = STUDENT_PIN_LENGTH,
  className,
}: {
  filled: number;
  offset: number;
  caretAt: number;
  error: boolean;
  /**
   * How many boxes. Defaults to the length a new PIN is created at; a row
   * that CHECKS an existing PIN passes more, because that PIN may be longer.
   */
  length?: number;
  /** Spacing a frame draws differently - frame 27's rows sit 36px down, 14px apart. */
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap justify-center gap-3",
        offset === 0 && "mt-10",
        className,
      )}
    >
      {Array.from({ length }, (_, i) => {
        const idx = offset + i;
        const isFilled = filled > idx;
        const isActive = idx === caretAt;
        return (
          <div
            key={idx}
            className={cn(
              "flex size-12 items-center justify-center rounded-[10px] border-[1.5px] bg-nevo-cream shadow-[0_2px_8px_rgba(0,0,0,0.05)]",
              /*
               * A FILLED BOX KEEPS THE NAVY BORDER, as frame 27's Change PIN
               * draws it - on PIN creation too (D132, 8 Oct): "the same
               * component doing the same job". Only the caret's box was navy.
               */
              isActive || isFilled
                ? "border-nevo-navy"
                : error
                  ? "border-nevo-violet"
                  : "border-nevo-near-black/20",
            )}
          >
            {isFilled && (
              <span className="size-3 rounded-full bg-nevo-near-black" />
            )}
          </div>
        );
      })}
    </div>
  );
}
