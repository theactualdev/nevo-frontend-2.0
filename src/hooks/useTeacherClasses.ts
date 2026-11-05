"use client";

import { useCallback } from "react";
import { classesApi, type AssignedClass } from "@/lib/api";
import { classesOnce } from "@/lib/classes/classesOnce";
import { TEACHER_CLASSES, type TeacherClass } from "@/lib/mocks/teacherClasses";
import { useLiveQuery } from "./useLiveQuery";

/**
 * The teacher's class list, live-first: GET /api/v1/teachers/me/classes when
 * a session exists, the design fixtures otherwise.
 *
 * NO NAME MATCHING. This hook used to pair a live class with a fixture of the
 * same name and hand back the fixture - roster, lessons, observations and all -
 * with only the join code replaced. That was defensible while no roster
 * endpoint existed and indefensible the moment one did: the demo school's real
 * class is called "JSS 2A", which is also a fixture name, so a real teacher
 * opening their own class was shown six invented children, complete with seat
 * numbers, as though they were their students.
 *
 * So a live class is now only ever itself. Fixtures back the designed screens
 * when there is no live data at all, and never stand in for a real class.
 *
 * A response always wins, however late - see `useLiveQuery`. Only a genuine
 * failure raises `sample`, which is the one honest reason to put fixtures on
 * screen.
 */

/** Id, name and code - all any picker or selector actually needs. */
export interface ClassOption {
  id: string;
  name: string;
  joinCode: string | null;
  /**
   * Fixture-only. The live class list carries neither a headcount nor a
   * roster, and a picker must say "we don't know" rather than borrow a
   * number. `GET /api/v1/classes/{id}/students` has both, per class - see
   * `useClassRoster` - but that is a fetch per class and belongs to the
   * screen that needs it.
   */
  studentCount?: number;
  roster?: { name: string }[];
}

export interface TeacherClasses {
  /** Fixture classes, for the designed screens. Empty once live data lands. */
  classes: TeacherClass[];
  /**
   * The teacher's real assignments. Empty until they do. One per class AND
   * SUBJECT, so a class can appear more than once - anything that lists
   * classes folds them with `classesOnce`.
   */
  liveClasses: AssignedClass[];
  /** Whichever of the two is real right now, one row per class, for pickers. */
  options: ClassOption[];
  /** Live data is in hand. */
  live: boolean;
  /**
   * The read is still in flight. DISTINCT from `sample`: `data === null`
   * covers both "not back yet" and "never coming", and only the second is a
   * reason to show anything other than a skeleton. Without this, every
   * consumer rendered fixture classes for the whole in-flight window - which
   * the backend's own 1.0-5.6s range makes seconds long on every load.
   */
  loading: boolean;
  /** A session exists but the live list never arrived - fixtures stand in. */
  sample: boolean;
}

export function useTeacherClasses(): TeacherClasses {
  const run = useCallback(() => classesApi.myClasses(), []);
  const { data, failed, loading } = useLiveQuery<AssignedClass[]>(run, []);

  if (data === null) {
    return {
      classes: TEACHER_CLASSES,
      liveClasses: [],
      options: TEACHER_CLASSES.map((c) => ({
        id: c.id,
        name: c.name,
        joinCode: c.joinCode,
        studentCount: c.count,
        roster: c.roster.map((r) => ({ name: r.name })),
      })),
      live: false,
      sample: failed,
      loading,
    };
  }

  return {
    classes: [],
    liveClasses: data,
    // One row per class: a class taught for two subjects was in every picker twice.
    options: classesOnce(data).map((c) => ({
      id: c.classId,
      name: c.className,
      joinCode: c.classCode,
    })),
    live: true,
    sample: false,
    loading: false,
  };
}
