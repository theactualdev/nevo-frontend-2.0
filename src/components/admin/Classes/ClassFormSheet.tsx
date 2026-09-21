"use client";

import { useEffect, useMemo, useState } from "react";
import { classesApi, type AdminClass } from "@/lib/api/classes";
import { teachersApi, type TeacherSummary } from "@/lib/api/teachers";
import { yearGroupOptions } from "@/lib/constants/yearGroups";
import { collisionNote, findCollision } from "./duplicateName";
import { cn } from "@/lib/utils";
import {
  FailureLine,
  GHOST_BTN,
  PRIMARY_BTN,
  Sheet,
  Spinner,
} from "../Roster/primitives";

/**
 * Create a class, and - pre-filled and retitled - edit one. SCRUM-40 asks for
 * the same sheet in both roles, so it is the same component.
 *
 * Renaming a class does not rewrite history: assignment records keep the name
 * they carried at the time. That is a backend property, and this screen simply
 * does not do anything that would undermine it.
 *
 * THE OPTIONAL PRIMARY TEACHER IS TWO CALLS, NOT ONE. The sheet offers it
 * because D5 draws it, but the deployed `POST /api/v1/classes` takes only
 * `{ name, yearGroup }` - SCRUM-40's `primary_teacher_id` was never built. So
 * create posts the class, then posts the assignment with the id it gets back.
 * They are not atomic, and the failure copy is honest about which half landed
 * rather than saying "that didn't save" over a class that now exists.
 */

const LABEL =
  "mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60";

const FIELD =
  "h-[50px] w-full cursor-pointer rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-[15px] text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy";

type Phase = "idle" | "saving" | "failed" | "assign-failed";

export function ClassFormSheet({
  existing,
  onClose,
  onSaved,
}: {
  /** Absent for create; present turns the sheet into the edit variant. */
  existing?: AdminClass;
  onClose: () => void;
  onSaved: (classId: string) => void;
}) {
  const editing = Boolean(existing);
  const [name, setName] = useState(existing?.name ?? "");
  const [year, setYear] = useState(existing?.yearGroup ?? "");
  const [teacherId, setTeacherId] = useState("");
  const [teachers, setTeachers] = useState<TeacherSummary[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");

  // The primary-teacher select only exists on create. A class that already
  // exists is assigned from its detail page, which is the flow SCRUM-40 says
  // to optimise; a second door here would be a variant, not a mirror.
  useEffect(() => {
    if (editing) return;
    teachersApi
      .list()
      .then(setTeachers)
      .catch(() => setTeachers([]));
  }, [editing]);

  /*
   * CL-03's duplicate detection, which this sheet did not have: *"matching
   * case-insensitively and ignoring surrounding whitespace, and the message
   * names which existing class it collides with."* Without it a school could
   * create "JSS 2A" twice and only discover it from the roster.
   *
   * ARCHIVED COUNTS, so the list is fetched with `includeArchived`. Archive is
   * reversible and never deletes, so an archived "JSS 2A" is a name this
   * school still holds; `collisionNote` says restore rather than rename.
   *
   * EDITING IS EXEMPT AGAINST ITSELF. Renaming a class to the name it already
   * has is a no-op, not a collision, so the class being edited is excluded -
   * otherwise saving without touching the name would refuse.
   */
  const [siblings, setSiblings] = useState<AdminClass[]>([]);
  useEffect(() => {
    classesApi
      .list(true)
      .then(setSiblings)
      .catch(() => setSiblings([]));
  }, []);

  const collided = useMemo(() => {
    const hit = findCollision(name, siblings);
    return hit && hit.id !== existing?.id ? hit : null;
  }, [name, siblings, existing?.id]);

  const canSave =
    name.trim().length > 0 && phase !== "saving" && collided === null;

  const submit = () => {
    if (!canSave) return;
    setPhase("saving");
    const payload = { name: name.trim(), yearGroup: year || null };

    if (existing) {
      classesApi
        .update(existing.id, payload)
        .then(() => onSaved(existing.id))
        .catch(() => setPhase("failed"));
      return;
    }

    classesApi
      .create(payload)
      .then((created) => {
        if (!teacherId) {
          onSaved(created.id);
          return;
        }
        return (
          classesApi
            .createAssignment({
              teacherId: teacherId,
              classId: created.id,
              role: "primary",
            })
            .then(() => onSaved(created.id))
            // The class exists either way. Send them to it and say what is left
            // undone, rather than stranding them in a sheet over a saved class.
            .catch(() => setPhase("assign-failed"))
        );
      })
      .catch(() => setPhase("failed"));
  };

  return (
    <Sheet
      busy={phase === "saving"}
      title={editing ? "Edit class" : "Create a class"}
      subtitle={editing ? existing?.name : "It can be renamed later."}
      onClose={onClose}
      footer={
        phase === "saving" ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
            <Spinner />
            <span className="text-sm text-nevo-near-black/60">
              {editing ? "Saving the class…" : "Creating the class…"}
            </span>
          </div>
        ) : phase === "failed" ? (
          <>
            <FailureLine>
              That didn&rsquo;t save. We&rsquo;re on it, and what you typed is
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
        ) : phase === "assign-failed" ? (
          <>
            <FailureLine>
              The class was created, but the teacher wasn&rsquo;t assigned. You
              can assign one from the class itself.
            </FailureLine>
            <button type="button" onClick={onClose} className={PRIMARY_BTN}>
              Close
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={submit}
              disabled={!canSave}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              {editing ? "Save changes" : "Create class"}
            </button>
            <button type="button" onClick={onClose} className={GHOST_BTN}>
              Cancel
            </button>
          </>
        )
      }
    >
      <div>
        <label htmlFor="class-name" className={LABEL}>
          Class name
        </label>
        <input
          id="class-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="JSS 2A"
          autoComplete="off"
          className={cn(FIELD, "cursor-text")}
        />
        {collided ? (
          /* Violet, never red - this console's own rule for a problem. It
             names the class rather than saying "that name is taken", because
             an archived collision has a different remedy from a live one. */
          <p className="mt-2 rounded-[10px] bg-nevo-violet/16 px-3.5 py-2.5 text-[13px] leading-[1.5] text-nevo-near-black/78">
            {collisionNote(collided)}
          </p>
        ) : (
          <p className="mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/55">
            Name it however your school does.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="class-year" className={LABEL}>
          Year group
        </label>
        <select
          id="class-year"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className={FIELD}
        >
          <option value="">Choose a year group</option>
          {yearGroupOptions().map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {!editing ? (
        <div>
          <label htmlFor="class-teacher" className={LABEL}>
            Primary teacher <span className="font-normal">(optional)</span>
          </label>
          <select
            id="class-teacher"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className={FIELD}
          >
            <option value="">Assign later</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/55">
            The primary teacher leads the class. You can add co-teachers once it
            exists.
          </p>
        </div>
      ) : null}
    </Sheet>
  );
}
