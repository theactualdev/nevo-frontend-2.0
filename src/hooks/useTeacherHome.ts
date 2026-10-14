"use client";

import { useCallback } from "react";
import {
  teacherHomeApi,
  type ActivityRow,
  type ClassPulseRow,
  type TeacherHomeIntelligence,
} from "@/lib/api/teacherHome";
import { useLiveQuery } from "./useLiveQuery";

/**
 * Home's activity list, and each class's headcount from the same read.
 *
 * THE CLASS PULSE IS NOT READ. The endpoint returns `engagement`,
 * `comprehension` and `focus` as bare numbers, and C16a's tiles must say
 * something a teacher can act on. Turning the numbers into words meant cutoffs
 * of our own: first "Strong / Steady / Building" (out, design 10 Sep), then
 * "Above 75%", "50 to 75%" and "Below 50%" (accepted for launch, design
 * 17 Sep). Lydia ruled on 13 Oct that both are out: no invented band, no
 * computed share, and nothing replaces them until backend sends its own
 * words. "If backend sends nothing usable, the group shows nothing rather than
 * a placeholder." So the three numbers are not read at all, and Home draws no
 * pulse. Asked of backend: the engine's own words for each group.
 *
 * `studentCount` still is: it is a count, not a judgement, and My Classes
 * shows it.
 */

export interface ClassPulse {
  classId: string;
  className: string;
  studentCount: number;
}

export interface HomeActivity {
  id: string;
  title: string;
  detail: string;
  when: string;
  /** Only set when `actionTarget` is an in-app path we can actually open. */
  href: string | null;
  /**
   * How far the class got, when the server said. Both nullable on the wire, so
   * a row must still render without them - which is why this is a pair of
   * separate values rather than a formatted "3 of 28" string. Frontend section
   * 6: "values that may be null render as separate elements that disappear when
   * absent."
   */
  completedCount: number | null;
  totalCount: number | null;
}

/** Exported for its test: it is what keeps the engine's numbers off screen. */
export const __toPulseForTest = (row: ClassPulseRow) => toPulse(row);
/**
 * Exported for its test.
 *
 * The mapper is where `completedCount` and `totalCount` were being dropped -
 * they were absent from `ActivityRow`, so the poll discarded them before any
 * component could ask. A component test cannot see that: it mocks this hook,
 * so the mapper never runs. A mutation run proved it - deleting the
 * passthrough failed nothing at the component level, and fails three tests
 * here.
 */
export const __toActivityForTest = (row: Parameters<typeof toActivity>[0]) =>
  toActivity(row);

function toPulse(row: ClassPulseRow): ClassPulse {
  return {
    classId: row.classId,
    className: row.className,
    studentCount: row.studentCount,
  };
}

function when(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return "just now";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
}

function toActivity(row: ActivityRow): HomeActivity {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail,
    when: when(row.occurredAt),
    // An absolute URL or an opaque token is not something this app can open,
    // and a row that navigates nowhere is worse than one that does not offer.
    href: row.actionTarget?.startsWith("/") ? row.actionTarget : null,
    // Passed through, never defaulted to 0. "We were not told" and "none of
    // them" are different facts about a class's week.
    completedCount: row.completedCount ?? null,
    totalCount: row.totalCount ?? null,
  };
}

export interface TeacherHomeState {
  pulse: ClassPulse[];
  activity: HomeActivity[];
  live: boolean;
  failed: boolean;
  loading: boolean;
}

export function useTeacherHome(): TeacherHomeState {
  const run = useCallback(() => teacherHomeApi.read(), []);
  const { data, failed, loading } = useLiveQuery<TeacherHomeIntelligence>(
    run,
    [],
  );
  return {
    pulse: (data?.classLearningPulse ?? []).map(toPulse),
    activity: (data?.recentActivity ?? []).map(toActivity),
    live: data !== null,
    failed,
    loading,
  };
}
