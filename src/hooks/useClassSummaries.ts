"use client";

import { useCallback } from "react";
import { classesApi, intelligenceApi } from "@/lib/api";
import { escalationsApi } from "@/lib/api/escalations";
import {
  attentionByStudent,
  rosterCounts,
  type RosterCounts,
} from "@/components/teacher/shared/summaryState";
import { suddenish } from "./useTeacherFlags";
import { useLiveQuery } from "./useLiveQuery";

/**
 * Each class's summary line on Home and My Classes, counted exactly as the
 * class page counts its own header: the class's roster, the open flags the
 * SERVER filtered to that class (`GET /api/intelligence/flags?classId=`), and
 * the class's open escalations (`GET /api/v1/escalations?classId=&openOnly=`,
 * as `useEscalated` reads them), put through `rosterCounts`. So a card and the
 * page it opens never disagree.
 *
 * THE ESCALATIONS WERE MISSING. The class page counts a child a teacher raised
 * for learning support as Flagged; the cards never read escalations, so a card
 * could say "Everyone on track" over a page that said "1 flagged".
 *
 * A FLAG LEARNING SUPPORT HAS SEEN STILL COUNTS (Lydia, copy pass, 7 Nov: the
 * roster keeps its marker). Seeing it does not close it; the server does that
 * when its evidence stops holding, and `openOnly` leaves those out.
 *
 * Nothing is filtered on the device: the flag rows don't carry a class, so the
 * class has to be the server's filter, and a teacher has a handful of classes,
 * so this is three requests per class.
 *
 * A class where any read failed or stopped short has NO entry. "Everyone on
 * track" over a read we don't have is a claim about the class, and a count over
 * part of a list is a floor said as a total. The card says nothing about the
 * class then, rather than something untrue.
 */
export interface ClassSummaries {
  /** Per classId; a missing class couldn't be counted. */
  counts: ReadonlyMap<string, RosterCounts>;
  loading: boolean;
}

/**
 * One class's counts, or null when its flags or escalations stopped short.
 * Exported for tests.
 */
export async function countClass(classId: string): Promise<RosterCounts | null> {
  const [students, flags, escalations] = await Promise.all([
    classesApi.classStudents(classId),
    intelligenceApi.allFlags(10, { openOnly: true, classId }),
    escalationsApi.allOpen(10, { classId }),
  ]);
  if (!flags.complete || !escalations.complete) return null;
  const open = flags.flags.map((f) => ({
    studentId: f.studentId,
    isSudden: suddenish(f.flagType),
  }));
  const escalated = new Set(escalations.open.map((e) => e.studentId));
  return rosterCounts(students, attentionByStudent(open, escalated));
}

export function useClassSummaries(classIds: readonly string[]): ClassSummaries {
  const key = classIds.join(",");
  const run = useCallback(async () => {
    const ids = key ? key.split(",") : [];
    const settled = await Promise.allSettled(ids.map(countClass));
    const counts = new Map<string, RosterCounts>();
    settled.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) counts.set(ids[i], r.value);
    });
    return { key, counts };
  }, [key]);
  const { data, loading } = useLiveQuery(run, [key]);
  // The answer for an EARLIER set of classes - the empty set, before the class
  // list arrived - is still loading for this one, not "couldn't count".
  const current = data !== null && data.key === key;
  return {
    counts: current ? data.counts : new Map(),
    loading: loading || (data !== null && !current),
  };
}
