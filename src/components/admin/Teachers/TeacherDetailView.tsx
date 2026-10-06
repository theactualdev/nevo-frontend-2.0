"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  classesApi,
  type AdminClass,
  type AssignedClass,
} from "@/lib/api/classes";
import { teachersApi, type TeacherDetail } from "@/lib/api/teachers";
import { yearGroupLabel } from "@/lib/constants/yearGroups";
import { cn } from "@/lib/utils";
import { longDate } from "@/lib/dates";
import {
  Avatar,
  CARD,
  GHOST_BTN,
  PausedNote,
  PlusIcon,
  PRIMARY_BTN,
  ROW_DIVIDER,
  RolePill,
  SectionHeading,
  TEXT_ACTION,
} from "../Roster/primitives";
import { useSetupGate } from "@/hooks";
import { AssignTeachingSheet } from "../Classes/AssignTeachingSheet";
import { RemoveAccessSheet } from "./RemoveAccessSheet";
import { StatusPill, isInvited } from "./status";
import { NoAccess, failureKind } from "../NoAccess";

/**
 * D6 teacher detail - oversight, not performance review.
 *
 * The boundary line under the stat cards is a TRUST FEATURE, which is why it is
 * plain text on the page rather than a tooltip: an admin should be able to see,
 * without asking, that this screen stops where it stops. SCRUM-40 asks for it
 * and the frame writes it out.
 *
 * The Students figure is an aggregate headcount of the classes this teacher
 * holds and nothing else. That is the only reason it clears the oversight
 * boundary at all, and the spec forbids it ever gaining a qualifier - no
 * "students at risk", no averages, no engagement figure. If you find yourself
 * adding a second number to that card, stop.
 *
 * TODO(api): `GET /api/v1/teachers/{id}` returns `{id,name,email,status,classIds}`
 * and nothing more. Two things the frame draws therefore cannot be built:
 *   - the LAST ACTIVE stat card (no timestamp anywhere on the route), so the
 *     frame's three cards render as two rather than inventing a third
 *   - the header's "Active today" line, which is the same missing timestamp
 * Both re-verified against the deployed spec on 11 Sep: the only `lastSeenAt`
 * in the contract is on `GET /api/v1/auth/sessions`, which is the caller's own
 * device list and takes no teacher id.
 *
 * THE DATES ARE ON THE ROWS NOW. A third bullet here used to read "ASSIGNMENT
 * HISTORY, which has no endpoint at all", and `GET /api/v1/teachers/{id}
 * /classes` had been returning `assignedAt` and `role` per row into `held`
 * all along, where they were discarded.
 *
 * There is deliberately NO history SECTION - see the note under the class card
 * for the reasoning. What is genuinely missing is the actor and every ENDED
 * assignment, so the dates describe what is still true and claim nothing more.
 *
 * The Students headcount is summed client-side from each class's
 * `studentCount`, because no teacher-level aggregate exists. (This said
 * `student_headcount`, naming a field that was never the one in play.)
 */

type Phase = "loading" | "ready" | "failed" | "denied";

