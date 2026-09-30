"use client";

import { useRef, useState } from "react";
import {
  classesApi,
  type AdminClass,
  type AssignedClass,
  type AssignedTeacher,
  type TeacherAssignmentRole,
} from "@/lib/api/classes";
import { yearGroupLabel } from "@/lib/constants/yearGroups";
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
} from "../Classes/assignParts";

/**
 * D5c from the other door: assign THIS teacher to a class.
 *
 * SCRUM-40: "The same assignment can be made from either class or teacher
 * detail with identical copy." Teacher detail used to offer only a link back
 * to Classes. This is the class-detail sheet turned round - the teacher is
 * fixed and the class is chosen - with the role cards, the conflict notice and
 * every footer state taken from `Classes/assignParts`, so the two doors cannot
 * word the same write differently.
 *
 * THE ONE THING THIS SIDE HAS TO FETCH. On class detail the sheet already
 * knows who teaches the class; here it does not until a class is chosen. The
 * primary-conflict notice is the whole safety of this interaction - it names
 * who is about to be demoted, before the commit - so the commit stays disabled
 * until that class's teachers have been read. A failed read offers a retry,
 * not a guess: assigning a Primary blind is how a class ends up with two.
 */

type ClassRead =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; teachers: AssignedTeacher[] }
  | { state: "failed" };

export function AssignClassSheet({
  teacher,
  classes,
  held,
  onClose,
  onAssigned,
}: {
  teacher: { id: string; name: string };
  /** Every class in the school, archived ones included. */
  classes: AdminClass[];
  /** What this teacher already holds - those classes are not offered again. */
  held: AssignedClass[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [classId, setClassId] = useState("");
  const [role, setRole] = useState<TeacherAssignmentRole | null>(null);
  const [read, setRead] = useState<ClassRead>({ state: "idle" });
  const { phase, assign, retryKeep } = useAssignment(onAssigned);
  /** A quick change of mind must not let the first class's answer land late. */
  const latest = useRef("");

  /*
   * The same classes class detail offers "Assign a teacher" on: not archived,
   * and not synced from a connected roster, whose membership is managed there.
   */
  const assignable = classes.filter(
    (c) =>
      !c.archivedAt &&
      c.source !== "roster_sync" &&
      !held.some((h) => h.classId === c.id),
  );

  const readTeachers = (id: string) => {
    latest.current = id;
    if (!id) {
      setRead({ state: "idle" });
      return;
    }
    setRead({ state: "loading" });
    classesApi
      .classTeachers(id)
      .then((teachers) => {
        if (latest.current === id) setRead({ state: "ready", teachers });
      })
      .catch(() => {
        if (latest.current === id) setRead({ state: "failed" });
      });
  };

  const chosen = assignable.find((c) => c.id === classId);
  const assigned = read.state === "ready" ? read.teachers : [];
  const currentPrimary = assigned.find((a) => a.role === "primary");
  const primaryConflict = role === "primary" && Boolean(currentPrimary);
  const primaryName = currentPrimary ? assignedName(currentPrimary) : null;
  const ready = Boolean(classId && role && read.state === "ready");

  const submit = () => {
    if (!ready || !role) return;
    assign({ classId, teacherId: teacher.id, role, incumbent: currentPrimary });
  };

  const year = chosen ? yearGroupLabel(chosen.yearGroup) : null;

  return (
    <Sheet
      busy={phase === "assigning"}
      title={`Assign ${teacher.name}`}
      subtitle={
        chosen ? (year ? `to ${chosen.name} · ${year}` : `to ${chosen.name}`) : "to a class"
      }
      onClose={onClose}
      footer={
        <AssignFooter
          phase={phase}
          ready={ready}
          primaryConflict={primaryConflict}
          teacherName={teacher.name}
          className={chosen?.name}
          primaryName={primaryName}
          onSubmit={submit}
          onRetryKeep={retryKeep}
          onClose={onClose}
          onAssigned={onAssigned}
        />
      }
    >
      <div>
        <label htmlFor="assign-class" className={ASSIGN_LABEL}>
          Class
        </label>
        <select
          id="assign-class"
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            readTeachers(e.target.value);
          }}
          className={ASSIGN_SELECT}
        >
          <option value="">Choose a class</option>
          {assignable.map((c) => {
            const y = yearGroupLabel(c.yearGroup);
            return (
              <option key={c.id} value={c.id}>
                {y ? `${c.name} · ${y}` : c.name}
              </option>
            );
          })}
        </select>
        {classes.filter((c) => !c.archivedAt).length === 0 ? (
          <p className={ASSIGN_HINT}>
            No classes to assign yet. Create a class first, and it&rsquo;ll
            appear here.
          </p>
        ) : assignable.length === 0 ? (
          <p className={ASSIGN_HINT}>
            {teacher.name} already teaches every class they can be assigned to.
          </p>
        ) : read.state === "loading" ? (
          /* Nothing is known yet, so nothing is said. */
          <p className="mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/45">
            Looking up who teaches it&hellip;
          </p>
        ) : read.state === "failed" ? (
          <ReadFailed
            className="mt-2"
            what="who teaches this class"
            onRetry={() => readTeachers(classId)}
          />
        ) : null}
      </div>

      <RoleField role={role} onChange={setRole} />

      {primaryConflict && primaryName && chosen ? (
        <PrimaryConflictNotice
          primaryName={primaryName}
          className={chosen.name}
          teacherName={teacher.name}
        />
      ) : null}
    </Sheet>
  );
}
