"use client";

import { useEffect, useRef, useState } from "react";
import {
  classesApi,
  type AdminClass,
  type AssignedClass,
  type AssignedTeacher,
  type TeacherAssignmentRole,
} from "@/lib/api/classes";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import { classTakes, subjectNamed, subjectsApi, type SchoolSubject } from "@/lib/api/subjects";
import { teachersApi, type TeacherSummary } from "@/lib/api/teachers";
import { yearGroupLabel } from "@/lib/constants/yearGroups";
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
import {
  ASSIGN_HINT,
  ASSIGN_LABEL,
  ASSIGN_SELECT,
  PrimaryConflictNotice,
  RoleField,
  assignedName,
} from "./assignParts";

/**
 * D05 "Assign a teacher" (SCRUM-194): teacher, then subject, then the classes
 * she teaches it to.
 *
 * ONE SHEET, TWO DOORS. Class detail opens it with that class ticked; teacher
 * detail opens it with that teacher chosen. SCRUM-40 asked that the two word
 * the same write identically, and one sheet makes that true by construction.
 *
 * D05'S "TEACHES", NOW THE READ CARRIES IT (8 Oct). `TeacherDetailResponse`
 * has the teacher's `subjects`, so step 2 offers only those, as D05 draws it:
 * one subject is simply "Teaches Biology", already chosen; several are a
 * choice between them. A teacher with none on record, or whose record could
 * not be read, falls back to the school's whole list - and a pick they do not
 * hold is refused by the server (`subject_not_on_teacher`) in its own words.
 * (This shipped reduced on 6 Oct, offering every subject unmarked.)
 *
 * A CLASS THAT DOES NOT TAKE THE SUBJECT cannot be ticked - the server would
 * refuse it (`subject_not_on_class`). D05 offers to add the subject to that
 * class right here, confirmed first: "It joins the class's 9 subjects.
 * Nothing else about the class changes."
 *
 * A TEACHER WHO DOES NOT TEACH IT, the same way (16 Oct). The server refuses
 * that too (`subject_not_on_teacher`), and a teacher with no subjects on
 * record - a new one, usually - was offered the school's whole list, so
 * every pick was refused: the assign "didn't work" with nothing to do about
 * it. Now a subject they don't hold says so in step 2 and offers to add it
 * to their subjects in place, confirmed first, as 7c does for a class. D05
 * draws no zero-subject teacher; this mirrors 7c and is with design.
 *
 * ONLY A TEACHER WHO HAS JOINED CAN BE ASSIGNED. The server takes an active
 * teacher only, and answered an invited one with "The requested teacher was
 * not found." Invited teachers stay in the list, greyed, so the admin
 * looking for one finds them and the reason.
 *
 * MAKING SOMEBODY PRIMARY WHERE A CLASS HAS ONE. The server enforces one
 * primary per class now (409 `primary_teacher_exists`). The old primary is
 * moved to co-teacher IN PLACE - their own assignment reassigned to them with
 * the new role, so they keep their subject, which no read would let us
 * reconstruct - and only then is the new primary created. If the second call
 * fails, the class is left with no primary, and the sheet says exactly that.
 *
 * EVERY CLASS GETS ITS OWN OUTCOME. Several classes are one tick each and one
 * call each; a refusal for one is said beside that class in the server's
 * words, and Try again retries only what did not happen.
 */

type Door =
  | {
      kind: "class";
      klass: AdminClass;
      /** Who already teaches the opening class. */
      assigned: AssignedTeacher[];
    }
  | {
      kind: "teacher";
      teacher: { id: string; name: string };
      /** The classes this teacher already holds; not offered again. */
      held: AssignedClass[];
    };

type Read<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "failed" };

/** What happened to one class on submit. */
type Outcome =
  | { state: "done" }
  | { state: "failed"; message: string | null }
  /** The old primary is co-teacher now; the new primary was not created. */
  | { state: "demoted"; primaryName: string; message: string | null };

const reason = (err: unknown) => (err instanceof ApiError ? apiErrorMessage(err.detail) : null);