export function TeacherDetailView({ teacherId }: { teacherId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [teacher, setTeacher] = useState<TeacherDetail | null>(null);
  const [held, setHeld] = useState<AssignedClass[]>([]);
  const [allClasses, setAllClasses] = useState<AdminClass[]>([]);
  const [removing, setRemoving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  /** D24 / D01b: assigning and removing access pause while setup is unfinished. */
  const { writesPaused } = useSetupGate();

  const load = useCallback(() => {
    Promise.all([
      teachersApi.get(teacherId),
      classesApi.teacherClasses(teacherId),
      /*
       * INCLUDING ARCHIVED. `list()` excludes them by default, so a teacher
       * still holding a class archived at the end of last term had that class
       * missing from `byId` - and the headcount below coalesced it to 0 while
       * the Classes card counted it. "3 classes" beside a Students figure that
       * silently omitted one of them, presented as flatly as any other number.
       */
      classesApi.list(true),
    ])
      .then(([t, h, all]) => {
        setTeacher(t);
        setHeld(h);
        setAllClasses(all);
        setPhase("ready");
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
  }, [teacherId]);

  useEffect(() => {
    load();
  }, [load]);

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
        <NoAccess what="this teacher" />
      </Wrapper>
    );
  }

  if (phase === "failed" || !teacher) {
    return (
      <Wrapper>
        <div className={cn(CARD, "px-[26px] py-7")}>
          <h3 className="text-[17px] font-semibold text-nevo-near-black">
            We couldn&rsquo;t load this teacher
          </h3>
          <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
            Nothing has changed - this is only about showing them to you. Try
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
            <Link href="/admin/teachers" className={GHOST_BTN}>
              Back to teachers
            </Link>
          </div>
        </div>
      </Wrapper>
    );
  }

  const byId = new Map(allClasses.map((c) => [c.id, c]));
  /*
   * An archived class is not one this teacher is currently teaching, so it is
   * out of both the headcount and the year-group line - and SAID, rather than
   * quietly subtracted.
   */
  const activeHeld = held.filter((h) => !byId.get(h.classId)?.archivedAt);
  const archivedCount = held.length - activeHeld.length;
  /** A class we still cannot see at all: the total is a floor, not a total. */
  const unknown = activeHeld.some((h) => !byId.has(h.classId));
  const headcount = activeHeld.reduce(
    (sum, h) => sum + (byId.get(h.classId)?.studentCount ?? 0),
    0,
  );
  const years = Array.from(
    new Set(
      activeHeld
        .map((h) => yearGroupLabel(byId.get(h.classId)?.yearGroup))
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const firstName = teacher.name.split(" ").filter(Boolean).slice(-1)[0] ?? teacher.name;
  const invited = isInvited(teacher.status);
  /** A deactivated teacher cannot open a console to teach anything in. */
  const canAssign = teacher.status !== "deactivated";

  return (
    <Wrapper>
      <Link
        href="/admin/teachers"
        className="text-[13.5px] font-semibold text-nevo-navy hover:opacity-75"
      >
        &larr; Teachers
      </Link>

      <div className="mt-3 flex items-center gap-4">
        <Avatar name={teacher.name} email={teacher.email} size={56} />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[26px] font-semibold tracking-[-0.018em] text-nevo-near-black">
            {teacher.name}
          </h2>
          <div className="mt-[3px] truncate text-sm text-nevo-near-black/62">
            {[teacher.email, "Teacher"].filter(Boolean).join(" · ")}
          </div>
        </div>
        <StatusPill status={teacher.status} />
      </div>

      {invited ? (
        <p className="mt-5 text-[13.5px] leading-[1.55] text-nevo-near-black/62">
          This teacher hasn&rsquo;t opened their console yet.{" "}
          <Link href="/admin/invitations" className="font-semibold text-nevo-navy hover:opacity-75">
            Manage the invitation
          </Link>
        </p>
      ) : null}

      {/* Two cards, not the frame's three - see the note at the top of the file. */}
      <div className="mt-7 flex gap-3.5 max-lg:flex-col">
        <StatCard
          value={String(activeHeld.length)}
          label="Classes"
          sub={
            archivedCount > 0
              ? `${years.length > 0 ? `across ${years.join(" & ")}, ` : ""}plus ${archivedCount} archived`
              : years.length > 0
                ? `across ${years.join(" & ")}`
                : "none assigned yet"
          }
        />
        <StatCard
          value={String(headcount)}
          label="Students"
          /* A class we cannot see makes this a floor, and the card says so
             rather than presenting a short number as the total. */
          sub={unknown ? "in the classes we could read" : "in their classes"}
        />
      </div>

      <p className="mt-4 flex items-start gap-2 text-[13px] leading-[1.55] text-nevo-near-black/60">
        <LockGlyph />
        <span>
          <span className="font-semibold">What you can see here:</span> how much{" "}
          {teacher.name} is teaching - not how their individual students are
          doing. A student&rsquo;s learning detail stays between them and their
          teacher.
        </span>
      </p>

      <div className="mt-[30px] flex items-center justify-between gap-4">
        <SectionHeading>Classes</SectionHeading>
        {/* SCRUM-40's second door onto D5c. This was a link back to Classes,
            leaving the admin to find the class and start again from there. */}
        {canAssign ? (
          <button
            type="button"
            onClick={() => setAssigning(true)}
            disabled={writesPaused}
            className={TEXT_ACTION}
          >
            <PlusIcon size={15} />
            Assign to a class
          </button>
        ) : null}
      </div>
      {canAssign ? <PausedNote className="mt-2" /> : null}

      <div className={cn(CARD, "mt-3.5")}>
        {held.length === 0 ? (
          <div className="px-[22px] py-6">
            <p className="m-0 text-sm text-nevo-near-black/62">
              {teacher.name} doesn&rsquo;t hold any classes yet.
            </p>
          </div>
        ) : (
          held.map((h, i) => {
            const info = byId.get(h.classId);
            // The card counts ACTIVE classes; without this the list below it
            // shows more rows than the card admits to, and nothing says which
            // of them the card left out.
            const started = longDate(h.assignedAt);
            const meta = [
              info?.archivedAt ? "Archived" : null,
              yearGroupLabel(info?.yearGroup),
              info ? `${info.studentCount} ${info.studentCount === 1 ? "student" : "students"}` : null,
              started ? `assigned ${started}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <Link
                key={h.assignmentId}
                href={`/admin/classes/${h.classId}`}
                className={cn(
                  "flex items-center gap-3.5 px-[22px] py-[15px] transition-colors hover:bg-nevo-navy/[0.03]",
                  i < held.length - 1 && ROW_DIVIDER,
                )}
              >
                <span className="flex-1 truncate text-[15px] font-semibold text-nevo-near-black">
                  {h.className}
                </span>
                {meta ? (
                  <span className="text-[13.5px] text-nevo-near-black/60">{meta}</span>
                ) : null}
                <RolePill role={h.role} />
              </Link>
            );
          })
        )}
      </div>
      {/* NOT A HISTORY, AND IT SAYS SO. SCRUM-40 asks for a collapsed
          ASSIGNMENT HISTORY on both detail screens - date, teacher, class,
          role, and who made the change - and its "done when" requires the log
          to be append-only. Two of those five have no contract: no schema
          carries an actor, and an ended assignment leaves no record at all
          (the DELETE returns no body, and nothing has an `endedAt`). A
          collapsed second list of the SAME rows differing only by a date would
          be a duplicate under the one heading we cannot honestly use, so the
          date sits on the row and this states the limit instead. */}
      <p className="mt-2.5 text-[13px] leading-[1.5] text-nevo-near-black/50">
        Dates show when each assignment started. We can&rsquo;t show who made
        the change, or assignments that have ended.
      </p>

      {/* Removing access is quiet, below a rule, and never a red button. */}
      <div className="mt-[26px] border-t border-nevo-near-black/10 pt-5">
        {teacher.status === "deactivated" ? (
          /* A deactivated teacher's page used to offer "Remove admin-side
             access" again - an action that had already happened. */
          <p className="m-0 max-w-[520px] text-[13.5px] leading-[1.55] text-nevo-near-black/62">
            {firstName}&rsquo;s console access has been removed. Their classes
            and notes stay with the school.
          </p>
        ) : (
          <>
            {/* The paused note sits once, under Classes, as class detail's
                sits once under its header. */}
            <button
              type="button"
              onClick={() => setRemoving(true)}
              disabled={writesPaused}
              className={TEXT_ACTION}
            >
              Remove admin-side access
            </button>
            {/* "...and you can restore access later" was cut: nothing in the
                contract undoes `POST /teachers/{id}/revoke`. */}
            <p className="mt-1.5 max-w-[520px] text-[13px] leading-[1.5] text-nevo-near-black/55">
              {firstName} will no longer be able to open their Nevo console.
              Their classes and notes stay with the school.
            </p>
          </>
        )}
      </div>

      {assigning ? (
        <AssignTeachingSheet
          door={{ kind: "teacher", teacher: { id: teacher.id, name: teacher.name }, held }}
          classes={allClasses}
          onClose={() => setAssigning(false)}
          onAssigned={() => {
            setAssigning(false);
            load();
          }}
        />
      ) : null}

      {removing ? (
        <RemoveAccessSheet
          teacher={teacher}
          held={held}
          classes={allClasses}
          onClose={(changed) => {
            setRemoving(false);
            // A partial hand-over moved some classes: re-read, so reopening
            // plans from what is actually left.
            if (changed) load();
          }}
          onRemoved={() => router.push("/admin/teachers")}
        />
      ) : null}
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[820px]">{children}</div>
    </div>
  );
}

function StatCard({
  value,
  label,
  sub,
}: {
  value: string;
  label: string;
  sub: string;
}) {
  return (
    <div className={cn(CARD, "flex-1 px-[22px] py-5")}>
      <div className="text-[34px] font-semibold leading-none tracking-[-0.02em] text-nevo-navy">
        {value}
      </div>
      <div className="mt-2.5 text-sm font-semibold text-nevo-near-black">{label}</div>
      <div className="mt-0.5 text-[12.5px] text-nevo-near-black/58">{sub}</div>
    </div>
  );
}

function LockGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-[3px] flex-none text-nevo-violet/90"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
