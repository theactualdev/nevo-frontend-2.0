"use client";

import { useCallback } from "react";
import type { Assignment } from "@/lib/api/assignments";
import {
  studentsApi,
  type DashboardProgressRow,
  type LearningWork,
  type StudentIdentity,
} from "@/lib/api/students";
import { useLiveQuery } from "./useLiveQuery";

/**
 * The student's landing data, from `GET /api/v1/students/me/dashboard`.
 *
 * One call carries all three of the Home screen's sections: identity,
 * assignments (with each lesson summary nested), and recent activity. The
 * response always wins however late it arrives - see `useLiveQuery`.
 */

export interface StudentDashboard {
  student: StudentIdentity;
  assignments: Assignment[];
  recentProgress: DashboardProgressRow[];
  /**
   * The engine's next work, a due review before new work; null until
   * onboarding is in. Home reads its review (SCRUM-75). See `LearningWork`.
   */
  nextWork?: LearningWork | null;
}

export function useStudentDashboard() {
  const run = useCallback(() => studentsApi.myDashboard(), []);
  return useLiveQuery<StudentDashboard>(run, []);
}
