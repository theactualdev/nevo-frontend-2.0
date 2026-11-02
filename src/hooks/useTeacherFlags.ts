"use client";

import { useCallback } from "react";
import { intelligenceApi, type AttentionFlag } from "@/lib/api/intelligence";
import { useLiveQuery } from "./useLiveQuery";
import { useStudentDirectory } from "./useStudentDirectory";

/**
 * "Worth your attention" - the teacher's open flags, from
 * `GET /api/intelligence/flags`.
 *
 * The endpoint names a student by id only, so the directory resolves the name
 * and class. A flag whose student cannot be resolved still shows: the
 * description is the substance, and dropping a flag because we could not
 * label it would hide the very thing the teacher is meant to see.
 *
 * Acknowledged flags are filtered out - the section is what still needs the
 * teacher, not a history.
 *
 * WHAT THE CARD LOSES. C03 pairs each flag with a five-bar evidence sparkline,
 * an evidence caption and two actions. None has a source: the flag carries no
 * series and no target. A live card therefore shows the accent, who it is
 * about, what Nevo noticed and when - and one action that genuinely works.
 *
 * `evidenceSeries` and `actionTargets` shipped on 31 Aug, and design then
 * deferred the flag card's sparkline AND its second action to v1.5 - so the
 * card ships without them deliberately, and neither field is read.
 *
 * THE TAP IS NOT THE ACKNOWLEDGEMENT any more. Design ruled on 2 Sep that
 * tapping the card marked the flag seen; Lydia ruled on 13 Oct that a class
 * teacher's tap means "I have read this" and clears the card from their own
 * view only, while acknowledging is learning support's act. So the card no
 * longer acknowledges (see `LiveFlagCard`), and this filter still drops a
 * flag once learning support has acknowledged it.
 *
 * THE VIEWER'S OWN READ IS ON THE FLAG NOW (SCRUM-252: `seenByMe`, set by
 * `POST …/seen`). It is carried, not filtered here: it clears a card from
 * the teacher's Home, and a class page still counts a flag they have read,
 * because the flag is still open.
 *
 * ONLY OPEN FLAGS (Teslim 9c35c95, 27 Oct). A flag now closes when its
 * evidence stops holding (`resolvedAt`), and `openOnly` leaves closed ones
 * out, so a child who recovered stops being "worth your attention".
 *
 * That is why `studentId` is carried through: the card needs somewhere to go,
 * and the flag endpoint names a student by id only.
 */

export interface TeacherFlag {
  id: string;
  /** Where the tap goes. The flag names a student by id and nothing else. */
  studentId: string;
  /** The student's name, or null when the directory could not resolve it. */
  name: string | null;
  /** Their class, when known. */
  context: string | null;
  note: string;
  generatedAt: string;
  /** Navy accent and the drop glyph, as C03 uses for a sudden change. */
  isSudden: boolean;
  /** This teacher has read it - their Home no longer shows it. */
  seenByMe?: boolean;
}

/**
 * C03 distinguishes a sudden change from a pattern.
 *
 * The enum landed since this was written - `sudden_change` and
 * `engagement_decline` - and both deployed values come out of this correctly:
 * a decline is a pattern, not a sudden change. It stays a match rather than a
 * lookup because a third value will ship before we hear about it, and guessing
 * wrong about an accent is cheaper than rendering no card.
 */
export function suddenish(flagType: string): boolean {
  const t = flagType.toLowerCase();
  return (
    t.includes("sudden") ||
    t.includes("drop") ||
    t.includes("stall") ||
    t.includes("stopped") ||
    t.includes("disengag")
  );
}

export interface TeacherFlags {
  flags: TeacherFlag[];
  /** Live flags are in hand - an empty list is a real calm morning. */
  live: boolean;
  /** The call failed; the caller should not claim anything either way. */
  failed: boolean;
  loading: boolean;
  /**
   * Every page was read, so `flags` is ALL of them and its length may be
   * said as a number. False when the pages ran out with more still coming -
   * then the list is a floor, and a floor said as a total is an under-report.
   */
  complete: boolean;
}

export function useTeacherFlags(): TeacherFlags {
  /*
   * EVERY PAGE, NOT THE FIRST. `getFlags()` sent no limit, so it read one
   * page of 50 - acknowledged rows included, and dropped below - and Home
   * said "N things are worth your eye" over that page as though it were the
   * whole. `allFlags` reads 200 at a time until a short page and says
   * whether it got to the end.
   */
  const run = useCallback(() => intelligenceApi.allFlags(10, { openOnly: true }), []);
  const { data: all, failed, loading } = useLiveQuery<{
    flags: AttentionFlag[];
    complete: boolean;
  }>(run, []);
  const { students } = useStudentDirectory();

  if (all === null) {
    return { flags: [], live: false, failed, loading, complete: false };
  }
  const data = all.flags;

  const byId = new Map(students.map((s) => [s.studentId, s]));
  return {
    flags: data
      .filter((f) => !f.acknowledged)
      .map((f) => {
        const student = byId.get(f.studentId);
        return {
          id: f.id,
          studentId: f.studentId,
          name: student?.name ?? null,
          context: student?.className ?? null,
          note: f.description,
          generatedAt: f.generatedAt,
          isSudden: suddenish(f.flagType),
          seenByMe: f.seenByMe === true,
        };
      }),
    live: true,
    failed: false,
    loading: false,
    complete: all.complete,
  };
}
