"use client";

import { useEffect, useMemo, useState } from "react";
import { classesApi, type AdminClass } from "@/lib/api/classes";
import { subjectsApi, type SchoolSubject } from "@/lib/api/subjects";
import { yearGroupOptions } from "@/lib/constants/yearGroups";
import { collisionNote, findCollision } from "./duplicateName";
import { cn } from "@/lib/utils";
import { ReadFailed } from "../ReadFailed";
import { SubjectPicker } from "./SubjectPicker";
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
 * SUBJECTS, NOT A TEACHER (D05, 6 Oct). Create used to offer an optional
 * primary teacher. Since SCRUM-194 an assignment needs a subject the class
 * takes, and a class just created takes none - so that assignment could only
 * ever be refused. D05's "Add a class" draws "Subjects this class takes"
 * instead, and teachers are assigned from the class, where the subject is
 * chosen. Editing leaves subjects to the class page's own section.
 */

const LABEL =
  "mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60";

const FIELD =
  "h-[50px] w-full cursor-pointer rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-[15px] text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy";

type Phase = "idle" | "saving" | "failed";

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
  /*
   * THREE FIELDS D05 DRAWS THAT THIS SHEET DID NOT OFFER, and what kept them
   * out was a comment that had gone stale: `classesApi.create` said the
   * deployed schema took `{ name, yearGroup }` "and nothing else". It takes
   * the full `ClassWrite`, and `ClassSummaryResponse` reads all three back.
   */
  const [section, setSection] = useState(existing?.section ?? "");
  const [session, setSession] = useState(existing?.academicSession ?? "");
  const [capacity, setCapacity] = useState(
    existing?.capacity != null ? String(existing.capacity) : "",
  );
  const [subjects, setSubjects] = useState<string[]>([]);
  const [schoolSubjects, setSchoolSubjects] = useState<SchoolSubject[] | null>(null);
  const [subjectsFailed, setSubjectsFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");

  const fetchSubjects = () =>
    subjectsApi
      .list()
      .then(setSchoolSubjects)
      .catch(() => setSubjectsFailed(true));
  const loadSubjects = () => {
    setSubjectsFailed(false);
    fetchSubjects();
  };
  // Create only - an existing class changes its subjects on its own page.
  useEffect(() => {
    if (!editing) fetchSubjects();
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
    /*
     * EMPTY IS NULL, NOT "". A blank optional field is the absence of an
     * answer; sending "" stores one, and a class whose section is the empty
     * string renders as a class with a section you cannot see.
     *
     * Capacity is the one that has to survive a person typing. `Number("")`
     * is 0 - a capacity of zero is a real and wrong answer - so it is parsed
     * only when there is something to parse, and anything unparseable is
     * treated as unsaid rather than as nought.
     */
    const typed = capacity.trim();
    const cap = typed ? Number(typed) : null;
    const payload = {
      name: name.trim(),
      yearGroup: year || null,
      section: section.trim() || null,
      academicSession: session.trim() || null,
      capacity: cap !== null && Number.isFinite(cap) && cap > 0 ? cap : null,
    };

    if (existing) {
      classesApi
        .update(existing.id, payload)
        .then(() => onSaved(existing.id))
        .catch(() => setPhase("failed"));
      return;
    }

    classesApi
      .create(subjects.length > 0 ? { ...payload, subjects } : payload)
      .then((created) => onSaved(created.id))
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="class-section" className={LABEL}>
            Section <span className="font-normal">(optional)</span>
          </label>
          <input
            id="class-section"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            placeholder="A"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="class-capacity" className={LABEL}>
            Capacity <span className="font-normal">(optional)</span>
          </label>
          <input
            id="class-capacity"
            inputMode="numeric"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="35"
            className={FIELD}
          />
        </div>
      </div>

      <div>
        <label htmlFor="class-session" className={LABEL}>
          Academic session <span className="font-normal">(optional)</span>
        </label>
        <input
          id="class-session"
          value={session}
          onChange={(e) => setSession(e.target.value)}
          placeholder="2026/27"
          className={FIELD}
        />
      </div>

      {!editing ? (
        <div>
          <label htmlFor="class-subjects" className={LABEL}>
            Subjects this class takes
          </label>
          <SubjectPicker
            id="class-subjects"
            value={subjects}
            onChange={setSubjects}
            subjects={schoolSubjects}
          />
          {subjectsFailed ? (
            <ReadFailed className="mt-2" what="your school's subject list" onRetry={loadSubjects} />
          ) : (
            <p className="mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/55">
              {subjects.length > 0
                ? `${subjects.length} ${subjects.length === 1 ? "subject" : "subjects"}. You can change these later from the class.`
                : "You can change these later from the class."}
            </p>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
