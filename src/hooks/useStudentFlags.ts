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
 * ACKNOWLEDGED FLAGS STAY, with who saw them and when (C08's "A flag Learning
 * Support has acknowledged": "Adaora from learning support saw this on 12
 * October."). They were dropped, so a flag vanished from the class teacher's
 * view of the child the moment learning support read it - as though Nevo had
 * stopped noticing. The flag is still open; what changed is that someone
 * saw it, and that is what the line says. Nothing here acknowledges anything:
 * acknowledging is learning support's act (Lydia, 13 Oct), and opening a
 * profile is not it. Home's "Worth your attention" keeps its own rule.
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
  /**
   * Learning support has seen it: who, as the server names them (null when
   * it sends no name), and when (null when it sends no date). Null when no
   * one has.
   */
  seen: { by: string | null; on: string | null } | null;
}

/**
 * Newest first, acknowledged ones included with who saw them.
 *
 * Exported for its own tests: the profile mocks this hook, so a mapper tested
 * only through the component is a mapper nothing runs.
 */
export function toNoticed(flags: AttentionFlag[]): Noticed[] {
  return flags
    .map((f) => ({
      id: f.id,
      note: f.description,
      generatedAt: f.generatedAt,
      isSudden: suddenish(f.flagType),
      seen: f.acknowledged
        ? {
            by: f.acknowledgedByName?.trim() || null,
            on: f.acknowledgedAt ?? null,
          }
        : null,
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
    // Only open flags: one whose evidence stopped holding has closed
    // (Teslim 9c35c95), and is not something Nevo is noticing now.
    () => intelligenceApi.getFlags({ studentId, openOnly: true }),
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
