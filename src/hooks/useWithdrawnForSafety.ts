"use client";

import { useSyncExternalStore } from "react";
import { getSession } from "@/lib/auth/session";
import { withdrawnForSafety } from "@/lib/offline/savedLessons";
import { SHELF_CHANGED } from "@/lib/offline/shelfCheck";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(SHELF_CHANGED, onChange);
  return () => window.removeEventListener(SHELF_CHANGED, onChange);
}

/**
 * Whether the saved copy a lesson is open from has been withdrawn for safety
 * since (Lydia, 19 Nov, L14): the connection came back, and the copy's status
 * check answered `safety_revoked`.
 *
 * ONLY A LESSON OPEN FROM ITS COPY. That is the download path, where the
 * 12 Nov rule - held content is revoked at first connection, before any
 * further content is read - was never carried. A lesson read from the server
 * is the server's to hold, and nothing here stands in for it.
 */
export function useWithdrawnForSafety(
  lessonId: string,
  fromShelf: boolean,
): boolean {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!fromShelf) return false;
      const owner = getSession()?.userId;
      return owner ? withdrawnForSafety(owner, lessonId) : false;
    },
    () => false,
  );
}
