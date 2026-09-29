"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  classesApi,
  type AdminClass,
  type AssignedTeacher,
  type ClassStudent,
} from "@/lib/api/classes";
import { yearGroupLabel } from "@/lib/constants/yearGroups";
import { cn } from "@/lib/utils";
import { longDate } from "@/lib/dates";
import { ConsentPill } from "../Students/ConsentPill";
import {
  Avatar,
  CARD,
  CloseIcon,
  GHOST_BTN,
  Modal,
  NoTeacherYet,
  PausedNote,
  PRIMARY_BTN,
  PlusIcon,
  ROW_DIVIDER,
  RolePill,
  SectionHeading,
  Spinner,
  TEXT_ACTION,
} from "../Roster/primitives";
import { useSetupGate } from "@/hooks";
import { AssignTeacherSheet } from "./AssignTeacherSheet";
import { ClassFormSheet } from "./ClassFormSheet";
import { NoAccess, failureKind } from "../NoAccess";
import { WriteFailed } from "../WriteFailed";

/**
 * D5b Class detail - one class, everything true about it.
 *
 * A full page with the rail still mounted, not a sheet: SCRUM-40's first rule
 * is that lists open into pages, and a class carries more than one decision.
 *
 * ARCHIVE IS NOT DELETE. It sits below a rule at the page foot as a quiet text
 * action, never a red button and never in the header, and it confirms before
 * it commits. Archived classes keep every record and can be restored; students
 * and their progress are not affected. The admin set has no red anywhere.
 *
 * THE CONSENT PILL IS BUILT, and a marker here outlived it by long enough to
 * contradict code in its own file. It said "the roster route carries no CONSENT
 * field... the pill is absent until the field exists. This is the single
 * biggest gap on this screen." `ClassStudentResponse.consent` is REQUIRED and
 * is a full `{status, actorId, actorName, timestamp, channel}`; the client type
 * had simply never declared it, so the field arrived on every response and was
 * discarded. `ConsentPill` renders it on every row below.
 *
 * The concern behind that marker was right and still governs: an absent consent
 * object reads as "Unknown", never as "Not sent", and `status` is never dressed
 * up as consent. Getting that wrong misstates a legal fact about a child.
 *
 * ASSIGNMENT DATES ARE ON THE ROWS, and there is no history section. SCRUM-40
 * asks for a collapsed one here and on teacher detail - date, teacher, class,
 * role, who changed it - and a marker here said "No endpoint returns it" while
 * three of those five sat in `teachers` on a call this screen already makes.
 *
 * The section is still not built, on purpose. It would be a second list of the
 * same rows differing only by a date, and the only heading that would justify
 * one is "Assignment history" - which this cannot honestly be, because half a
 * history reads as the whole of one.
 *
 * TODO(api): the two fields that really are missing - WHO CHANGED IT (no actor
 * on any assignment schema) and ENDED assignments (the DELETE returns no body
 * and nothing carries an `endedAt`). Those are what would make it a history.
 */

type Phase = "loading" | "ready" | "failed" | "denied";

