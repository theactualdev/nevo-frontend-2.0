import { useEffect, useState } from "react";
import { STUDENT_PIN_LENGTH } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { PinBox } from "./PinBox";

/**
 * D154, `Nevo Login Frame`'s `throttled` state, verbatim - and its note is
 * D156's line (13 Oct), the one wording everywhere a pause is shown: "Backend
 * sends no retry time, so the front end cannot state one and must not invent
 * one. Until it does, the line says what is true without a number." It was
 * "Try your PIN again in a moment. No rush.", which named a moment nobody
 * knows.
 */
export const THROTTLED_PAUSE_COPY = {
  heading: "Let's take a moment",
  note: "Let's wait a little before trying again.",
  forgot: "Forgot PIN?",
} as const;

/**
 * D154 (9 Oct), the PIN entry's throttled pause: the pieces every screen where
 * a child enters a PIN draws when the server says `too_many_attempts`.
 *
 * "A pause, not a lockout: no count of attempts shown, no countdown, no
 * how-long, no blame, no red, no error." The heading takes the screen's own
 * heading slot, the boxes stay where they were but HELD - dimmed, empty,
 * inert - "so it reads as the same screen, paused", and the note sits under
 * them. Where there is a PIN to forget, "Forgot PIN?" is raised as the way
 * out (`RAISED_FORGOT`), "because a child who reaches a throttle is usually a
 * child who has forgotten the PIN".
 *
 * THE SERVER ENDS THE PAUSE, AND NOTHING SAYS WHEN. The 429 now carries
 * `retryAt` (Teslim 8a7199b, SCRUM-251: "A child who waits out the pause on
 * the same screen can try again without leaving and coming back"), so the
 * boxes open again at that moment (`useThrottleRelease`) - the server's
 * moment, never one the device works out. The frame still says no how-long
 * and no countdown, so nothing on screen names it. A throttle without
 * `retryAt` lasts until the child leaves by one of the screen's ways out.
 *
 * It replaces D68's wait line ("Let's wait a moment before trying again.") in
 * the doors' tinted box, and #717's "That didn't save" on PIN creation, which
 * draws this same pause, in these same words.
 */
export function HeldPinBoxes({
  boxClassName,
  className,
  length = STUDENT_PIN_LENGTH,
}: {
  /** The screen's own box size, so the row does not change shape. */
  boxClassName: string;
  className?: string;
  length?: number;
}) {
  return (
    <div
      aria-hidden="true"
      data-held-pin
      className={cn("flex justify-center gap-3.5 opacity-35", className)}
    >
      {/* The one PIN box (D177), empty, and flat as D154 draws it. */}
      {Array.from({ length }, (_, i) => (
        <PinBox
          key={i}
          filled={false}
          className={cn("shadow-none", boxClassName)}
        />
      ))}
    </div>
  );
}

/**
 * The note under the held boxes. Announced, as the door's own lines are.
 *
 * `box-content`: D154's 280px is the text's width, with the padding outside
 * it, as the frame's own box is measured. Here it was 280 overall.
 */
export function ThrottleNote({
  className,
  until = null,
}: {
  className?: string;
  /**
   * When the server says the pause ends (`retryAt`, `throttleEndsAt`), in
   * epoch ms. With it the note says when (Lydia, 7 Nov, copy pass: "Try again
   * in {time}." only once the server sends the retry time); without it, the
   * note as before. Said once, as the pause begins: never a countdown.
   */
  until?: number | null;
}) {
  // Read once, as the pause starts: a line that changed under the child
  // would be the countdown D154 rules out.
  const [now] = useState(() => Date.now());
  const wait = until === null ? null : Math.ceil((until - now) / 1000);
  return (
    <p
      role="status"
      className={cn(
        "mt-[22px] box-content max-w-[280px] rounded-[10px] bg-nevo-violet/14 px-[18px] py-3.5 text-[15px] leading-[1.5] text-nevo-near-black/82",
        className,
      )}
    >
      {wait !== null && wait > 0
        ? `Try again in ${pauseLength(wait)}.`
        : THROTTLED_PAUSE_COPY.note}
    </p>
  );
}

/**
 * "a minute" / "5 minutes": a wait a child can act on, rounded UP, so the
 * door is open when they come back (as the admin's email wait reads).
 */
export function pauseLength(seconds: number): string {
  if (seconds <= 60) return "a minute";
  return `${Math.ceil(seconds / 60)} minutes`;
}

/**
 * Lift a pause at the server's `retryAt` (`throttleEndsAt`), on the screen
 * the child is still on. Null is no end, and nothing is set. `release` must
 * be stable, or each render would start the wait again.
 */
export function useThrottleRelease(
  until: number | null,
  release: () => void,
): void {
  useEffect(() => {
    if (until === null) return;
    const timer = setTimeout(release, Math.max(0, until - Date.now()));
    return () => clearTimeout(timer);
  }, [until, release]);
}

/** "Forgot PIN?", raised from a text link to the screen's way out. */
export const RAISED_FORGOT =
  "mt-6 inline-flex h-12 cursor-pointer items-center justify-center rounded-[10px] bg-nevo-violet/22 px-6 text-[15px] font-semibold text-nevo-navy transition-[filter] hover:brightness-105";
