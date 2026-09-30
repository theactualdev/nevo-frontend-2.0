"use client";

import { useRef, useState } from "react";
import {
  classesApi,
  type AssignedTeacher,
  type TeacherAssignmentRole,
} from "@/lib/api/classes";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  FailureLine,
  GHOST_BTN,
  PRIMARY_BTN,
  Spinner,
} from "../Roster/primitives";

/**
 * The parts of D5c's assign sheet that both doors share.
 *
 * SCRUM-40: "Teacher detail mirrors the same pattern with the same sheet, the
 * same role cards and identical wording, so the second door is a mirror rather
 * than a variant." The role cards, the primary-conflict notice, the footer's
 * states and the two-call primary hand-over live here ONCE, so the class-side
 * sheet and the teacher-side sheet cannot drift into saying different things
 * about the same write. Only the picker differs: a teacher for a class, or a
 * class for a teacher.
 */

export const ASSIGN_LABEL =
  "mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60";

export const ASSIGN_SELECT =
  "h-[50px] w-full cursor-pointer rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-[15px] text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy";

export const ASSIGN_HINT = "mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/55";

/**
 * `kept_failed`: the new teacher IS primary, but putting the old primary back
 * as co-teacher failed. Not "failed" - half of it happened, and the sheet has
 * to say which half rather than offer to redo the part that worked.
 */
export type AssignPhase = "idle" | "assigning" | "assigned" | "failed" | "kept_failed";

const ROLES: {
  value: TeacherAssignmentRole;
  title: string;
  detail: string;
}[] = [
  {
    value: "co_teacher",
    title: "Co-teacher",
    detail: "Sees the class and supports; the primary teacher leads.",
  },
  {
    value: "primary",
    title: "Primary teacher",
    detail: "Leads the class. Only one primary per class.",
  },
];

/** How an assigned teacher is named in the notice and the failure line. */
export function assignedName(a: AssignedTeacher): string {
  return (
    [a.firstName, a.lastName].filter(Boolean).join(" ").trim() ||
    a.email ||
    "the current primary teacher"
  );
}

/*
 * MAKING SOMEBODY PRIMARY WHEN THE CLASS HAS ONE.
 *
 * The notice promises "Making Mr. Bello primary moves Ms. Adeyemi to
 * co-teacher; she keeps the class." This used to send one create with role
 * primary and nothing else - so the class ended up with two primaries, and the
 * sentence the admin read before pressing the button was not what the button
 * did.
 *
 * Two documented calls, in the only order that works: hand the primary slot to
 * the new teacher (`reassign`, the same route D06b's hand-over uses), then add
 * the old primary back as co-teacher. The reverse order cannot work - she is
 * already assigned, as primary.
 */
export function useAssignment(onAssigned: () => void) {
  const [phase, setPhase] = useState<AssignPhase>("idle");
  /** The half still owed after `kept_failed`, so Try again redoes only that. */
  const owed = useRef<{ classId: string; incumbent: AssignedTeacher } | null>(null);

  const done = () => {
    setPhase("assigned");
    // Let the confirmation be read before the sheet goes.
    setTimeout(onAssigned, 1100);
  };

  /** Put the old primary back as co-teacher - the half the notice promises. */
  const keepOldPrimary = (classId: string, incumbent: AssignedTeacher) =>
    classesApi.createAssignment({
      teacherId: incumbent.teacherId,
      classId,
      role: "co_teacher",
    });

  const assign = ({
    classId,
    teacherId,
    role,
    incumbent,
  }: {
    classId: string;
    teacherId: string;
    role: TeacherAssignmentRole;
    /** The class's current primary, if it has one. */
    incumbent: AssignedTeacher | undefined;
  }) => {
    setPhase("assigning");

    if (role === "primary" && incumbent) {
      owed.current = { classId, incumbent };
      classesApi
        .reassign(incumbent.assignmentId, { newTeacherId: teacherId, role: "primary" })
        .then(
          () =>
            keepOldPrimary(classId, incumbent).then(done, () => setPhase("kept_failed")),
          () => setPhase("failed"),
        );
      return;
    }

    classesApi
      .createAssignment({ teacherId, classId, role })
      .then(done)
      .catch(() => setPhase("failed"));
  };

  const retryKeep = () => {
    const o = owed.current;
    if (!o) return;
    setPhase("assigning");
    keepOldPrimary(o.classId, o.incumbent).then(done, () => setPhase("kept_failed"));
  };

  return { phase, assign, retryKeep };
}

