"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { sessionExpiredDoor } from "@/lib/api/client";
import { getSession } from "@/lib/auth/session";
import { useHasSession } from "./useHasSession";

/**
 * Notice when a child's session runs out underneath them, and say so.
 *
 * `useSessionRefresh` renews a live token ahead of expiry, so this is the case
 * where that failed: offline, refused, or a backend having a bad hour. It is
 * the end of that path rather than a duplicate of it.
 *
 * WHAT GOING QUIET ACTUALLY COSTS. `getSession()` clears itself the moment
 * `expiresAt` passes, and `useLessonProgress.report()` opens with
 * `if (!enabled || !getToken()) return;` - so from that instant every position
 * the child reaches is discarded, and `holdProgress` has nobody to attribute a
 * held position to either. The redirect that exists for a dead session is
 * driven by a 401, and with no token we make no requests, so no 401 ever
 * arrives. The route guard would catch them, but it only runs on navigation -
 * and a child reading one segment for four minutes does not navigate. They
 * work on into a void, and lose the lot when they finally move.
 *
 * WHY A TIMER AND NOT JUST `useHasSession`. That hook's snapshot is re-read on
 * every render, so the flip does land in place - but only once something else
 * re-renders. On a still screen nothing does. Expiry is a known instant, so
 * this arms for it, and re-arms afterwards because a successful refresh moves
 * it. `visibilitychange` covers the laptop that slept through the timer.
 *
 * A DELIBERATE SIGN-OUT IS NOT A LAPSE. Signing out clears the session and
 * navigates to the right door itself; telling that child their session
 * "expired" would be both wrong and alarming. The clock tells the two apart -
 * only a lapse leaves an `expiresAt` already in the past.
 */

/** `setTimeout` overflows past ~24.8 days and fires immediately. */
const MAX_DELAY_MS = 20 * 24 * 60 * 60 * 1000;

/**
 * Arm just past expiry rather than exactly on it, so the check runs on the
 * dead side of the boundary. `getSession()` clears at `<= Date.now()`, and a
 * timer that fires a millisecond early would find the session alive, re-arm
 * for zero, and spin.
 */
const GRACE_MS = 1000;

export function useSessionLapse(): void {
  const signedIn = useHasSession();
  const router = useRouter();
  /** The last session we saw, so a lapse can be told from a sign-out. */
  const seen = useRef<{ expiresAt: string; role: string } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Has the session we were watching died? If so, leave; if not, arm for
     * whenever it is next due to.
     */
    const check = () => {
      clearTimeout(timer);
      const session = getSession();

      if (session) {
        seen.current = { expiresAt: session.expiresAt, role: session.role };
        const due = Date.parse(session.expiresAt) - Date.now();
        // An unparseable expiry gives us no instant to arm for. Leave it: the
        // session is present and a bad date is not a reason to evict a child
        // mid-lesson.
        if (Number.isNaN(due)) return;
        timer = setTimeout(check, Math.min(due + GRACE_MS, MAX_DELAY_MS));
        return;
      }

      const had = seen.current;
      // Never held one: a visitor on the designed walkthrough, or a child
      // partway through onboarding who has no account yet. Nothing was lost.
      if (!had) return;
      // Cleared before its time is a sign-out, and that path navigates itself.
      if (Date.now() < Date.parse(had.expiresAt)) return;

      seen.current = null;
      // With where they were, so "Log back in" returns them to it.
      router.replace(
        sessionExpiredDoor(
          had.role,
          null,
          `${window.location.pathname}${window.location.search}`,
        ),
      );
    };

    // A backgrounded tab's timers are throttled and a sleeping machine's do not
    // run at all, so a child who closes the lid and comes back an hour later
    // needs the check on return, not whenever the stale timer gets round to it.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    check();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // `signedIn` is not read here - it is the re-render that a sign-in or a
    // cross-tab sign-out arrives on, and re-running the check is the point.
  }, [signedIn, router]);
}
