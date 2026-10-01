"use client";

import { useEffect, useRef } from "react";
import { IllustrationWrapper, NevoLockup } from "@/components/shared";
import { BUSY_PHASE, BUSY_REASON, SIGNAL_EVENT_TYPES } from "@/lib/constants";
import type { TrackEvent } from "@/hooks";

/**
 * "You're In" transition (UI/UX spec) — the final onboarding screen and the
 * hand-off into the app. Passive and celebratory: a welcoming figure, the full
 * Nevo lockup, and a single warm line. No controls; it auto-advances, and the
 * hold is bracketed as `system_busy` (transition_screen, SCRUM-94 fix 9) so
 * the stillness never reads as hesitation.
 *
 * `deviceRemembered` IS NOT DECORATION. A child who joined by invite link ends
 * onboarding with a real account and no school code — the join endpoints return
 * a `schoolName` and never a code — so `rememberOnboardedStudent` correctly
 * refuses to remember them, because a remembered profile the server cannot
 * authenticate is worse than none.
 *
 * That refusal used to be silent. The caller discarded the result and this
 * screen said "You're all set" to a child who, tomorrow, would open Nevo on the
 * same tablet and find it had never heard of them — with no school code to sign
 * back in with, and nobody having told them or their teacher.
 *
 * So when the device could not be remembered, the screen says so, and says the
 * one thing that is actually true and actionable: a teacher can get them back
 * in. Since 1 Oct that is rarer: the join now returns a session, so the
 * account's own school code is read from `users/me` and the child IS
 * remembered. This line is for when that read fails or the school has no code.
 *
 * NOTE FOR DESIGN: the second line is ours, not from a frame. If you would
 * rather it read differently, or sit somewhere other than under the celebration,
 * it is a one-line change.
 */
export function YoureInScreen({
  onDone,
  holdMs = 2400,
  track,
  deviceRemembered = true,
}: {
  onDone: () => void;
  holdMs?: number;
  track?: TrackEvent;
  /** False when this device cannot sign the child back in on its own. */
  deviceRemembered?: boolean;
}) {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  /*
   * A second line needs longer than the celebration alone. 2400ms is paced for
   * six words; a child reading that their teacher has to help them next time
   * gets the time to read it, which for a SEND learner is not a rounding error.
   */
  const hold = deviceRemembered ? holdMs : holdMs + 2600;
  useEffect(() => {
    const t = setTimeout(() => onDoneRef.current(), hold);
    return () => clearTimeout(t);
  }, [hold]);

  useEffect(() => {
    track?.(SIGNAL_EVENT_TYPES.SYSTEM_BUSY, {
      reason: BUSY_REASON.TRANSITION_SCREEN,
      phase: BUSY_PHASE.START,
    });
    return () =>
      track?.(SIGNAL_EVENT_TYPES.SYSTEM_BUSY, {
        reason: BUSY_REASON.TRANSITION_SCREEN,
        phase: BUSY_PHASE.END,
      });
    // Mount-scoped bracket; `track` is stable from useSignals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-10 text-nevo-near-black">
      <IllustrationWrapper
        src="/illustrations/youre-in-cream.png"
        alt="A welcoming figure"
        width={766}
        height={1041}
        priority
        motion="breathe"
        className="w-[200px] sm:w-[260px] lg:w-[240px]"
      />

      {/* Full Nevo lockup (mark + wordmark) — the brand beat before the app. */}
      <NevoLockup priority className="mt-7" />

      <p className="mt-4 max-w-[280px] text-center text-[19px] font-medium leading-[1.45] tracking-[-0.01em] text-balance sm:max-w-[360px] sm:text-[21px] lg:max-w-[380px] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:delay-200 motion-safe:duration-500">
        You&rsquo;re all set. Let&rsquo;s start learning
      </p>

      {!deviceRemembered && (
        <p className="mt-4 max-w-[300px] text-center text-[15px] leading-[1.55] text-nevo-near-black/70 text-pretty sm:max-w-[360px]">
          Next time you open Nevo, ask your teacher to help you sign in.
        </p>
      )}
    </div>
  );
}
