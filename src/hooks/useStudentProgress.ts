"use client";

import { useCallback, useMemo } from "react";
import { studentsApi, type StudentProgress } from "@/lib/api/students";
import { getSession } from "@/lib/auth/session";
import { useLiveQuery } from "./useLiveQuery";

/**
 * The student's own progress, from `GET /api/students/{id}/progress`.
 *
 * THIS ENDPOINT WAS THERE ALL ALONG. The audit recorded Progress as having no
 * backend whatsoever - "no growth summary, per-subject prose, a timeline or
 * session history, and none planned" - and on that basis the tab was gated to
 * an empty state for signed-in children. That was wrong: the route returns
 * per-subject mastery, per-concept understanding and reading scores, and a
 * lesson history with timestamps. `studentsApi.progress` was already typed and
 * already in use by the teacher console.
 *
 * THE PROSE ARRIVED ON 3 SEP. `reflection` and `highlights` are backend-
 * authored, required in the contract, and written in deliberately non-
 * diagnostic language for the child to read. They are rendered as given -
 * never summarised, reworded or composed from a number here. The whole-student
 * read's `reflection` is about all of a child's learning and belongs on the
 * tab; the subject screen reads its own from the narrowed route, see
 * `useSubjectProgress`. The per-card note ("Getting faster at solving
 * problems") still has no field.
 *
 * AND NO NUMBERS REACH THE SCREEN. Screen 22 is explicit - no percentile, no
 * score, no comparison, only direction of travel - so `understanding` and
 * `masteryAverage` order and select what to show, and never appear. What a
 * child reads is which subjects they have worked in and which concepts they
 * have touched, both of which are facts rather than judgements.
 */

export interface ConceptRow {
  conceptId: string;
  name: string;
  /** 0-1. Orders the list; never rendered. */
  understanding: number;
  practiceCount: number;
}

export interface SubjectProgress {
  /** URL segment for the name - the contract has no slug of its own. */
  slug: string;
  name: string;
  concepts: ConceptRow[];
}

export interface StudentProgressState {
  subjects: SubjectProgress[];
  /** Lesson history, newest first. */
  lessons: StudentProgress["lessons"];
  /**
   * The backend's reflection on the child's learning as a whole. Null until
   * read; the contract requires it, so a successful read always carries one.
   */
  reflection: string | null;
  /**
   * Backend-authored highlights. Typed and carried, NOT yet placed: neither
   * Progress screen has a designed slot for a list of them, and inventing one
   * is design's call. Flagged.
   */
  highlights: string[];
  loading: boolean;
  failed: boolean;
  /** Signed in and read - fixtures must not show. */
  live: boolean;
}

/**
 * The subject's own name, as one URL path segment.
 *
 * It was lowercased with everything outside a-z0-9 turned into "-", which
 * broke both ways at once: "Yorùbá" became "yor-b-", and two subjects that
 * differ only in case - grouped apart, exactly, above - shared one link, so
 * one card always opened the other's page. The name is the only identity the
 * contract gives a subject, so the link carries it whole.
 */
export function subjectSlug(name: string): string {
  return encodeURIComponent(name.trim());
}

/**
 * The subject name a route segment stands for. Next may hand the segment over
 * decoded or not, so this decodes defensively; a lone "%" in a real name is
 * kept as written rather than throwing.
 */
export function subjectFromSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

/**
 * One read for the whole tab AND the subject screens.
 *
 * `GET .../progress/{subject}` exists and returns the same shape narrowed, but
 * the unnarrowed response already carries every concept with its own subject -
 * so the detail screen filters what it has rather than making a second call
 * for a subset of the first.
 */
export function useStudentProgress(): StudentProgressState {
  const studentId = getSession()?.userId;
  const run = useCallback(() => studentsApi.progress(studentId!), [studentId]);
  const { data, failed, loading } = useLiveQuery<StudentProgress>(run, [
    studentId,
  ]);

  const subjects = useMemo<SubjectProgress[]>(() => {
    if (!data) return [];
    // The contract carries a subject per CONCEPT, not a subject list, so the
    // grouping is ours. A concept with no subject is dropped rather than
    // collected under an invented heading.
    const bySubject = new Map<string, ConceptRow[]>();
    for (const c of data.concepts) {
      const name = c.subject?.trim();
      if (!name) continue;
      const list = bySubject.get(name) ?? [];
      list.push({
        conceptId: c.conceptId,
        name: c.name,
        understanding: c.understanding,
        practiceCount: c.practiceCount,
      });
      bySubject.set(name, list);
    }
    return [...bySubject.entries()].map(([name, concepts]) => ({
      slug: subjectSlug(name),
      name,
      // Most-practised first: what they have spent time on leads.
      concepts: concepts.sort((a, b) => b.practiceCount - a.practiceCount),
    }));
  }, [data]);

  const lessons = useMemo(
    () =>
      data
        ? [...data.lessons].sort(
            (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
          )
        : [],
    [data],
  );

  return {
    subjects,
    lessons,
    reflection: data?.reflection ?? null,
    highlights: data?.highlights ?? [],
    loading: Boolean(studentId) && loading,
    failed,
    live: Boolean(data),
  };
}
