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

/**
 * THE RECORD A PAGE HAS OPEN, BY ITS OWN NAME (backlog item 32; C15: "You're
 * viewing: Amara Okafor", "What's going on with Amara?").
 *
 * The drawer has no read of its own for a student's or a lesson's name, so it
 * said "this student". The page beneath it has already read the name, and
 * publishes it here - only once it has it, and cleared when it leaves. The
 * drawer uses it only when the id matches the record on the address, so a
 * name can never be shown beside a different child.
 */
export interface AskNevoRecord {
  kind: "student" | "lesson";
  id: string;
  /** The full name or the lesson's title, as the page's own read gave it. */
  name: string;
  /** A student's first name, for the prompts; absent for a lesson. */
  firstName?: string | null;
}

let record: AskNevoRecord | null = null;

export function setAskNevoRecord(next: AskNevoRecord | null): void {
  const same =
    next === record ||
    (next !== null &&
      record !== null &&
      next.kind === record.kind &&
      next.id === record.id &&
      next.name === record.name &&
      next.firstName === record.firstName);
  if (same) return;
  record = next;
  listeners.forEach((listener) => listener());
}

/** The record the open page has published, or null - always null on the server. */
export function useAskNevoRecord(): AskNevoRecord | null {
  return useSyncExternalStore(
    subscribe,
    () => record,
    () => null,
  );
}
