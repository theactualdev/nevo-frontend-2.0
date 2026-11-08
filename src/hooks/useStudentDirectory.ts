"use client";

import { useEffect, useState } from "react";
import { classesApi, type ClassStudent } from "@/lib/api/classes";
import { getToken } from "@/lib/auth/session";
import { classesOnce } from "@/lib/classes/classesOnce";
import { useHasSession } from "./useHasSession";
import { studentName } from "./useClassRoster";
import type { AvatarLook } from "@/lib/profile/avatarLook";
import { lookOfChild } from "@/lib/profile/rosterLook";

/**
 * Every student the teacher can actually write to, across their classes.
 *
 * There is no "my students" endpoint, so this is the class list joined to each
 * class's roster - one call, then one per class. A teacher has a handful of
 * classes, so that is a handful of requests, and the alternative is a compose
 * screen listing invented children.
 *
 * A class whose roster fails contributes nothing rather than failing the whole
 * directory: a partial list of real students beats no list.
 *
 * TODO(api): a single roster-wide read would replace this fan-out.
 */


export interface DirectoryStudent {
  studentId: string;
  name: string;
  /**
   * The avatar the child chose, read off their class roster row (SCRUM-317).
   * Teacher screens draw this beside the child's name - never their initials.
   */
  look: AvatarLook;
  /** The class this child was read from, so a link can carry it (C08's back link). */
  classId: string;
  className: string;
}

export interface StudentDirectory {
  students: DirectoryStudent[];
  loading: boolean;
  /**
   * At least one roster read failed. An empty directory then means "we could
   * not find out", not "these classes have no students" - and on the compose
   * picker those are different sentences to a teacher.
   */
  failed: boolean;
}

function toDirectory(classId: string, className: string, roster: ClassStudent[]) {
  return roster.map((s) => ({
    studentId: s.studentId,
    name: studentName(s),
    look: lookOfChild(s),
    classId,
    className,
  }));
}

export function useStudentDirectory(): StudentDirectory {
  const [students, setStudents] = useState<DirectoryStudent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const signedIn = useHasSession();
  const loading = signedIn && students === null;

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        // Once per CLASS: a class taught for two subjects is two assignments,
        // and reading it twice listed each of its children twice.
        const classes = classesOnce(await classesApi.myClasses());
        const settled = await Promise.allSettled(
          /*
           * EVERY CLASS. This took the first 12 and dropped the rest without
           * a word, so a teacher with a thirteenth class could not find its
           * children in compose or assign - and nothing said they were missing.
           * A teacher's own classes are the whole point of this list.
           */
          classes
            .map((c) =>
              classesApi
                .classStudents(c.classId)
                .then((roster) => toDirectory(c.classId, c.className, roster)),
            ),
        );
        if (cancelled) return;
        const rosters = settled.map((r) =>
          r.status === "fulfilled" ? r.value : [],
        );
        setStudents(rosters.flat());
        setFailed(settled.some((r) => r.status === "rejected"));
      } catch {
        if (!cancelled) {
          setStudents([]);
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { students: students ?? [], loading, failed };
}