export function ClassDetailView({ classId }: { classId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [klass, setKlass] = useState<AdminClass | null>(null);
  const [teachers, setTeachers] = useState<AssignedTeacher[]>([]);
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState(false);
  /** D24 / D01b: every change to a class pauses while setup is unfinished. */
  const { writesPaused } = useSetupGate();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  /*
   * Three writes on this screen ended in a catch that returned the UI to
   * rest - which is exactly what a SUCCESS looks like. Each now has a flag
   * so the refusal is visible where the admin is looking.
   */
  const [archiveFailed, setArchiveFailed] = useState(false);
  const [removeFailed, setRemoveFailed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);

  /*
   * RETURNS ITS CHAIN. It did not, so `.then(load)` on the restore resolved in
   * the same microtask and `.finally(() => setRestoring(false))` re-enabled the
   * button while the three GETs were still in flight - the double-click window
   * the guard was added to close, still open, and a refused duplicate then
   * printed "nothing has changed" about a class that HAD been restored.
   */
  const load = useCallback(() => {
    return Promise.all([
      classesApi.get(classId),
      classesApi.classTeachers(classId),
      classesApi.classStudents(classId),
    ])
      .then(([c, t, s]) => {
        setKlass(c);
        setTeachers(t);
        setStudents(s);
        setPhase("ready");
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const reload = () => {
    classesApi.classTeachers(classId).then(setTeachers).catch(() => undefined);
    classesApi.get(classId).then(setKlass).catch(() => undefined);
  };

  if (phase === "loading") {
    return (
      <Wrapper>
        <div className={cn(CARD, "h-[420px] animate-pulse")} />
      </Wrapper>
    );
  }

  if (phase === "denied") {
    return (
      <Wrapper>
        <NoAccess what="this class" />
      </Wrapper>
    );
  }

  if (phase === "failed" || !klass) {
    return (
      <Wrapper>
        <div className={cn(CARD, "px-[26px] py-7")}>
          <h3 className="text-[17px] font-semibold text-nevo-near-black">
            We couldn&rsquo;t load this class
          </h3>
          <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
            Nothing has changed - this is only about showing it to you. Try
            again in a moment.
          </p>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setPhase("loading");
                load();
              }}
              className={PRIMARY_BTN}
            >
              Try again
            </button>
            <Link href="/admin/classes" className={GHOST_BTN}>
              Back to classes
            </Link>
          </div>
        </div>
      </Wrapper>
    );
  }

  const archived = Boolean(klass.archivedAt);
  // Where the provider owns the class list, membership is read-only and archive
  // is absent - the school does not hand-edit a synced roster.
  const ssoSourced = klass.source === "roster_sync";

  const meta = [
    yearGroupLabel(klass.yearGroup),
    `${klass.studentCount} ${klass.studentCount === 1 ? "student" : "students"}`,
    klass.subjects.length > 0 ? klass.subjects.join(", ") : null,
  ].filter(Boolean);

  return (
    <Wrapper>
      <Link
        href="/admin/classes"
        className="text-[13.5px] font-semibold text-nevo-navy hover:opacity-75"
      >
        &larr; Classes
      </Link>

      <div className="mt-3 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="m-0 text-[28px] font-semibold tracking-[-0.018em] text-nevo-near-black">
              {klass.name}
            </h2>
            {archived ? (
              <span className="inline-flex items-center rounded-full bg-nevo-violet/24 px-[11px] py-1 text-[11.5px] font-semibold text-nevo-navy">
                Archived
              </span>
            ) : null}
          </div>
          {meta.length > 0 ? (
            <p className="mt-1.5 text-[14.5px] text-nevo-near-black/62">
              {meta.join(" · ")}
            </p>
          ) : null}
        </div>

        {archived ? (
          /*
           * A BLOCK, not a fragment. A fragment made the failure banner a third
           * item of the header's `justify-between` flex row, so it laid out
           * BESIDE the button and squeezed the class name, instead of sitting
           * under it as its `mt-3` intends.
           */
          <div className="flex flex-col items-start">
          <button
            type="button"
            onClick={() => {
              if (restoring) return;
              setRestoring(true);
              setRestoreFailed(false);
              classesApi
                .restore(klass.id)
                .then(load)
                // `.catch(() => undefined)` left the page byte-identical before
                // and after the press, so a broken write and a dead button were
                // indistinguishable - and the button stayed clickable, firing
                // the POST again on every try.
                .catch(() => setRestoreFailed(true))
                .finally(() => setRestoring(false));
            }}
            disabled={restoring || writesPaused}
            className={GHOST_BTN}
          >
            {restoring ? "Restoring…" : "Restore this class"}
          </button>
          {restoreFailed ? (
            <WriteFailed className="mt-3" what="restore this class" />
          ) : null}
          </div>
        ) : !ssoSourced ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={writesPaused}
            className={GHOST_BTN}
          >
            Edit class
          </button>
        ) : null}
      </div>

      <PausedNote className="mt-3" />

      {ssoSourced ? (
        <p className="mt-4 text-[13.5px] leading-[1.55] text-nevo-near-black/62">
          This class comes from your school&rsquo;s connected roster, so its
          membership is managed there.{" "}
          <Link href="/admin/sso" className="font-semibold text-nevo-navy hover:opacity-75">
            IT &amp; SSO
          </Link>
        </p>
      ) : null}

      {/* TEACHERS */}
      <div className="mt-[30px] flex items-center justify-between gap-4">
        <SectionHeading>Teachers for this class</SectionHeading>
        {!archived && !ssoSourced ? (
          <button
            type="button"
            onClick={() => setAssigning(true)}
            disabled={writesPaused}
            className={TEXT_ACTION}
          >
            <PlusIcon size={15} />
            Assign a teacher
          </button>
        ) : null}
      </div>

      <div className={cn(CARD, "mt-3.5")}>
        {teachers.length === 0 ? (
          <div className="px-[22px] py-6">
            <NoTeacherYet />
            <p className="mt-2 text-[13px] leading-[1.5] text-nevo-near-black/58">
              Nobody teaches this class at the moment. Students keep their
              progress either way.
            </p>
          </div>
        ) : (
          teachers.map((t, i) => {
            const name =
              [t.firstName, t.lastName].filter(Boolean).join(" ").trim() ||
              t.email ||
              "Assigned teacher";
            const confirming = removing === t.assignmentId;
            return (
              <div
                key={t.assignmentId}
                className={cn(
                  "px-[22px] py-4",
                  i < teachers.length - 1 && ROW_DIVIDER,
                )}
              >
                <div className="flex items-center gap-3.5">
                  <Avatar name={name} email={t.email} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-nevo-near-black">
                      {name}
                    </div>
                    {t.email ? (
                      <div className="truncate text-[13px] text-nevo-near-black/58">
                        {t.email}
                      </div>
                    ) : null}
                    {longDate(t.assignedAt) ? (
                      <div className="truncate text-[12.5px] text-nevo-near-black/45">
                        {`Assigned ${longDate(t.assignedAt)}`}
                      </div>
                    ) : null}
                  </div>
                  <RolePill role={t.role} />
                  {!archived && !ssoSourced ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRemoveFailed(false);
                        setRemoving(confirming ? null : t.assignmentId);
                      }}
                      aria-label={`Remove ${name} from this class`}
                      className="flex size-[30px] flex-none cursor-pointer items-center justify-center rounded-lg text-nevo-near-black/40 transition-colors hover:bg-nevo-near-black/[0.06] hover:text-nevo-near-black/70"
                    >
                      <CloseIcon size={17} />
                    </button>
                  ) : null}
                </div>

                {/* Inline confirm, not a modal: one line saying what ends and
                    what is kept, then two actions. Removing the last teacher is
                    allowed - a school may genuinely be between staff. */}
                {confirming ? (
                  <div className="mt-3 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3">
                    <p className="m-0 text-[13.5px] leading-[1.5] text-nevo-navy">
                      {name} will no longer see {klass.name} in their console
                      {teachers.length === 1
                        ? ", and the class will have no teacher until you assign one"
                        : ""}
                      {/* SCRUM-40: "His notes on these students stay with the
                          school." This read "Nothing about the students
                          changes", which is a different and weaker claim - it
                          answers a question nobody asked while leaving the one
                          they did ask, about the work their colleague wrote,
                          unanswered. SCRUM-40 is explicit elsewhere that
                          "removing a teacher does not remove or hide what they
                          wrote", so the fact exists and was simply not said. */}
                      . Their notes on these students stay with the school.
                    </p>
                    <div className="mt-3 flex gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          classesApi
                            .removeAssignment(t.assignmentId)
                            .then(() => {
                              setRemoving(null);
                              reload();
                            })
                            // Closing the strip is what SUCCESS looks like, and
                            // a teacher who still holds the class still holds
                            // its children's work.
                            .catch(() => setRemoveFailed(true))
                        }
                        className="cursor-pointer rounded-lg bg-nevo-navy px-4 py-2 text-[13.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110"
                      >
                        Remove from this class
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRemoving(null);
                          setRemoveFailed(false);
                        }}
                        className="cursor-pointer rounded-lg px-4 py-2 text-[13.5px] font-semibold text-nevo-near-black/70 transition-colors hover:bg-nevo-near-black/[0.06]"
                      >
                        Keep them
                      </button>
                    </div>
                    {removeFailed ? (
                      <WriteFailed
                        className="mt-3"
                        what={`remove ${name} from this class`}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {/* Worded identically to the same note on teacher detail: SCRUM-40's
          mirror rule says the second door is a mirror, not a variant. */}
      <p className="mt-2.5 text-[13px] leading-[1.5] text-nevo-near-black/50">
        Dates show when each assignment started. We can&rsquo;t show who made
        the change, or assignments that have ended.
      </p>

      {/* STUDENTS - read-only here, and never any learning data. */}
      <div className="mt-[30px] flex items-center justify-between gap-4">
        <SectionHeading>Students &middot; {klass.studentCount}</SectionHeading>
        {students.length > 0 ? (
          <Link
            href={`/admin/students?class=${klass.id}`}
            className="cursor-pointer text-sm font-semibold text-nevo-navy hover:opacity-75"
          >
            View all &rarr;
          </Link>
        ) : null}
      </div>

      <div className={cn(CARD, "mt-3.5")}>
        {students.length === 0 ? (
          <div className="px-[22px] py-6">
            <p className="m-0 text-sm text-nevo-near-black/62">
              Nobody is enrolled in this class yet.
            </p>
            {!ssoSourced ? (
              <Link href="/admin/invitations" className={cn(TEXT_ACTION, "mt-2.5")}>
                Enrol students
              </Link>
            ) : null}
          </div>
        ) : (
          students.map((s, i) => (
            <Link
              key={s.studentId}
              href={`/admin/students/${s.studentId}`}
              className={cn(
                "flex items-center gap-3 px-[22px] py-[13px] transition-colors hover:bg-nevo-navy/[0.03]",
                i < students.length - 1 && ROW_DIVIDER,
              )}
            >
              <Avatar name={s.displayName} size={32} />
              <span className="flex-1 truncate text-[14.5px] font-semibold text-nevo-near-black">
                {s.displayName}
              </span>
              {/* The same pill the roster shows, from a field that was on the
                  wire all along - see `ClassStudent.consent`. */}
              <ConsentPill consent={s.consent} />
            </Link>
          ))
        )}
      </div>

      {/* ARCHIVE - below the rule, quiet, and never in the header. */}
      {!archived && !ssoSourced ? (
        <div className="mt-[26px] border-t border-nevo-near-black/10 pt-5">
          <button
            type="button"
            onClick={() => setConfirmArchive(true)}
            disabled={writesPaused}
            className={TEXT_ACTION}
          >
            Archive this class
          </button>
          <p className="mt-1.5 max-w-[520px] text-[13px] leading-[1.5] text-nevo-near-black/55">
            Archiving keeps the records but removes the class from active lists.
            Students and their progress are not affected.
          </p>
        </div>
      ) : null}

      {assigning ? (
        <AssignTeacherSheet
          classId={klass.id}
          className={klass.name}
          classSubtitle={yearGroupLabel(klass.yearGroup)}
          assigned={teachers}
          onClose={() => setAssigning(false)}
          onAssigned={() => {
            setAssigning(false);
            reload();
          }}
        />
      ) : null}

      {editing ? (
        <ClassFormSheet
          existing={klass}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      ) : null}

      {confirmArchive ? (
        <ArchiveConfirm
          className={klass.name}
          onCancel={() => {
            setConfirmArchive(false);
            setArchiveFailed(false);
          }}
          failed={archiveFailed}
          onConfirm={() => {
            setArchiveFailed(false);
            classesApi
              .archive(klass.id)
              .then(() => {
                setConfirmArchive(false);
                load();
              })
              /*
               * WAS `.catch(() => setConfirmArchive(false))` - the refusal
               * closed the dialog exactly as a success does, so an admin whose
               * archive 403'd watched the confirmation disappear and moved on.
               * The class stayed on every active list. Hold the dialog open and
               * say so.
               */
              .catch(() => setArchiveFailed(true));
          }}
        />
      ) : null}
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[840px]">{children}</div>
    </div>
  );
}

/**
 * A centred modal per G1 - the one place this screen interrupts, because
 * archiving changes what the school sees everywhere else. It says what is kept
 * before it asks.
 */
function ArchiveConfirm({
  className,
  failed,
  onCancel,
  onConfirm,
}: {
  className: string;
  /** The archive was refused. Stop the spinner and say so. */
  failed: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [pressed, setPressed] = useState(false);

  /*
   * DERIVED, not latched. `pressed` used to be the whole story and was only
   * ever cleared by the dialog unmounting - which is what the failure path did,
   * because its catch closed the dialog. Now that a refusal HOLDS the dialog
   * open, a latched spinner would read "Archiving…" forever on a class that was
   * never archived. A refusal is by definition no longer in flight.
   */
  const working = pressed && !failed;
  return (
    <Modal
      /* `working` is already a faithful in-flight flag: true from the press
         until either the archive lands (and the parent unmounts this) or a
         refusal arrives. No separate state needed. */
      busy={working}
      title="Archive this class?"
      subtitle={className}
      onClose={onCancel}
      footer={
        working ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
            <Spinner />
            <span className="text-sm text-nevo-near-black/60">Archiving…</span>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setPressed(true);
                onConfirm();
              }}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              Archive this class
            </button>
            <button type="button" onClick={onCancel} className={GHOST_BTN}>
              Keep it active
            </button>
          </>
        )
      }
    >
      <p className="m-0 text-[14.5px] leading-[1.6] text-nevo-near-black/72">
        {className} will come off your active lists. Every record is kept, and
        the students in it keep their progress - nothing is deleted. You can
        restore the class at any time.
      </p>
      {failed ? (
        <WriteFailed className="mt-4" what="archive this class" />
      ) : null}
    </Modal>
  );
}
