"use client";

import { useEffect, useState } from "react";

/**
 * Offline banner (board 28, "Offline Banner") - a calm strip across the top
 * of a tab while the device has no connection.
 *
 * IT REPLACES A FULL-SCREEN TAKEOVER, and the IA is why: *"top of any screen
 * when offline; never navigates; Dismiss X hides it; auto-dismisses when
 * connectivity restored"*. The takeover hid every tab but Downloads behind a
 * page whose "Try again" called `router.refresh()` - which re-fetches the
 * route and cannot touch a state that only the browser's `online` event
 * clears. So the button did nothing, and the child could not see the message
 * they were half-way through writing. Under a banner the tab stays in front
 * of them, whatever it had already loaded stays readable, and each tab's own
 * failure state answers for what it could not load.
 *
 * NO "TRY AGAIN" BECAUSE THE FRAME DRAWS NONE. Reconnecting is the retry: the
 * banner goes the moment the browser says the connection is back.
 *
 * Dismissal is held here, not in the shell, so it resets on its own: the
 * banner unmounts when the device comes back online, and the next drop shows
 * it again.
 */
export function TabOfflineBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="status"
      className="relative z-20 flex h-10 shrink-0 items-center gap-2 bg-nevo-cream-elevated px-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] md:h-11 md:gap-2.5 md:px-7 lg:px-8"
    >
      {/* The frame's own glyph, not a library icon that looks like it. */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="size-4 shrink-0 text-nevo-near-black md:size-[18px]"
      >
        <path d="M1 1l22 22M8.5 8.5A5 5 0 0 0 7 18h10M16.7 11.3A5.5 5.5 0 0 0 12 9" />
      </svg>
      <span className="min-w-0 flex-1 text-[13px] text-nevo-near-black md:text-sm">
        No internet connection - your progress is saved
      </span>
      {/* 44px to tap, though the frame draws only the cross. */}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="-mr-3.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-nevo-near-black/50 transition-colors hover:text-nevo-near-black/70"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
          className="size-4 md:size-[18px]"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

/** Live online/offline state (mirrors the player banner's listener). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    // Client-only navigator read, then event-driven - hydration-safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}
