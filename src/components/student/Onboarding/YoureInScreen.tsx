"use client";

import { useEffect, useRef } from "react";
import { IllustrationWrapper, NevoLockup } from "@/components/shared";
import { BUSY_REASON } from "@/lib/constants";
import { openBusyWindow } from "@/lib/signals/busy";
import type { TrackEvent } from "@/hooks";

/**
 * "You're In" transition (UI/UX spec) — the final onboarding screen and the
 * hand-off into the app. Passive and celebratory: a welcoming figure, the full
 * Nevo lockup, and a single warm line. No controls; it auto-advances, and the
 * hold is bracketed as `system_busy` (transition_screen, SCRUM-94 fix 9) so
 * the stillness never reads as hesitation.
 *
 * NO LINE ABOUT SIGNING IN NEXT TIME (D71). It said "Next time you open Nevo,
 * ask your teacher to help you sign in." when the device could not remember
 * the child. Design dropped it: "You're In is a passive moment of success, and
 * a line about asking for help implies something has gone wrong at the exact
 * moment nothing has." If the device cannot remember them, that matters at
 * the next sign-in, not this one.
 */
export function YoureInScreen({
  onDone,
  holdMs = 2400,
  track,
}: {
  onDone: () => void;
  holdMs?: number;
  track?: TrackEvent;
}) {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const t = setTimeout(() => onDoneRef.current(), holdMs);
    return () => clearTimeout(t);
  }, [holdMs]);

  useEffect(() => {
    return openBusyWindow(track, BUSY_REASON.TRANSITION_SCREEN);
    // Mount-scoped window; `track` is stable from useSignals.
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
    </div>
  );
}
