"use client";

import { useEffect, useState } from "react";
import { studentsApi } from "@/lib/api/students";

/**
 * The note a teacher wrote on the assignment this lesson was opened from.
 *
 * **READ FROM THE CHILD'S OWN DASHBOARD, not from `/assignments`.** That list
 * is the teacher's - its own docblock says "every assignment the teacher can
 * see" - and a child asking it for their own row would be the wrong actor on
 * the wrong endpoint. `students/me/dashboard` already carries every assignment
 * with its `note`, and it is the read the child is entitled to make.
 *
 * **NOT CARRIED IN THE URL**, which was the other obvious route since
 * `assignmentId` already arrives as `?assignment=`. A teacher's sentence in a
 * query string is a private message in something a child can see, copy, share
 * and truncate.
 *
 * Returns null whenever there is nothing to show - no assignment, no note, a
 * note that is only whitespace, or a read that did not answer. A lesson opened
 * from the library has no assignment at all, which is the truth about it.
 *
 * **THE NAME IS SEPARATE FROM THE NOTE, and may be absent while the note is
 * not.** `assignedByName` is null when the account cannot be resolved, which
 * is backend honouring the same rule we do: naming the wrong teacher is worse
 * than naming none. So a null name is a note that stays unsigned, never a note
 * that is withheld.
 */
export interface TeacherNoteFromAssignment {
  text: string;
  /** Null when the account has no resolvable name. Not an error. */
  author: string | null;
}

export function useAssignmentNote(
  assignmentId?: string,
): TeacherNoteFromAssignment | null {
  const [note, setNote] = useState<TeacherNoteFromAssignment | null>(null);

  useEffect(() => {
    if (!assignmentId) return;

    let cancelled = false;
    void studentsApi
      .myDashboard()
      .then((dash) => {
        if (cancelled) return;
        const row = dash.assignments?.find((a) => a.id === assignmentId);
        const text = row?.note?.trim();
        if (!text) return;
        setNote({ text, author: row?.assignedByName?.trim() || null });
      })
      .catch(() => {
        /*
         * Silent, and deliberately not a placeholder. "Your teacher wrote
         * something we could not load" is a worse thing to tell a child than
         * nothing at all: it names a message they cannot read and cannot ask
         * for. The lesson is unaffected either way.
         */
      });

    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  return note;
}
