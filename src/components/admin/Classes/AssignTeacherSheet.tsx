"use client";

import { useCallback, useEffect, useState } from "react";
import type { AssignedTeacher, TeacherAssignmentRole } from "@/lib/api/classes";
import { teachersApi, type TeacherSummary } from "@/lib/api/teachers";
import { ReadFailed } from "../ReadFailed";
import { Sheet } from "../Roster/primitives";
import {
  ASSIGN_HINT,
  ASSIGN_LABEL,
  ASSIGN_SELECT,
  AssignFooter,
  PrimaryConflictNotice,
  RoleField,
  assignedName,
  useAssignment,
} from "./assignParts";

/**
 * D5c Teacher-class assignment - the many-to-many join.
 *
 * SCRUM-40 calls this the highest-risk interaction in the ticket, and says why:
 * a mis-assignment sends a teacher into the wrong students' console. So every
 * commit states its consequence in plain words BEFORE it happens, which is
 * what the primary-conflict notice below is for.
 *
 * Exactly one teacher per class is Primary. Choosing Primary where one already
 * exists demotes the incumbent, so the notice names them and the commit label
 * changes to say what the button will actually do. Not a modal, not a blocker -
 * the admin is allowed to mean it.
 *
 * This sheet is the one on CLASS DETAIL, which the spec names as the primary
 * flow. Teacher detail mirrors it (`Teachers/AssignClassSheet`) with the same
 * role cards and identical wording, both built from `assignParts`; where the
 * two would diverge, class detail wins.
 *
 * TODO(api): `POST /api/v1/teacher-class-assignments` creates a row and
 * nothing more. The contract documents no demotion, no one-primary-per-class
 * rule (`TeacherAssignmentRole` is a bare enum) and no 409, so a plain create
 * with `role: "primary"` can leave a class with two primaries. The notice is
 * honoured client-side instead - see `useAssignment` - in TWO CALLS, NOT ONE
 * TRANSACTION. A transaction is still the right ask of backend, and is still
 * the only way to close the window between them.
 */

export function AssignTeacherSheet({
  classId,
  className,
  classSubtitle,
  assigned,
  onClose,
  onAssigned,
}: {
  classId: string;
  className: string;
  /** "Year 8" etc, for the sheet's second line. */
  classSubtitle: string | null;
  /** Who already teaches this class - drives the primary-conflict notice. */
  assigned: AssignedTeacher[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [teachers, setTeachers] = useState<TeacherSummary[]>([]);
  /*
   * THREE STATES, NOT TWO.
   *
   * `teachers: []` and `teachersFailed: false` are also the values on FIRST
   * RENDER, before the GET has answered - so the sheet spent every request
   * telling a school with forty teachers "No staff to assign yet. Invite a
   * teacher first". The previous fix replaced an inert wrong sentence with an
   * actionable wrong one; the hole underneath was that an UNANSWERED read
   * licenses a claim about the staff no more than a failed one does.
   */
  const [read, setRead] = useState<"loading" | "ready" | "failed">("loading");
  const [teacherId, setTeacherId] = useState("");
  const [role, setRole] = useState<TeacherAssignmentRole | null>(null);
  const { phase, assign, retryKeep } = useAssignment(onAssigned);

  const loadTeachers = useCallback(() => {
    teachersApi
      .list()
      .then((rows) => {
        setTeachers(rows);
        setRead("ready");
      })
      .catch(() => {
        // "Everyone on staff already teaches this class" is a claim about the
        // school's staff, and a failed GET does not license it.
        setTeachers([]);
        setRead("failed");
      });
  }, []);

  /** Pressing Try again must visibly do something, even if it fails again. */
  const retryTeachers = () => {
    setRead("loading");
    loadTeachers();
  };

  useEffect(() => {
    loadTeachers();
  }, [loadTeachers]);

  // Somebody already assigned cannot be assigned again from here; the row's own
  // "Remove from this class" is how a role changes.
  const assignable = teachers.filter(
    (t) => !assigned.some((a) => a.teacherId === t.id),
  );

  const currentPrimary = assigned.find((a) => a.role === "primary");
  const primaryConflict = role === "primary" && Boolean(currentPrimary);
  const primaryName = currentPrimary ? assignedName(currentPrimary) : null;

  const chosen = assignable.find((t) => t.id === teacherId);
  const ready = Boolean(teacherId && role);

  const submit = () => {
    if (!ready || !role) return;
    assign({ classId, teacherId, role, incumbent: currentPrimary });
  };

  return (
    <Sheet
      busy={phase === "assigning"}
      title="Assign a teacher"
      subtitle={
        classSubtitle ? `to ${className} · ${classSubtitle}` : `to ${className}`
      }
      onClose={onClose}
      footer={
        <AssignFooter
          phase={phase}
          ready={ready}
          primaryConflict={primaryConflict}
          teacherName={chosen?.name}
          className={className}
          primaryName={primaryName}
          onSubmit={submit}
          onRetryKeep={retryKeep}
          onClose={onClose}
          onAssigned={onAssigned}
        />
      }
    >
      <div>
        <label htmlFor="assign-teacher" className={ASSIGN_LABEL}>
          Teacher
        </label>
        <select
          id="assign-teacher"
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          className={ASSIGN_SELECT}
        >
          <option value="">Choose a teacher</option>
          {assignable.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {/*
         * THREE DIFFERENT THINGS, and all three used to say the same sentence.
         *
         * A school that has not invited any staff yet is the FIRST-RUN state -
         * the Classes screen's own empty state tells them to "Create your
         * first class, then assign a teacher", so they arrive here with an
         * empty roster by design and were told everyone already teaches it.
         */}
        {read === "loading" ? (
          /* Nothing is known yet, so nothing is said. */
          <p className="mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/45">
            Looking up your staff&hellip;
          </p>
        ) : read === "failed" ? (
          <ReadFailed
            className="mt-2"
            what="your staff list"
            onRetry={retryTeachers}
          />
        ) : teachers.length === 0 ? (
          <p className={ASSIGN_HINT}>
            No staff to assign yet. Invite a teacher first, and they&rsquo;ll
            appear here.
          </p>
        ) : assignable.length === 0 ? (
          <p className={ASSIGN_HINT}>
            Everyone on staff already teaches this class.
          </p>
        ) : null}
      </div>

      <RoleField role={role} onChange={setRole} />

      {primaryConflict && primaryName ? (
        <PrimaryConflictNotice
          primaryName={primaryName}
          className={className}
          teacherName={chosen?.name}
        />
      ) : null}
    </Sheet>
  );
}
