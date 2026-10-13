"use client";

import Image from "next/image";
import { useEffect } from "react";
import { IllustrationWrapper } from "@/components/shared";
import { BUSY_REASON } from "@/lib/constants";
import { openBusyWindow } from "@/lib/signals/busy";
import type { TrackEvent } from "@/hooks";

/**
 * Transition into the Observed Interaction Sequence (UI/UX spec). A brief,
 * button-less pause — this must feel like a breath, not a decision point. Two
 * copy variants (manual vs SSO first-ever screen). Auto-advances; the hold is
 * bracketed as `system_busy` (transition_screen) so the stillness on it never
 * reads as hesitation.
 */
export function TransitionScreen({
  path = "manual",
  onDone,
  holdMs = 1600,
  track,
}: {
  path?: "manual" | "sso";
  onDone: () => void;
  holdMs?: number;
  track?: TrackEvent;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, holdMs);
    return () => clearTimeout(t);
  }, [onDone, holdMs]);

  useEffect(() => {
    return openBusyWindow(track, BUSY_REASON.TRANSITION_SCREEN);
    // Mount-scoped window; `track` is stable from useSignals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const message =
    path === "sso"
      ? "Welcome to Nevo, let's get to know how you learn"
      : "Now let's get to know how you learn";

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-8 text-nevo-near-black">
      <Image
        src="/brand/nevo-wordmark.png"
        alt="Nevo"
        width={344}
        height={116}
        className="absolute top-4 left-5 h-5 w-auto sm:top-6 sm:left-6 sm:h-[22px] lg:h-6"
      />

      <IllustrationWrapper
        src="/illustrations/youre-in.png"
        alt="A figure stepping through an open door"
        width={766}
        height={1041}
        priority
        motion="breathe"
        className="w-[150px] sm:w-[190px] lg:w-[200px]"
      />

      <p className="mt-6 max-w-[300px] text-center text-[19px] font-medium leading-[1.45] tracking-[-0.01em] text-balance text-nevo-near-black motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:delay-200 motion-safe:duration-500 sm:max-w-[400px] sm:text-xl lg:max-w-[420px]">
        {message}
      </p>
    </div>
  );
}
