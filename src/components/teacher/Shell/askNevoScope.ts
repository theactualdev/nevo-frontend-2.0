"use client";

import { useSyncExternalStore } from "react";

/**
 * A class a screen has chosen WITHOUT putting it on the address (T182).
 *
 * Ask Nevo scopes its answer to the record a teacher has open, and it reads
 * that from the route - `/teacher/classes/{id}` is a class. Insights is the
 * one screen where the class is chosen in place: the teacher picks a pill and
 * the URL stays `/teacher/insights`, so the drawer said "You're on: Insights"
 * and asked about nothing in particular, beside a page about one class.
 *
 * The screen sets this when a class is picked and clears it when it leaves.
 * A store rather than context, because the drawer lives in the shell, above
 * the page that knows.
 */

let classId: string | null = null;
const listeners = new Set<() => void>();

export function setAskNevoClass(id: string | null): void {
  if (id === classId) return;
  classId = id;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The class the open screen has chosen, or null - always null on the server. */
export function useAskNevoClass(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => classId,
    () => null,
  );
}