export function AssignTeachingSheet({
  door,
  classes: given,
  onClose,
  onAssigned,
}: {
  door: Door;
  /** Every class in the school, when the door already has them. */
  classes?: AdminClass[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [subjects, setSubjects] = useState<Read<SchoolSubject[]>>({ state: "loading" });
  const [classes, setClasses] = useState<Read<AdminClass[]>>(
    given ? { state: "ready", value: given } : { state: "loading" },
  );
  const [teachers, setTeachers] = useState<Read<TeacherSummary[]>>({ state: "loading" });
  const [teacherId, setTeacherId] = useState(door.kind === "teacher" ? door.teacher.id : "");
  /** Classes the chosen teacher already holds. Unknown is not "none". */
  const [held, setHeld] = useState<AssignedClass[] | null>(
    door.kind === "teacher" ? door.held : null,
  );
  const [subjectId, setSubjectId] = useState("");
  /**
   * The chosen teacher's subjects, by name, from their record. Null while
   * unread or when the read failed - then the whole school list is offered.
   */
  const [taught, setTaught] = useState<string[] | null>(null);
  const [ticked, setTicked] = useState<string[]>(
    door.kind === "class" ? [door.klass.id] : [],
  );
  const [role, setRole] = useState<TeacherAssignmentRole | null>(null);
  /** Who teaches each ticked class - the primary notice depends on it. */
  const [classTeachers, setClassTeachers] = useState<Record<string, Read<AssignedTeacher[]>>>(
    door.kind === "class" ? { [door.klass.id]: { state: "ready", value: door.assigned } } : {},
  );
  /** "Add Biology to JSS 2A?" - which class is asking, and its write. */
  const [adding, setAdding] = useState<{ classId: string; phase: "ask" | "saving" | "failed"; note: string | null } | null>(null);
  const [added, setAdded] = useState<{ subject: string; className: string } | null>(null);
  /** "Add Physics to Mr. Obi's subjects?" - the teacher's own write. */
  const [teacherAdd, setTeacherAdd] = useState<{ phase: "ask" | "saving" | "failed"; note: string | null } | null>(null);
  const [phase, setPhase] = useState<"idle" | "assigning" | "settled">("idle");
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const latestTeacher = useRef(teacherId);

  // Each read: a fetch that only sets state when it answers (the effect's),
  // and a retry that first says it is looking again.
  const fetchSubjects = () =>
    subjectsApi
      .list()
      .then((value) => setSubjects({ state: "ready", value }))
      .catch(() => setSubjects({ state: "failed" }));
  const fetchClasses = () =>
    classesApi
      .list()
      .then((value) => setClasses({ state: "ready", value }))
      .catch(() => setClasses({ state: "failed" }));
  const fetchTeachers = () =>
    teachersApi
      .list()
      .then((value) => setTeachers({ state: "ready", value }))
      .catch(() => setTeachers({ state: "failed" }));
  const loadSubjects = () => {
    setSubjects({ state: "loading" });
    fetchSubjects();
  };
  const loadClasses = () => {
    setClasses({ state: "loading" });
    fetchClasses();
  };
  const loadTeachers = () => {
    setTeachers({ state: "loading" });
    fetchTeachers();
  };
  const readClassTeachers = (id: string) => {
    setClassTeachers((m) => ({ ...m, [id]: { state: "loading" } }));
    classesApi
      .classTeachers(id)
      .then((value) => setClassTeachers((m) => ({ ...m, [id]: { state: "ready", value } })))
      .catch(() => setClassTeachers((m) => ({ ...m, [id]: { state: "failed" } })));
  };

  const readTaught = (id: string) =>
    teachersApi
      .get(id)
      .then((t) => {
        if (latestTeacher.current === id) setTaught(Array.isArray(t.subjects) ? t.subjects : null);
      })
      .catch(() => undefined);

  useEffect(() => {
    fetchSubjects();
    if (!given) fetchClasses();
    if (door.kind === "class") fetchTeachers();
    if (door.kind === "teacher") readTaught(door.teacher.id);
    // Once, on open: each read has its own retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseTeacher = (id: string) => {
    setTeacherId(id);
    latestTeacher.current = id;
    setHeld(null);
    setTaught(null);
    setSubjectId("");
    setTeacherAdd(null);
    if (!id) return;
    readTaught(id);
    classesApi
      .teacherClasses(id)
      .then((rows) => {
        if (latestTeacher.current === id) setHeld(rows);
      })
      // Unread, not empty: nothing is hidden, and a class they already hold
      // is refused by the server in its own words.
      .catch(() => undefined);
  };

  /** The school subjects this teacher teaches, matched by name. */
  const teaches =
    subjects.state === "ready" && taught
      ? subjects.value.filter((s) => taught.some((name) => subjectNamed([s], name)))
      : [];
  // One subject needs no choosing: D05 states it and it is the pick.
  const chosenSubjectId = subjectId || (teaches.length === 1 ? teaches[0].id : "");
  const subject =
    subjects.state === "ready" ? subjects.value.find((s) => s.id === chosenSubjectId) : undefined;
  const teacherName =
    door.kind === "teacher"
      ? door.teacher.name
      : teachers.state === "ready"
        ? teachers.value.find((t) => t.id === teacherId)?.name
        : undefined;
  /**
   * Whether the chosen teacher teaches the chosen subject. Null when their
   * list is unknown - unread, or the read failed - and then the server says.
   */
  const holds = subject && taught ? taught.some((name) => subjectNamed([subject], name)) : null;
  const who = teacherName ?? "this teacher";

  /*
   * The classes this write can reach: not archived, not synced from a
   * connected roster (its membership is managed there), and not one the
   * teacher already holds.
   */
  const reachable =
    classes.state === "ready"
      ? classes.value.filter(
          (c) =>
            !c.archivedAt &&
            c.source !== "roster_sync" &&
            !(held ?? []).some((h) => h.classId === c.id),
        )
      : [];
  const takes = (c: AdminClass) => Boolean(subject && classTakes(c.subjects, subject));
  // A ticked class counts only once it takes the subject - the opening class
  // stays ticked through "Add Biology to JSS 2A" and counts from then on.
  const tickedClasses = reachable.filter((c) => ticked.includes(c.id) && takes(c));

  const incumbentOf = (classId: string): AssignedTeacher | undefined => {
    const r = classTeachers[classId];
    return r?.state === "ready" ? r.value.find((a) => a.role === "primary") : undefined;
  };
  const readsDone = tickedClasses.every((c) => classTeachers[c.id]?.state === "ready");
  const ready =
    Boolean(teacherId && subject && role) &&
    holds !== false &&
    tickedClasses.length > 0 &&
    // A primary write needs to know who leads each class now.
    (role !== "primary" || readsDone);

  const toggle = (c: AdminClass) => {
    if (ticked.includes(c.id)) {
      setTicked((t) => t.filter((x) => x !== c.id));
      return;
    }
    setTicked((t) => [...t, c.id]);
    if (!classTeachers[c.id] || classTeachers[c.id].state === "failed") readClassTeachers(c.id);
  };

  const addSubjectToClass = (c: AdminClass) => {
    if (!subject) return;
    setAdding({ classId: c.id, phase: "saving", note: null });
    const next = [...c.subjects, subject.name];
    classesApi
      // Name and year group ride along: the PATCH writes the year group from
      // the body every time.
      .update(c.id, { name: c.name, yearGroup: c.yearGroup, subjects: next })
      .then(() => {
        setClasses((r) =>
          r.state === "ready"
            ? { state: "ready", value: r.value.map((x) => (x.id === c.id ? { ...x, subjects: next } : x)) }
            : r,
        );
        setAdded({ subject: subject.displayName, className: c.name });
        setAdding(null);
        if (!ticked.includes(c.id)) toggle({ ...c, subjects: next });
      })
      .catch((err: unknown) => setAdding({ classId: c.id, phase: "failed", note: reason(err) }));
  };

  const addSubjectToTeacher = () => {
    if (!subject || !teacherId) return;
    const id = teacherId;
    setTeacherAdd({ phase: "saving", note: null });
    teachersApi
      .addSubject(id, subject.name)
      .then((rows) => {
        if (latestTeacher.current !== id) return;
        setTaught(Array.isArray(rows) ? rows.map((r) => r.name) : [...(taught ?? []), subject.name]);
        setAdded({ subject: subject.displayName, className: `${who}\u2019s subjects` });
        setTeacherAdd(null);
      })
      .catch((err: unknown) => setTeacherAdd({ phase: "failed", note: reason(err) }));
  };

  /** One class's write: demote the old primary in place first, if there is one. */
  const writeOne = async (c: AdminClass, owed?: Outcome): Promise<Outcome> => {
    if (!subject || !role) return { state: "failed", message: null };
    const incumbent = role === "primary" ? incumbentOf(c.id) : undefined;
    if (incumbent && owed?.state !== "demoted") {
      try {
        await classesApi.reassign(incumbent.assignmentId, {
          newTeacherId: incumbent.teacherId,
          role: "co_teacher",
        });
      } catch (err) {
        return { state: "failed", message: reason(err) };
      }
    }
    try {
      await classesApi.createAssignment({
        teacherId,
        classId: c.id,
        role,
        schoolSubjectId: subject.id,
      });
      return { state: "done" };
    } catch (err) {
      return incumbent
        ? { state: "demoted", primaryName: assignedName(incumbent), message: reason(err) }
        : { state: "failed", message: reason(err) };
    }
  };

  const submit = async () => {
    if (!ready) return;
    setPhase("assigning");
    const next: Record<string, Outcome> = { ...outcomes };
    for (const c of tickedClasses) {
      if (next[c.id]?.state === "done") continue;
      next[c.id] = await writeOne(c, next[c.id]);
    }
    setOutcomes(next);
    if (tickedClasses.every((c) => next[c.id]?.state === "done")) {
      setPhase("settled");
      // Let the confirmation be read before the sheet goes.
      setTimeout(onAssigned, 1100);
      return;
    }
    setPhase("settled");
  };

  const allDone = tickedClasses.length > 0 && tickedClasses.every((c) => outcomes[c.id]?.state === "done");
  const anyDone = Object.values(outcomes).some((o) => o.state === "done");
  const someFailed = phase === "settled" && !allDone;
  const n = tickedClasses.length;
  const cta = subject
    ? `Assign ${subject.displayName} to ${n} ${n === 1 ? "class" : "classes"}`
    : "Assign teacher";
  const roleLegend =
    n === 1 ? `Role in ${tickedClasses[0].name}` : n > 1 ? "Role in these classes" : "Role";
  const subtitle =
    door.kind === "class"
      ? [`from ${door.klass.name}`, yearGroupLabel(door.klass.yearGroup)].filter(Boolean).join(" · ")
      : `for ${door.teacher.name}`;

  return (
    <Sheet
      busy={phase === "assigning"}
      title="Assign a teacher"
      subtitle={subtitle}
      onClose={onClose}
      footer={
        phase === "assigning" ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
            <Spinner />
            <span className="text-sm text-nevo-near-black/60">Assigning…</span>
          </div>
        ) : allDone && phase === "settled" ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
            <span className="flex size-[26px] flex-none items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop">
              <CheckIcon />
            </span>
            <span className="text-[14.5px] font-semibold text-nevo-navy">
              {teacherName} added to {n === 1 ? tickedClasses[0].name : `${n} classes`}
            </span>
          </div>
        ) : someFailed ? (
          <>
            <FailureLine>
              {anyDone
                ? "Some of that went through. What didn’t is marked beside each class."
                : "That didn’t go through. Your choices are still here."}
            </FailureLine>
            <button type="button" onClick={submit} className={PRIMARY_BTN}>
              Try again
            </button>
            <button type="button" onClick={anyDone ? onAssigned : onClose} className={GHOST_BTN}>
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
              {cta}
            </button>
            <button type="button" onClick={onClose} className={GHOST_BTN}>
              Cancel
            </button>
          </>
        )
      }
    >
      {added ? (
        <p role="status" className="m-0 rounded-[10px] bg-nevo-navy/[0.06] px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-navy">
          <strong className="font-semibold">
            {added.subject} added to {added.className}.
          </strong>{" "}
          Your other choices are as you left them.
        </p>
      ) : null}

      {/* 1 · Teacher */}
      <div>
        <span className={ASSIGN_LABEL}>1 · Teacher</span>
        {door.kind === "teacher" ? (
          <p className="m-0 text-[15px] font-semibold text-nevo-near-black">{door.teacher.name}</p>
        ) : (
          <>
            <select
              aria-label="Teacher"
              value={teacherId}
              onChange={(e) => chooseTeacher(e.target.value)}
              disabled={phase !== "idle"}
              className={ASSIGN_SELECT}
            >
              <option value="">Choose a teacher</option>
              {teachers.state === "ready"
                ? teachers.value
                    // A removed teacher has no console to teach in.
                    .filter((t) => t.status !== "deactivated")
                    .map((t) => (
                      <option key={t.id} value={t.id} disabled={t.status === "invited"}>
                        {t.status === "invited" ? `${t.name} (invited, not yet joined)` : t.name}
                      </option>
                    ))
                : null}
            </select>
            {teachers.state === "loading" ? (
              <p className="mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/45">
                Looking up your staff&hellip;
              </p>
            ) : teachers.state === "failed" ? (
              <ReadFailed className="mt-2" what="your staff list" onRetry={loadTeachers} />
            ) : teachers.value.length === 0 ? (
              <p className={ASSIGN_HINT}>
                No staff to assign yet. Invite a teacher first, and they&rsquo;ll appear here.
              </p>
            ) : teachers.value.some((t) => t.status === "invited") ? (
              <p className={ASSIGN_HINT}>
                A teacher you&rsquo;ve invited can be assigned once they&rsquo;ve joined.
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* 2 · Subject */}
      <div>
        <label htmlFor="assign-subject" className={ASSIGN_LABEL}>
          2 · Subject
        </label>
        {teaches.length === 1 ? (
          <p id="assign-subject" className="m-0 text-[14px] text-nevo-near-black/66">
            Teaches <strong className="font-semibold text-nevo-near-black">{teaches[0].displayName}</strong>
          </p>
        ) : teaches.length > 1 ? (
          <div role="radiogroup" aria-label="2 · Subject" className="flex flex-wrap gap-2.5">
            {teaches.map((s) => {
              const on = s.id === chosenSubjectId;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={phase !== "idle"}
                  onClick={() => setSubjectId(s.id)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-3.5 py-2 text-[14px] font-medium transition-colors",
                    on
                      ? "border-nevo-navy bg-nevo-navy text-nevo-cream"
                      : "border-nevo-near-black/14 bg-nevo-cream-elevated text-nevo-near-black/78 hover:border-nevo-navy/40",
                  )}
                >
                  {s.displayName}
                </button>
              );
            })}
          </div>
        ) : (
          <select
            id="assign-subject"
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setTeacherAdd(null);
            }}
            disabled={phase !== "idle" || subjects.state !== "ready"}
            className={ASSIGN_SELECT}
          >
            <option value="">Choose a subject</option>
            {subjects.state === "ready"
              ? subjects.value.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))
              : null}
          </select>
        )}
        {subjects.state === "failed" ? (
          <ReadFailed className="mt-2" what="your school's subject list" onRetry={loadSubjects} />
        ) : null}
        {subject && holds === false ? (
          teacherAdd && teacherAdd.phase !== "failed" ? (
            <div className="mt-2.5 rounded-[10px] bg-nevo-cream px-3.5 py-3">
              <p className="m-0 text-[13.5px] font-semibold text-nevo-near-black">
                Add {subject.displayName} to {who}&rsquo;s subjects?
              </p>
              <p className="m-0 mt-1 text-[13px] leading-[1.5] text-nevo-near-black/62">
                It joins the subjects they teach. Nothing else about them changes.
              </p>
              <div className="mt-2.5 flex gap-2.5">
                <button
                  type="button"
                  onClick={addSubjectToTeacher}
                  disabled={teacherAdd.phase === "saving"}
                  className={PRIMARY_BTN}
                >
                  {teacherAdd.phase === "saving" ? "Adding…" : `Add ${subject.displayName}`}
                </button>
                <button
                  type="button"
                  onClick={() => setTeacherAdd(null)}
                  disabled={teacherAdd.phase === "saving"}
                  className={GHOST_BTN}
                >
                  Not now
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <p className="m-0 text-[13px] leading-[1.5] text-nevo-near-black/62">
                {who} doesn&rsquo;t teach {subject.displayName} yet, so it can&rsquo;t be
                assigned. Add {subject.displayName} to {who}&rsquo;s subjects and it&rsquo;s ready.
              </p>
              {teacherAdd?.phase === "failed" ? (
                <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-nevo-navy">
                  {teacherAdd.note ?? `${subject.displayName} wasn’t added to ${who}’s subjects. Nothing changed.`}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setTeacherAdd({ phase: "ask", note: null })}
                disabled={phase !== "idle"}
                className="mt-1.5 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
              >
                Add {subject.displayName} to {who}&rsquo;s subjects
              </button>
            </div>
          )
        ) : null}
      </div>

      {/* 3 · Classes for {subject} */}
      {subject ? (
        <div>
          <span className={ASSIGN_LABEL}>3 · Classes for {subject.displayName}</span>
          {classes.state === "loading" ? (
            <p className="m-0 text-[12.5px] leading-[1.5] text-nevo-near-black/45">
              Looking up your classes&hellip;
            </p>
          ) : classes.state === "failed" ? (
            <ReadFailed what="your classes" onRetry={loadClasses} />
          ) : reachable.length === 0 ? (
            <p className={ASSIGN_HINT}>No classes to assign yet. Create a class first.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {reachable.map((c) => {
                const ok = takes(c);
                const on = ticked.includes(c.id);
                const outcome = outcomes[c.id];
                const year = yearGroupLabel(c.yearGroup);
                const meta = [year, `${c.studentCount} ${c.studentCount === 1 ? "student" : "students"}`]
                  .filter(Boolean)
                  .join(" · ");
                const asking = adding?.classId === c.id ? adding : null;
                return (
                  <li key={c.id} className="rounded-xl border-[1.5px] border-nevo-near-black/12 px-4 py-3">
                    <label className={cn("flex items-center gap-3", ok ? "cursor-pointer" : "cursor-default")}>
                      <input
                        type="checkbox"
                        checked={on && ok}
                        disabled={!ok || phase !== "idle"}
                        onChange={() => toggle(c)}
                        className="size-[18px] accent-nevo-navy"
                      />
                      <span className="flex-1">
                        <span className="block text-[15px] font-semibold text-nevo-near-black">{c.name}</span>
                        <span className="block text-[12.5px] text-nevo-near-black/55">{meta}</span>
                      </span>
                    </label>
                    {!ok ? (
                      asking && asking.phase !== "failed" ? (
                        <div className="mt-2.5 rounded-[10px] bg-nevo-cream px-3.5 py-3">
                          <p className="m-0 text-[13.5px] font-semibold text-nevo-near-black">
                            Add {subject.displayName} to {c.name}?
                          </p>
                          <p className="m-0 mt-1 text-[13px] leading-[1.5] text-nevo-near-black/62">
                            It joins the class&rsquo;s {c.subjects.length}{" "}
                            {c.subjects.length === 1 ? "subject" : "subjects"}. Nothing else about the
                            class changes.
                          </p>
                          <div className="mt-2.5 flex gap-2.5">
                            <button
                              type="button"
                              onClick={() => addSubjectToClass(c)}
                              disabled={asking.phase === "saving"}
                              className={PRIMARY_BTN}
                            >
                              {asking.phase === "saving" ? "Adding…" : `Add ${subject.displayName}`}
                            </button>
                            <button
                              type="button"
                              onClick={() => setAdding(null)}
                              disabled={asking.phase === "saving"}
                              className={GHOST_BTN}
                            >
                              Not now
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <p className="m-0 text-[13px] leading-[1.5] text-nevo-near-black/62">
                            {c.name} doesn&rsquo;t take {subject.displayName}, so it can&rsquo;t be
                            assigned here yet. Add {subject.displayName} to {c.name}&rsquo;s subjects and
                            it&rsquo;s ready to tick.
                          </p>
                          {asking?.phase === "failed" ? (
                            <p className="m-0 mt-1.5 text-[13px] leading-[1.5] text-nevo-navy">
                              {asking.note ?? `${subject.displayName} wasn’t added to ${c.name}. Nothing changed.`}
                            </p>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setAdding({ classId: c.id, phase: "ask", note: null })}
                            disabled={phase !== "idle"}
                            className="mt-1.5 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
                          >
                            Add {subject.displayName} to {c.name}
                          </button>
                        </div>
                      )
                    ) : null}
                    {on && ok && role === "primary" && classTeachers[c.id]?.state === "failed" ? (
                      <ReadFailed className="mt-2" what={`who teaches ${c.name}`} onRetry={() => readClassTeachers(c.id)} />
                    ) : null}
                    {outcome && outcome.state !== "done" ? (
                      <p className="m-0 mt-2 text-[13px] leading-[1.5] text-nevo-navy">
                        {outcome.state === "demoted"
                          ? `${outcome.primaryName} is now co-teacher for ${c.name}, but making ${teacherName ?? "this teacher"} primary didn’t go through${outcome.message ? `: ${outcome.message}` : "."}`
                          : (outcome.message ?? `${c.name}: that didn’t go through.`)}
                      </p>
                    ) : outcome?.state === "done" && !allDone ? (
                      <p className="m-0 mt-2 text-[13px] font-semibold text-nevo-navy">Assigned.</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      <RoleField role={role} onChange={setRole} legend={roleLegend} />

      {role === "primary"
        ? tickedClasses.map((c) => {
            const incumbent = incumbentOf(c.id);
            return incumbent && incumbent.teacherId !== teacherId ? (
              <PrimaryConflictNotice
                key={c.id}
                primaryName={assignedName(incumbent)}
                className={c.name}
                teacherName={teacherName}
              />
            ) : null;
          })
        : null}
    </Sheet>
  );
}