export function RoleField({
  role,
  onChange,
}: {
  role: TeacherAssignmentRole | null;
  onChange: (role: TeacherAssignmentRole) => void;
}) {
  return (
    <fieldset className="border-none p-0">
      <legend className={ASSIGN_LABEL}>Role in this class</legend>
      <div className="flex flex-col gap-2.5">
        {ROLES.map((r) => {
          const selected = role === r.value;
          return (
            <button
              key={r.value}
              type="button"
              onClick={() => onChange(r.value)}
              aria-pressed={selected}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl bg-nevo-cream-elevated px-4 py-[15px] text-left transition-colors",
                selected
                  ? "border-2 border-nevo-navy bg-nevo-navy/[0.06]"
                  : "border-[1.5px] border-nevo-near-black/14",
              )}
            >
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-nevo-near-black">
                  {r.title}
                </span>
                <span className="block text-[13px] leading-[1.45] text-nevo-near-black/62">
                  {r.detail}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 flex-none items-center justify-center rounded-full",
                  selected
                    ? "bg-nevo-navy text-nevo-cream"
                    : "border-2 border-nevo-near-black/22",
                )}
              >
                {selected ? <CheckIcon /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/*
 * SCRUM-40's line, whole: "Ms. Adeyemi is Primary for JSS 2A right now. Making
 * Mr. Bello Primary moves her to Co-teacher; SHE KEEPS THE CLASS AND HER
 * NOTES."
 *
 * That last clause was dropped, and it is the half that matters. What an admin
 * hesitates over here is whether they are about to take something off a
 * colleague; the notice stated the demotion and then stopped, leaving the
 * answer to be guessed.
 */
export function PrimaryConflictNotice({
  primaryName,
  className,
  teacherName,
}: {
  primaryName: string;
  className: string;
  teacherName: string | undefined;
}) {
  return (
    <p className="m-0 rounded-[10px] bg-nevo-violet/24 px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-navy">
      {primaryName} is the primary teacher for {className}. Making{" "}
      {teacherName ?? "this teacher"} primary moves {primaryName} to
      co-teacher; they keep the class and their notes.
    </p>
  );
}

export function AssignFooter({
  phase,
  ready,
  primaryConflict,
  teacherName,
  className,
  primaryName,
  onSubmit,
  onRetryKeep,
  onClose,
  onAssigned,
}: {
  phase: AssignPhase;
  ready: boolean;
  primaryConflict: boolean;
  teacherName: string | undefined;
  /** The class being assigned to, once one is known. */
  className: string | undefined;
  primaryName: string | null;
  onSubmit: () => void;
  onRetryKeep: () => void;
  onClose: () => void;
  onAssigned: () => void;
}) {
  if (phase === "assigning") {
    return (
      <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
        <Spinner />
        <span className="text-sm text-nevo-near-black/60">Assigning…</span>
      </div>
    );
  }
  if (phase === "assigned") {
    return (
      <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
        <span className="flex size-[26px] flex-none items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop">
          <CheckIcon />
        </span>
        <span className="text-[14.5px] font-semibold text-nevo-navy">
          {teacherName} added to {className}
        </span>
      </div>
    );
  }
  if (phase === "kept_failed") {
    return (
      <>
        <FailureLine>
          {teacherName ?? "The new teacher"} is now primary for {className}.
          We couldn&rsquo;t keep {primaryName} on as co-teacher &ndash; try
          again, or add them back from the class page.
        </FailureLine>
        <button type="button" onClick={onRetryKeep} className={PRIMARY_BTN}>
          Try again
        </button>
        <button type="button" onClick={onAssigned} className={GHOST_BTN}>
          Close
        </button>
      </>
    );
  }
  if (phase === "failed") {
    return (
      <>
        <FailureLine>
          That didn&rsquo;t go through. We&rsquo;re on it - your choices are
          still here.
        </FailureLine>
        <button type="button" onClick={onSubmit} className={PRIMARY_BTN}>
          Try again
        </button>
        {/* SCRUM-40 names both: "Primary 'Try again', secondary 'Close'." A
            failure with one way out is a failure that holds the sheet open
            until it succeeds. */}
        <button type="button" onClick={onClose} className={GHOST_BTN}>
          Close
        </button>
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={onSubmit}
        disabled={!ready}
        className={cn(PRIMARY_BTN, "flex-1 justify-center")}
      >
        {primaryConflict ? "Assign and make Primary" : "Assign teacher"}
      </button>
      <button type="button" onClick={onClose} className={GHOST_BTN}>
        Cancel
      </button>
    </>
  );
}
