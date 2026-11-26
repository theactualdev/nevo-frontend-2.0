"use client";

import { useCallback, useEffect, useState } from "react";
import {
  accommodationHistoryApi,
  HISTORY_WEEKS,
  type AccommodationChange,
  type AccommodationHistory,
} from "@/lib/api/accommodationHistory";
import { ApiError, apiErrorCode } from "@/lib/api/client";
import { LEARNING_SUPPORT_REQUIRED } from "@/lib/api/learningSupport";
import { accommodationCopy } from "@/lib/constants/accommodations";
import { failureKind } from "../NoAccess";
import { useMountedRef } from "@/hooks/useMountedRef";

/**
 * D08b's "What changed, and when" (admin backlog 42), read on its own so the
 * section owns its failure: a lost read is said as lost, never as a child
 * Nevo changed nothing for.
 */
export type HistoryState =
  | { phase: "loading" }
  | {
      phase: "ready";
      history: AccommodationHistory;
      /** When the read landed: the window's weeks are counted back from it. */
      readAt: number;
    }
  | { phase: "failed"; denied: boolean; needsLearningSupport: boolean };

export function useAccommodationHistory(studentId: string, skip: boolean) {
  const [state, setState] = useState<HistoryState>({ phase: "loading" });
  const mounted = useMountedRef(); // A read that answers after this has gone sets nothing (check 21).
  const read = useCallback(() => {
    accommodationHistoryApi
      .forStudent(studentId)
      .then((history) => {
        if (mounted.current) setState({ phase: "ready", history, readAt: Date.now() });
      })
      .catch((err: unknown) => {
        if (!mounted.current) return;
        setState({
          phase: "failed",
          denied: failureKind(err) === "denied",
          needsLearningSupport:
            err instanceof ApiError && apiErrorCode(err.detail) === LEARNING_SUPPORT_REQUIRED,
        });
      });
  }, [studentId, mounted]);
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
  /** The week's Monday, "2026-08-10". */
  key: string;
  /** "10 Aug" - the Monday, as written. */
  label: string;
  /**
   * The server's count for the week, or NULL for a week it did not send - an
   * empty slot, never a zero: we were not given one (rule 5).
   */
  count: number | null;
  /** Pixels, against the busiest week sent (D08b draws 80 at the top). */
  height: number;
}

const BAR_MAX = 80;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * The UTC Monday on or before `t`, as the server buckets a week
 * (`date_trunc('week', ...)`, learning_support_records.py).
 */
function mondayOf(t: number): number {
  const d = new Date(t);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const sinceMonday = (new Date(midnight).getUTCDay() + 6) % 7;
  return midnight - sinceMonday * DAY_MS;
}

/** "2026-08-10" as a UTC day, or null. */
function dayOf(iso: string): number | null {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? Date.UTC(y, m - 1, d) : null;
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

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
 * D08b's bars, one SLOT PER WEEK of the window read - the `weeks` asked for,
 * counted back from `readAt` as the server counts them, which is 13 calendar
 * weeks for 12, the first and last partial. Raw: nothing is smoothed.
 *
 * QUIET WEEKS ARE EMPTY SLOTS, NOT MISSING ONES (review, 25 Nov). The server
 * leaves a week with no adaptation out of `adaptationsPerWeek`, and the bars
 * used to sit side by side - so three weeks a month apart read as three weeks
 * running. Each count now goes in its own week, and a week the server did not
 * send is a slot with no bar and no figure: it was never given as 0, so it is
 * not drawn as one (rule 5). S15, raised to Teslim, asks for every week with
 * explicit zeros; a 0 he sends is drawn as his 0.
 *
 * A week sent outside the window (a clock apart) widens it rather than being
 * dropped.
 */
export function weekBars(
  history: AccommodationHistory,
  readAt: number,
  weeks: number = HISTORY_WEEKS,
): WeekBar[] {
  const sent = new Map<number, number>();
  for (const w of history.adaptationsPerWeek) {
    const day = typeof w.weekStarting === "string" ? dayOf(w.weekStarting) : null;
    if (day === null || !Number.isInteger(w.count) || w.count < 0) continue;
    const monday = mondayOf(day);
    sent.set(monday, (sent.get(monday) ?? 0) + w.count);
  }
  const mondays = [...sent.keys()];
  const first = Math.min(mondayOf(readAt - weeks * WEEK_MS), ...mondays);
  const last = Math.max(mondayOf(readAt), ...mondays);
  const busiest = Math.max(0, ...sent.values());
  const slots: WeekBar[] = [];
  for (let monday = first; monday <= last; monday += WEEK_MS) {
    const key = isoDay(monday);
    const count = sent.get(monday) ?? null;
    slots.push({
      key,
      label: weekLabel(key),
      count,
      height: count && busiest > 0 ? Math.max(4, Math.round((count / busiest) * BAR_MAX)) : 0,
    });
  }
  return slots;
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
