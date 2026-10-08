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
 * One lesson: its parsed segments and modules, plus who it has been given to.
 *
 * Two calls. `GET /api/content/lessons/{id}` carries the segments, their
 * review flags AND the modules - `modules` is in `LessonDetailResponse`'s
 * required list, the same schema both detail routes return. This used to make
 * a third call to `GET /api/v1/lessons/{id}` for the modules, on a docblock
 * that said the content route had none: the whole lesson read twice on every
 * open (T52). `GET /api/v1/assignments` has the assignments and cannot be
 * filtered by lesson. Only the lesson decides whether the page exists. The
 * assignments are best-effort: a lesson still reads perfectly well without knowing who has
 * it, so a failed assignment call does not fail the page - it raises
 * `assignmentsFailed`, and the page says it could not find out rather than
 * drawing a lesson nobody has been given.
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
  /**
   * The assignments read failed - so `[]` above means "we could not find
   * out", not "never assigned".
   *
   * Without this the two were one value, and a lesson assigned to a whole
   * class read as never assigned: no schedule to cancel or re-date, and
   * "Ready when you are... Assign it to a class" over it. Rule 5.
   */
  assignmentsFailed: boolean;
  loading: boolean;
  /** The lesson does not exist. */
  missing: boolean;
  /** It exists as far as we know, but we could not load it. */
  failed: boolean;
}

export function useLessonDetail(lessonId: string): LessonDetailState {
  const [lesson, setLesson] = useState<LessonDetailResponse | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentsFailed, setAssignmentsFailed] = useState(false);
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
        if (cancelled) return;
        setLesson(res);
        // Optional on the type: required today, absent on an older deployment.
        setModules(
          [...(res.modules ?? [])].sort((a, b) => a.sequenceOrder - b.sequenceOrder),
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        /*
         * A 422 IS NOT-FOUND TOO. The id is a uuid, and the spec answers a
         * malformed one with 422 - which read as "we couldn't load this
         * lesson, try again", a retry that can never succeed. Only a lesson
         * that could exist is worth another go.
         */
        if (
          err instanceof ApiError &&
          (err.status === 404 || err.status === 422)
        ) {
          setMissing(true);
        } else setFailed(true);
      });

    // Best-effort: the page is worth showing without it.
    void assignmentsApi
      .list()
      .then((all) => {
        if (!cancelled) {
          setAssignments(all.filter((a) => a.lesson?.id === lessonId));
        }
      })
      .catch(() => {
        if (!cancelled) setAssignmentsFailed(true);
      });

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
    assignmentsFailed,
    // Guarded so a stale class's numbers never sit under a different lesson.
    progress: progress && progress.classId === classIds[0] ? progress : null,
    loading,
    missing,
    failed,
  };
}
