"use client";

import { useCallback } from "react";
import { studentsApi, type LessonProgress } from "@/lib/api/students";
import { getSession } from "@/lib/auth/session";
import { useLiveQuery } from "./useLiveQuery";

/**
 * One subject's own reflection, from
 * `GET /api/students/{id}/progress/{subject}`.
 *
 * `useStudentProgress` reads the whole student once and lets Subject Detail
 * filter its concepts and lessons out of that. That was the right call while
 * the narrowed route only returned a subset of the same rows. It stopped being
 * enough on 3 Sep, when the backend began writing `reflection`: the
 * whole-student read carries a reflection about ALL of a child's learning, and
 * putting that under one subject's heading would present a sentence about
 * everything as a sentence about maths. Only the narrowed read carries the
 * subject-scoped one - so this hook makes that one extra call for that one
 * field, and nothing else moves.
 *
 * The result is stamped with the subject it answers for and only exposed
 * against a matching ask. Navigating between subjects remounts the page, but
 * nothing here relies on that.
 */

interface SubjectSnapshot {
  /** Null when there was nothing to ask for yet. */
  subject: string | null;
  reflection: string | null;
  note: string | null;
  lessons: LessonProgress[];
  topics: SubjectTopics | null;
  currentTopic: string | null;
}

/**
 * The Progress card's topic counts (backend B53, 5 Oct), as the response
 * states them and never recomputed. COUNTS, NOT SCORES: how many topics the
 * engine treats as learned, of how many this child has met. The engine owns
 * the threshold that makes one "done"; nothing here decides it.
 */
export interface SubjectTopics {
  done: number;
  /** Topics this child HAS MET - not the curriculum, which they have not. */
  total: number;
}

/**
 * Null is the nothing-state (rule 5): a total of 0 is the schema's default
 * and means "not said", and a pair that contradicts itself is not drawn as
 * whatever it is closest to.
 */
export function topicsFrom(res: {
  topicsDone?: number | null;
  topicsTotal?: number | null;
}): SubjectTopics | null {
  const done = res.topicsDone;
  const total = res.topicsTotal;
  if (
    typeof done !== "number" ||
    typeof total !== "number" ||
    !Number.isInteger(done) ||
    !Number.isInteger(total) ||
    total <= 0 ||
    done < 0 ||
    done > total
  ) {
    return null;
  }
  return { done, total };
}

export interface SubjectProgressState {
  /** The subject's own reflection; null until read. */
  reflection: string | null;
  /**
   * The subject's short note for its Progress card (backend B29, 1 Oct).
   * Null until read, and null when the backend wrote none - the contract's
   * empty string is "no note", never a line to draw.
   */
  note: string | null;
  /**
   * The lessons THIS SUBJECT's history, which is the only place they exist.
   *
   * Subject Detail used to list `useStudentProgress().lessons` - the whole
   * student's history - under one subject's heading. Invisible while a library
   * held one lesson and plainly wrong once it held several: a child looking at
   * Maths was shown the English they had done.
   *
   * It cannot be filtered client-side, because `LessonProgress` carries no
   * subject. The narrowed route is the only source, and it was already being
   * called - for `reflection` alone, with its lessons discarded.
   *
   * Empty until read, and empty when the read fails. An empty list renders no
   * lesson section at all, which is the honest nothing-state: a list of other
   * subjects' lessons under this heading is a false claim about what the child
   * did here.
   */
  lessons: LessonProgress[];
  /** This subject's topic counts (B53); null until read, or not said. */
  topics: SubjectTopics | null;
  /**
   * The unfinished topic with the most practice behind it (B53) - the
   * backend's choice, not the first alphabetically. Its own field rather than
   * part of `topics`, so it stands or falls alone: null until read, and null
   * for the contract's "" default.
   */
  currentTopic: string | null;
  loading: boolean;
  failed: boolean;
}

export function useSubjectProgress(
  /** The backend's name for the subject, as carried on its concept rows. */
  subject: string | null,
): SubjectProgressState {
  const studentId = getSession()?.userId;

  const run = useCallback(async (): Promise<SubjectSnapshot> => {
    // `useLiveQuery` has no "enabled" switch, so an unknown subject resolves
    // to an empty snapshot rather than a request with nothing in the path.
    if (!subject) {
      return {
        subject: null,
        reflection: null,
        note: null,
        lessons: [],
        topics: null,
        currentTopic: null,
      };
    }
    const res = await studentsApi.subjectProgress(studentId!, subject);
    return {
      subject,
      reflection: res.reflection,
      note: res.note?.trim() || null,
      lessons: res.lessons ?? [],
      topics: topicsFrom(res),
      currentTopic: res.currentTopic?.trim() || null,
    };
  }, [studentId, subject]);

  const { data, failed, loading } = useLiveQuery<SubjectSnapshot>(run, [
    studentId,
    subject,
  ]);

  /*
   * Only exposed against a MATCHING ask, exactly as the reflection already
   * was. The response names the subject it answers for, so this is the
   * response's own claim about its scope rather than an assumption about the
   * route - and it is what stops a stale answer for Maths being shown under
   * English while the second request is still in flight.
   */
  const forThisSubject = Boolean(data && data.subject === subject);

  return {
    reflection: forThisSubject ? (data?.reflection ?? null) : null,
    note: forThisSubject ? (data?.note ?? null) : null,
    lessons: forThisSubject ? (data?.lessons ?? []) : [],
    topics: forThisSubject ? (data?.topics ?? null) : null,
    currentTopic: forThisSubject ? (data?.currentTopic ?? null) : null,
    loading: Boolean(studentId && subject) && loading,
    failed,
  };
}
