"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { assignmentsApi, type Assignment } from "@/lib/api/assignments";
import {
  lessonsApi,
  type LessonClassProgress,
  type LessonDetailResponse,
  type LessonModule,
} from "@/lib/api/lessons";
import { getToken } from "@/lib/auth/session";
import { useHasSession } from "./useHasSession";

/**
 * One lesson: its parsed segments, plus who it has been given to.
 *
 * Three calls, because the contract splits them three ways.
 * `GET /api/content/lessons/{id}` has the segments and their review flags but
 * no modules; `GET /api/v1/lessons/{id}` has the modules but drops the review
 * flags; `GET /api/v1/assignments` has the assignments and cannot be filtered
 * by lesson. Only the first decides whether the page exists. The second is best-effort: a
 * lesson still reads perfectly well without knowing who has it, so a failed
 * assignment call leaves that section absent rather than failing the page.
 *
 * CLASS PROGRESS needs a class, and a lesson does not name one - so the
 * candidate classes are derived from the lesson's own assignments. A lesson
 * assigned only to individuals has no class to report on, and the progress
 * section is simply absent rather than guessing at one.
 *
 * TODO(design): a lesson assigned to SEVERAL classes reports on the first,
 * and the heading says so. C06b draws no class selector and this screen is
 * reached from the library rather than from a class, so which one a teacher
 * should see - and whether they can switch - is design's call, not a default
 * to invent here.
 *
 * `missing` distinguishes "no such lesson" from "could not load it" - the
 * first is a 404, the second is a retry, and showing one as the other tells a
 * teacher their lesson was deleted when it was not.
 */

export interface LessonDetailState {
  lesson: LessonDetailResponse | null;
  /** Distinct classes this lesson was assigned to, in assignment order. */
  /** Null while loading, or when there is no class to ask about. */
  progress: LessonClassProgress | null;
  /** How the parser grouped the segments; empty when it grouped none. */
  modules: LessonModule[];
  /** Assignments for this lesson; empty when none or when the call failed. */
  assignments: Assignment[];
  loading: boolean;
  /** The lesson does not exist. */
  missing: boolean;
  /** It exists as far as we know, but we could not load it. */
  failed: boolean;
}

export function useLessonDetail(lessonId: string): LessonDetailState {
  const [lesson, setLesson] = useState<LessonDetailResponse | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [modules, setModules] = useState<LessonModule[]>([]);
  const [progress, setProgress] = useState<LessonClassProgress | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const signedIn = useHasSession();
  const loading = signedIn && !lesson && !missing && !failed;

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;

    void lessonsApi
      .detail(lessonId)
      .then((res) => {
        if (!cancelled) setLesson(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setMissing(true);
        else setFailed(true);
      });

    // Best-effort: a lesson reads fine ungrouped.
    void lessonsApi
      .modules(lessonId)
      .then((m) => {
        if (!cancelled) {
          setModules([...m].sort((a, b) => a.sequenceOrder - b.sequenceOrder));
        }
      })
      .catch(() => {});

    // Best-effort: the page is worth showing without it.
    void assignmentsApi
      .list()
      .then((all) => {
        if (!cancelled) {
          setAssignments(all.filter((a) => a.lesson?.id === lessonId));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  // Progress follows whichever class is active. Best-effort like the other
  // enrichment: a lesson reads fine without it.
  useEffect(() => {
    const classId = assignments
      .map((a) => a.classId)
      .find((id): id is string => Boolean(id));
    if (!getToken() || !classId) return;
    let cancelled = false;
    void lessonsApi
      .classProgress(lessonId, classId)
      .then((res) => {
        if (!cancelled) setProgress(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lessonId, assignments]);

  /*
   * STILL DERIVED, NO LONGER RETURNED. The screen used to take this as a COUNT
   * of the classes a lesson went to - the only answer available, since it came
   * from listing every assignment the teacher can see and filtering by lesson.
   * `lesson.classes` carries the classes with their names now, so the count is
   * dead. What survives is the guard below: progress belongs to one class, and
   * the first assignment's class is the one this hook asked about.
   */
  const classIds = [
    ...new Set(
      assignments
        .map((a) => a.classId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  return {
    lesson,
    modules,
    assignments,
    // Guarded so a stale class's numbers never sit under a different lesson.
    progress: progress && progress.classId === classIds[0] ? progress : null,
    loading,
    missing,
    failed,
  };
}
