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
 * NOTHING ENDS THE PAUSE ON A TIMER, AND NOTHING SAYS WHEN. The frame draws
 * no end to it and the contract sends no retry time with `too_many_attempts`,
 * so the client has no honest moment to release the boxes or to name (rule 5;
 * D156, a backend ask). It lasts until the child leaves by one of the screen's
 * ways out.
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
export function ThrottleNote({ className }: { className?: string }) {
  return (
    <p
      role="status"
      className={cn(
        "mt-[22px] box-content max-w-[280px] rounded-[10px] bg-nevo-violet/14 px-[18px] py-3.5 text-[15px] leading-[1.5] text-nevo-near-black/82",
        className,
      )}
    >
      {THROTTLED_PAUSE_COPY.note}
    </p>
  );
}

/** "Forgot PIN?", raised from a text link to the screen's way out. */
export const RAISED_FORGOT =
  "mt-6 inline-flex h-12 cursor-pointer items-center justify-center rounded-[10px] bg-nevo-violet/22 px-6 text-[15px] font-semibold text-nevo-navy transition-[filter] hover:brightness-105";
