"use client";

import { useCallback } from "react";
import { escalationsApi } from "@/lib/api/escalations";
import { useLiveQuery } from "./useLiveQuery";

/**
 * Who is FLAGGED - raised by a person for learning support, and not yet
 * acknowledged - for one child or one class (backlog item 7; Hub, 3 Nov:
 * "Flagged counts OPEN escalations only").
 *
 * The SERVER does the scoping, `GET /api/v1/escalations?studentId=|classId=`
 * (live 4 Nov). A teacher who holds Learning Support would otherwise get the
 * whole school's list, and filtering that on the device is the line the T2/L9
 * ruling draws.
 *
 * `known` is false while the read is in flight, when it failed, or when it
 * stopped short. Then nobody here is Flagged, and a caller that counts says
 * nothing rather than a number over a list it does not have.
 */
export interface Escalated {
  students: ReadonlySet<string>;
  known: boolean;
}

export function useEscalated(
  filter: { studentId: string } | { classId: string },
): Escalated {
  const studentId = "studentId" in filter ? filter.studentId : undefined;
  const classId = "classId" in filter ? filter.classId : undefined;
  const run = useCallback(
    () =>
      escalationsApi.allOpen(10, studentId ? { studentId } : { classId }),
    [studentId, classId],
  );
  const { data } = useLiveQuery(run, [studentId, classId]);
  if (!data) return { students: new Set(), known: false };
  return {
    students: new Set(data.open.map((e) => e.studentId)),
    known: data.complete,
  };
}
