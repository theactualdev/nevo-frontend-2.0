"use client";

import { useCallback } from "react";
import { intelligenceApi, type AttentionFlag } from "@/lib/api/intelligence";
import { useLiveQuery } from "./useLiveQuery";
import { suddenish } from "./useTeacherFlags";

/**
 * What Nevo has noticed about ONE child - C08's noticing banner.
 *
 * `GET /api/intelligence/flags?studentId=` has taken the parameter all along;
 * the profile said the banner was absent "for want of an endpoint" and that
 * was wrong. `description` is REQUIRED on `AttentionFlagResponse`, so a flag
 * that exists always carries the sentence the banner is made of, and there is
 * no case where a flag arrives with nothing to render.
 *
 * `flagType` IS NOT CARRIED. The teacher dashboard uses it for an accent, and
 * "engagement decline" beside a named child is the diagnostic register rule 2
 * forbids - the description is what Nevo saw, which is the whole substance.
 * Only the one bit the profile chip needs survives, as `isSudden`: design's
 * chip precedence (12 Oct) puts a sudden change above worth a glance, and the
 * type is the engine's word for which this is. The type's own words are never
 * rendered.
 *
 * ACKNOWLEDGED FLAGS ARE DROPPED, the same rule "Worth your attention" on the
 * dashboard follows: the banner is what still wants the teacher, not a
 * history. Nothing here acknowledges anything: acknowledging is learning
 * support's act (Lydia, 13 Oct), and opening a profile is not it.
 *
 * NO WINDOW IS CLAIMED. The frame labels this "This week:" and the contract
 * cannot support it: a flag carries `generatedAt`, the route declares no
 * window, and deciding "this week" from a date is the threshold frontend §6
 * rules out. Each line carries its own date instead, the way this screen
 * already dates adaptations and sessions.
 */

export interface Noticed {
  id: string;
  /** Nevo's own sentence. Never assembled here. */
  note: string;
  generatedAt: string;
  /** A `sudden_change` flag, as `useTeacherFlags` reads it for Home. */
  isSudden: boolean;
}

/**
 * Newest first, acknowledged ones gone.
 *
 * Exported for its own tests: the profile mocks this hook, so a mapper tested
 * only through the component is a mapper nothing runs.
 */
export function toNoticed(flags: AttentionFlag[]): Noticed[] {
  return flags
    .filter((f) => !f.acknowledged)
    .map((f) => ({
      id: f.id,
      note: f.description,
      generatedAt: f.generatedAt,
      isSudden: suddenish(f.flagType),
    }))
    .sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
}

export interface StudentFlags {
  noticed: Noticed[];
  /**
   * The read failed. An empty banner then means nothing about the child, and
   * the profile falls back to the count it was given.
   */
  failed: boolean;
  loading: boolean;
}

export function useStudentFlags(studentId: string): StudentFlags {
  const run = useCallback(
    () => intelligenceApi.getFlags({ studentId }),
    [studentId],
  );
  const { data, failed, loading } = useLiveQuery<AttentionFlag[]>(run, [
    studentId,
  ]);

  return {
    // A bare array is what this route returns; anything else is not a flag
    // list and is treated as nothing rather than mapped over.
    noticed: Array.isArray(data) ? toNoticed(data) : [],
    failed,
    loading,
  };
}
