"use client";

import { useCallback, useEffect, useState } from "react";
import {
  classesApi,
  type AssignedTeacher,
  type TeacherAssignmentRole,
} from "@/lib/api/classes";
import { teachersApi, type TeacherSummary } from "@/lib/api/teachers";
import { cn } from "@/lib/utils";
import { ReadFailed } from "../ReadFailed";
import {
  CheckIcon,
  FailureLine,
  GHOST_BTN,
  PRIMARY_BTN,
  Sheet,
  Spinner,
} from "../Roster/primitives";

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
 * flow. Teacher detail mirrors it with the same role cards and identical
 * wording; where the two would diverge, class detail wins.
 *
 * TODO(api): `POST /api/v1/teacher-class-assignments` creates a row and
 * nothing more. The contract documents no demotion, no one-primary-per-class
 * rule (`TeacherAssignmentRole` is a bare enum) and no 409, so a plain create
 * with `role: "primary"` can leave a class with two primaries. The notice
 * above therefore describes an intent the API does not guarantee.
 *
 * "ONLY THE BACKEND CAN PREVENT THAT" USED TO CLOSE THIS, and it is not true.
 * There is no PATCH on an assignment, but there is a role-changing seam:
 * `POST /api/v1/teacher-class-assignments/{assignment_id}/reassign` taking
 * `{newTeacherId, role?}`, already wrapped as `classesApi.reassign` and
 * already used by RemoveAccessSheet. Honouring the notice client-side means
 * reassigning the incumbent's row to co_teacher and creating the new primary -
 * TWO CALLS, NOT ONE TRANSACTION, so the open question is what the second
 * failing should leave behind. That is a decision this console can make and
 * has not; it is not a thing it is waiting on. A transaction is still the
 * right ask of backend, and is still the only way to close the window.
 */

const LABEL =
  "mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60";

/**
 * `kept_failed`: the new teacher IS primary, but putting the old primary back
 * as co-teacher failed. Not "failed" - half of it happened, and the sheet has
 * to say which half rather than offer to redo the part that worked.
 */
type Phase = "idle" | "assigning" | "assigned" | "failed" | "kept_failed";

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
  const [phase, setPhase] = useState<Phase>("idle");

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
  const primaryName = currentPrimary
    ? [currentPrimary.firstName, currentPrimary.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      currentPrimary.email ||
      "the current primary teacher"
    : null;

  const chosen = assignable.find((t) => t.id === teacherId);
  const ready = Boolean(teacherId && role);

  const done = () => {
    setPhase("assigned");
    // Let the confirmation be read before the sheet goes.
    setTimeout(onAssigned, 1100);
  };

  /** Put the old primary back as co-teacher - the half the notice promises. */
  const keepOldPrimary = (incumbent: AssignedTeacher) =>
    classesApi.createAssignment({
      teacherId: incumbent.teacherId,
      classId,
      role: "co_teacher",
    });

  /*
   * MAKING SOMEBODY PRIMARY WHEN THE CLASS HAS ONE.
   *
   * The notice below promises "Making Mr. Bello primary moves Ms. Adeyemi to
   * co-teacher; she keeps the class." This used to send one create with role
   * primary and nothing else - so the class ended up with two primaries, and
   * the sentence the admin read before pressing the button was not what the
   * button did.
   *
   * Two documented calls, in the only order that works: hand the primary slot
   * to the new teacher (`reassign`, the same route D06b's hand-over uses),
   * then add the old primary back as co-teacher. The reverse order cannot
   * work - she is already assigned, as primary.
   */
  const submit = () => {
    if (!ready || !role) return;
    setPhase("assigning");

    if (role === "primary" && currentPrimary) {
      const incumbent = currentPrimary;
      classesApi
        .reassign(incumbent.assignmentId, { newTeacherId: teacherId, role: "primary" })
        .then(
          () =>
            keepOldPrimary(incumbent).then(done, () => setPhase("kept_failed")),
          () => setPhase("failed"),
        );
      return;
    }

    classesApi
      .createAssignment({ teacherId: teacherId, classId: classId, role })
      .then(done)
      .catch(() => setPhase("failed"));
  };

  const retryKeep = () => {
    if (!currentPrimary) return;
    setPhase("assigning");
    keepOldPrimary(currentPrimary).then(done, () => setPhase("kept_failed"));
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
        phase === "assigning" ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
            <Spinner />
            <span className="text-sm text-nevo-near-black/60">Assigning…</span>
          </div>
        ) : phase === "assigned" ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
            <span className="flex size-[26px] flex-none items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop">
              <CheckIcon />
            </span>
            <span className="text-[14.5px] font-semibold text-nevo-navy">
              {chosen?.name} added to {className}
            </span>
          </div>
        ) : phase === "kept_failed" ? (
          <>
            <FailureLine>
              {chosen?.name ?? "The new teacher"} is now primary for {className}.
              We couldn&rsquo;t keep {primaryName} on as co-teacher &ndash; try
              again, or add them back from the class page.
            </FailureLine>
            <button type="button" onClick={retryKeep} className={PRIMARY_BTN}>
              Try again
            </button>
            <button type="button" onClick={onAssigned} className={GHOST_BTN}>
              Close
            </button>
          </>
        ) : phase === "failed" ? (
          <>
            <FailureLine>
              That didn&rsquo;t go through. We&rsquo;re on it - your choices are
              still here.
            </FailureLine>
            <button type="button" onClick={submit} className={PRIMARY_BTN}>
              Try again
            </button>
            {/* SCRUM-40 names both: "Primary 'Try again', secondary
                'Close'." A failure with one way out is a failure that holds
                the sheet open until it succeeds. */}
            <button type="button" onClick={onClose} className={GHOST_BTN}>
              Close
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={submit}
              disabled={!ready}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              {primaryConflict ? "Assign and make Primary" : "Assign teacher"}
            </button>
            <button type="button" onClick={onClose} className={GHOST_BTN}>
              Cancel
            </button>
          </>
        )
      }
    >
      <div>
        <label htmlFor="assign-teacher" className={LABEL}>
          Teacher
        </label>
        <select
          id="assign-teacher"
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          className="h-[50px] w-full cursor-pointer rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-[15px] text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy"
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
          <p className="mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/55">
            No staff to assign yet. Invite a teacher first, and they&rsquo;ll
            appear here.
          </p>
        ) : assignable.length === 0 ? (
          <p className="mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/55">
            Everyone on staff already teaches this class.
          </p>
        ) : null}
      </div>

      <fieldset className="border-none p-0">
        <legend className={LABEL}>Role in this class</legend>
        <div className="flex flex-col gap-2.5">
          {ROLES.map((r) => {
            const selected = role === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
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

      {primaryConflict ? (
        /*
         * SCRUM-40's line, whole: "Ms. Adeyemi is Primary for JSS 2A right
         * now. Making Mr. Bello Primary moves her to Co-teacher; SHE KEEPS THE
         * CLASS AND HER NOTES."
         *
         * That last clause was dropped, and it is the half that matters. What
         * an admin hesitates over here is whether they are about to take
         * something off a colleague; the notice stated the demotion and then
         * stopped, leaving the answer to be guessed.
         */
        <p className="m-0 rounded-[10px] bg-nevo-violet/24 px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-navy">
          {primaryName} is the primary teacher for {className}. Making{" "}
          {chosen?.name ?? "this teacher"} primary moves {primaryName} to
          co-teacher; they keep the class and their notes.
        </p>
      ) : null}
    </Sheet>
  );
}
