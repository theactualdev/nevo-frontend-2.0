"use client";

import { useCallback } from "react";
import { classesApi, type LearnerObservation } from "@/lib/api/classes";
import { OBSERVATION_COPY } from "@/lib/constants/observations";
import { useLiveQuery } from "./useLiveQuery";

/**
 * C08's "What Nevo has noticed", for one child, from the class roster.
 *
 * WHY THE ROSTER. `observations` arrive on `ClassStudentResponse` (`GET
 * /api/v1/classes/{id}/students`) and nowhere else - the profile read does not
 * carry them. The profile is reached from a roster row, which passes the class
 * it came from, so the same rows the roster draws its chips from answer this
 * too: the engine's own patterns, read from another route, nothing derived.
 *
 * NO CLASS, NO SECTION. A profile opened without a class (a link from
 * elsewhere) has nowhere to read them from, and the section is absent rather
 * than saying Nevo noticed nothing. The same goes for a failed read, and for a
 * child this class's roster does not list.
 *
 * Patterns outside the copy file are dropped, as the roster does: an unknown
 * enum value has no approved sentence, and printing the token is the bug that
 * file exists to prevent.
 */
export function useRosterObservations(
  classId: string | undefined,
  studentId: string,
): LearnerObservation[] {
  const run = useCallback(
    () =>
      classId ? classesApi.classStudents(classId) : Promise.resolve(null),
    [classId],
  );
  const { data } = useLiveQuery(run, [classId]);
  const row = data?.find((s) => s.studentId === studentId);
  return (row?.observations ?? []).filter((o) => OBSERVATION_COPY[o.pattern]);
}
