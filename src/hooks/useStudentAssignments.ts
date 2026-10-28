"use client";

import { useCallback, useEffect } from "react";
import { assignmentsApi, type Assignment } from "@/lib/api/assignments";
import { onHeldProgressLanded } from "@/lib/lessons/pendingProgress";
import { useLiveQuery } from "./useLiveQuery";

/**
 * EVERY ASSIGNMENT THIS CHILD HAS, FINISHED ONES INCLUDED, from
 * `GET /api/v1/assignments`.
 *
 * The dashboard leaves completed assignments out (`due = [... != "completed"]`
 * in the backend's `student_dashboard`), so a child whose only lesson was
 * finished had no assignments at all as far as Home and the Lessons tab could
 * tell: Home said "Your teacher is setting up your first lesson" and the tab
 * "Your lessons will show up here soon" (22 Oct production run, Amina on
 * Osmosis). For a student this route is scoped to their own assignments and
 * returns all of them - completed and cancelled too - except one that has not
 * opened yet, each with the same nested lesson summary as the dashboard's.
 *
 * One read per screen, the same way the dashboard is read: Home and the
 * Lessons tab each call this once and nothing else on either calls it, so it
 * is never fetched twice for one screen. `useLiveQuery` keeps no cache across
 * screens, as with the dashboard.
 *
 * Only ever a supplement to the dashboard. While it loads, or when it fails,
 * the screens draw from the dashboard as they did before it existed.
 *
 * Read again when held progress lands, as the dashboard is: a held completion
 * finishes its assignment too. See `onHeldProgressLanded`.
 */
export function useStudentAssignments() {
  const run = useCallback(() => assignmentsApi.list(), []);
  const query = useLiveQuery<Assignment[]>(run, []);
  const { refresh } = query;
  useEffect(() => onHeldProgressLanded(refresh), [refresh]);
  return query;
}
