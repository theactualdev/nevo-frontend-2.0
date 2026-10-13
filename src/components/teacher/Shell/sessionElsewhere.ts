"use client";

import { useEffect } from "react";
import { getSession, sessionUserIdFromStorage } from "@/lib/auth/session";

/**
 * SIGNING OUT IN ONE TAB LEFT EVERY OTHER TEACHER TAB WHERE IT WAS (C02).
 *
 * Each tab reads the session once and keeps it in memory, so the others went on
 * showing the console - and, as soon as anything re-read the role cookie the
 * sign-out had cleared, the rail fell back to the designed walkthrough's
 * persona over a real teacher's page. Signing in as somebody else did the same
 * with the previous teacher's screen still open.
 *
 * Whoever this tab was signed in as when it opened is who it keeps showing; if
 * another tab ends that account, or replaces it, this one leaves too. A full
 * page load, because that is what reads the session again.
 */

/** Where this tab goes, or null to stay put. A token refresh is the same account. */
export function elsewhereDoor(
  mine: string | null,
  now: string | null | undefined,
): string | null {
  if (!mine || now === undefined || now === mine) return null;
  // Someone else's console is not this page; their own home is. Nobody at all
  // means the door.
  return now ? "/teacher/dashboard" : "/auth/teacher";
}

export function useSessionElsewhere(): void {
  useEffect(() => {
    // Signed out on arrival - the designed walkthrough - has nothing to lose.
    const mine = getSession()?.userId ?? null;
    const onStorage = (e: StorageEvent) => {
      const door = elsewhereDoor(mine, sessionUserIdFromStorage(e));
      if (door) window.location.assign(door);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
}
