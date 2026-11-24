"use client";

import { useCallback, useEffect, useState } from "react";
import {
  accommodationHistoryApi,
  type AccommodationChange,
  type AccommodationHistory,
} from "@/lib/api/accommodationHistory";
import { ApiError, apiErrorCode } from "@/lib/api/client";
import { LEARNING_SUPPORT_REQUIRED } from "@/lib/api/learningSupport";
import { accommodationCopy } from "@/lib/constants/accommodations";
import { failureKind } from "../NoAccess";

/**
 * D08b's "What changed, and when" (admin backlog 42), read on its own so the
 * section owns its failure: a lost read is said as lost, never as a child
 * Nevo changed nothing for.
 */
export type HistoryState =
  | { phase: "loading" }
  | { phase: "ready"; history: AccommodationHistory }
  | { phase: "failed"; denied: boolean; needsLearningSupport: boolean };

export function useAccommodationHistory(studentId: string, skip: boolean) {
  const [state, setState] = useState<HistoryState>({ phase: "loading" });
  const read = useCallback(() => {
    accommodationHistoryApi
      .forStudent(studentId)
      .then((history) => setState({ phase: "ready", history }))
      .catch((err: unknown) =>
        setState({
          phase: "failed",
          denied: failureKind(err) === "denied",
          needsLearningSupport:
            err instanceof ApiError && apiErrorCode(err.detail) === LEARNING_SUPPORT_REQUIRED,
        }),
      );
  }, [studentId]);
  // Not asked at all where the viewer is known to lack Learning Support: the
  // route is the role's, and the section already says so.
  useEffect(() => {
    if (!skip) read();
  }, [read, skip]);
  const retry = useCallback(() => {
    setState({ phase: "loading" });
    read();
  }, [read]);
  return { state, retry };
}

export interface WeekBar {
  key: string;
  /** "11 Aug" - the server's Monday, as written. */
  label: string;
  count: number;
  /** Pixels, against the busiest week shown (D08b draws 80 at the top). */
  height: number;
}

const BAR_MAX = 80;

/** "2026-08-11" as "11 Aug", read as a calendar date so no timezone moves it. */
function weekLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * The server's weekly counts as D08b's bars, in its order. Raw - nothing is
 * smoothed - and only the weeks it sent: a week with no adaptation is not in
 * the response, and is not drawn as one here (raised, 24 Nov).
 */
export function weekBars(history: AccommodationHistory): WeekBar[] {
  const weeks = history.adaptationsPerWeek.filter(
    (w) => Number.isInteger(w.count) && w.count > 0 && typeof w.weekStarting === "string",
  );
  const busiest = Math.max(0, ...weeks.map((w) => w.count));
  return weeks.map((w) => ({
    key: w.weekStarting,
    label: weekLabel(w.weekStarting),
    count: w.count,
    height: busiest > 0 ? Math.max(4, Math.round((w.count / busiest) * BAR_MAX)) : 0,
  }));
}

export interface ChangeRow {
  key: string;
  date: string;
  /** The backend's two words for its two actions. */
  verb: "Started" | "Stopped";
  /** What Nevo does, in the console's Zero-Tag sentence (`accommodations.ts`). */
  what: string;
}

/**
 * The change log, oldest first as D08b lists it. A change whose support or
 * action this console has no words for is left out, never shown raw.
 */
export function changeRows(history: AccommodationHistory): ChangeRow[] {
  return [...history.changes]
    .filter((c): c is AccommodationChange => !!c && typeof c.occurredAt === "string")
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    .flatMap((c, i) => {
      const what = accommodationCopy(c.accommodation);
      const verb = c.action === "added" ? "Started" : c.action === "removed" ? "Stopped" : null;
      if (!what || !verb) return [];
      return [
        {
          key: `${c.occurredAt}-${c.accommodation}-${i}`,
          date: new Date(c.occurredAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
          verb,
          what,
        },
      ];
    });
}
