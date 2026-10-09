import { STUDENT_PIN_LENGTH } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** D154, `Nevo Login Frame`'s `throttled` state, verbatim. */
export const THROTTLED_PAUSE_COPY = {
  heading: "Let's take a moment",
  note: "Try your PIN again in a moment. No rush.",
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
 * NOTHING ENDS THE PAUSE ON A TIMER. The frame draws no end to it and the
 * contract sends no retry time with `too_many_attempts`, so the client has no
 * honest moment to release the boxes (rule 5). It lasts until the child
 * leaves by one of the screen's ways out; asked of design.
 *
 * It replaces D68's wait line ("Let's wait a moment before trying again.") in
 * the doors' tinted box, and #717's "That didn't save" on PIN creation.
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
      {Array.from({ length }, (_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-[10px] border-[1.5px] border-nevo-near-black/20 bg-nevo-cream",
            boxClassName,
          )}
        />
      ))}
    </div>
  );
}

/** The note under the held boxes. Announced, as the door's own lines are. */
export function ThrottleNote({ className }: { className?: string }) {
  return (
    <p
      role="status"
      className={cn(
        "mt-[22px] max-w-[280px] rounded-[10px] bg-nevo-violet/14 px-[18px] py-3.5 text-[15px] leading-[1.5] text-nevo-near-black/82",
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
