"use client";

import { useCallback, useEffect, useState } from "react";
import { classesApi, type AdminClass, type AssignedClass } from "@/lib/api/classes";
import { yearGroupLabel } from "@/lib/constants/yearGroups";
import { teachersApi, type TeacherDetail, type TeacherSummary } from "@/lib/api/teachers";
import { cn } from "@/lib/utils";
import { isActive } from "./status";
import {
  CheckIcon,
  FailureLine,
  GHOST_BTN,
  PRIMARY_BTN,
  RolePill,
  Sheet,
  Spinner,
} from "../Roster/primitives";

/**
 * D6b Remove admin-side access - the reassignment sheet.
 *
 * SCRUM-40's fourth rule: REMOVING A TEACHER NEVER ORPHANS A CLASS. A teacher
 * who holds classes cannot be removed until every one of those classes has
 * somewhere to go, so the commit does not enable until each row is resolved.
 * With no classes held, the sheet collapses to a calm confirm about access
 * rather than about the person.
 *
 * Where they are Primary, the replacement takes Primary - a class must keep
 * exactly one. Where they are Co-teacher, the row also offers "just remove
 * them from this class", because the class already has a primary and nothing
 * is orphaned by their leaving.
 *
 * WHAT THE SPEC ASKS FOR AND THE API CANNOT DO. SCRUM-40 wants
 * `POST teacher/:id/revoke_access { reassignments: [...] }` applied as ONE
 * transaction, and says a partial apply is not a valid outcome. The deployed
 * API has no such endpoint: `POST /api/v1/teachers/{id}/revoke` takes no body,
 * and reassignment is N separate calls. So this sheet sequences them - every
 * class first, revocation last - and if a step fails it STOPS BEFORE REVOKING
 * and says exactly where it got to.
 *
 * That ordering is deliberate. It preserves the property the rule actually
 * protects - no class is ever left without a teacher - even though it cannot
 * preserve atomicity. A half-applied run leaves some classes handed over and
 * the teacher still holding their console, which is recoverable and visible.
 * The reverse order would not be. Raised with backend; the fix is the endpoint
 * the spec already describes.
 */

type Resolution =
  | { kind: "unresolved" }
  | { kind: "reassign"; toTeacherId: string }
  | { kind: "remove" };

type Phase = "idle" | "working" | "failed" | "partial" | "done";

/**
 * THE STAFF READ HAS THREE OUTCOMES AND THIS SHEET COLLAPSED THEM INTO ONE.
 *
 * `staff: []` is the value on first render, the value after a failure, and the
 * value for a school that genuinely has nobody else active - and all three
 * rendered the same thing: every select showing only its placeholder, the
 * commit permanently disabled, and not a word on screen about why. An admin
 * removing a teacher mid-term met a sheet that could not be completed and did
 * not say so.
 *
 * `AssignTeacherSheet` already learned this lesson and carries exactly this
 * three-way read; the same hole was left open here.
 */
type StaffRead = "loading" | "ready" | "failed";

export function RemoveAccessSheet({
  teacher,
  held,
  classes = [],
  onClose,
  onRemoved,
}: {
  teacher: TeacherDetail;
  held: AssignedClass[];
  /**
   * The school's classes, for D06b's row meta - "Year 8 · 34 students" - which
   * tells an admin which class they are handing over before they choose who
   * takes it. The teacher page already holds them; a class it could not see
   * simply shows no meta.
   */
  classes?: AdminClass[];
  /**
   * `changed` is true when any assignment moved before the sheet closed - a
   * partial hand-over. The parent must reload, or reopening the sheet builds
   * its plan from `held` as it was, and the retry reassigns classes that
   * have already moved, and fails.
   */
  onClose: (changed: boolean) => void;
  onRemoved: () => void;
}) {
  const [staff, setStaff] = useState<TeacherSummary[]>([]);
  const [plan, setPlan] = useState<Record<string, Resolution>>(() =>
    Object.fromEntries(held.map((h) => [h.assignmentId, { kind: "unresolved" } as Resolution])),
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [applied, setApplied] = useState(0);
  /** Every way out of the sheet says whether anything moved on the way. */
  const close = () => onClose(applied > 0);
  const [read, setRead] = useState<StaffRead>("loading");

  const loadStaff = useCallback(() => {
    /*
     * ACTIVE STAFF ONLY. This filtered on identity alone, so the select
     * offered every teacher in the school including deactivated and invited
     * ones - and handing a class to someone who cannot sign in produces
     * exactly the orphaned class this sheet exists to prevent. `isActive` was
     * already written and unit-tested next door; it simply was not called.
     */
    teachersApi
      .list()
      .then((rows) => {
        setStaff(rows.filter((t) => t.id !== teacher.id && isActive(t.status)));
        setRead("ready");
      })
      .catch(() => {
        // "There is nobody else to hand these to" is a claim about the
        // school's staff, and a failed GET does not license it.
        setStaff([]);
        setRead("failed");
      });
  }, [teacher.id]);

  /** Pressing Try again must visibly do something, even if it fails again. */
  const retryStaff = () => {
    setRead("loading");
    loadStaff();
  };

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const firstName = teacher.name.split(" ").filter(Boolean).slice(-1)[0] ?? teacher.name;
  const outstanding = held.filter((h) => plan[h.assignmentId]?.kind === "unresolved").length;
  const ready = outstanding === 0;

  const apply = async () => {
    setPhase("working");
    let done = 0;
    try {
      // Classes first, always. Only once every one of them has a teacher does
      // the console access go.
      for (const h of held) {
        const r = plan[h.assignmentId];
        if (r.kind === "reassign") {
          await classesApi.reassign(h.assignmentId, {
            newTeacherId: r.toTeacherId,
            role: h.role,
          });
        } else if (r.kind === "remove") {
          await classesApi.removeAssignment(h.assignmentId);
        }
        done += 1;
        setApplied(done);
      }
      await teachersApi.revoke(teacher.id);
      /*
       * THE SHEET HOLDS FOR ITS CONFIRMATION, and it used to close straight
       * onto a list where the teacher was still present - the reload happens
       * in the parent, after this - so an admin who had just spent four
       * selects handing over four classes was returned to a screen that looked
       * exactly as it had before, with nothing saying it had worked.
       */
      setPhase("done");
      // Let the confirmation be read before the sheet goes, matching the
      // assign flow's own settle.
      setTimeout(onRemoved, 1400);
    } catch {
      // Nothing was revoked - that call is last and only runs if the loop
      // completed. Say which it is rather than claiming nothing changed.
      setPhase(done > 0 ? "partial" : "failed");
    }
  };

  // No classes held: a calm confirm about access, not about the person.
  if (held.length === 0) {
    return (
      <Sheet
      busy={phase === "working"}
        title="Remove access?"
        subtitle={teacher.name}
        onClose={close}
        footer={
          phase === "working" ? (
            <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
              <Spinner />
              <span className="text-sm text-nevo-near-black/60">Removing access…</span>
            </div>
          ) : phase === "done" ? (
            <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
              <span className="flex size-[26px] flex-none items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop">
                <CheckIcon />
              </span>
              <span className="text-[14.5px] font-semibold text-nevo-navy">
                {firstName} can no longer open their console
              </span>
            </div>
          ) : phase === "failed" ? (
            <>
              <FailureLine>
                That didn&rsquo;t complete, and nothing has changed.
                We&rsquo;re on it.
              </FailureLine>
              <button type="button" onClick={apply} className={PRIMARY_BTN}>
                Try again
              </button>
              {/* SCRUM-40: "Primary 'Try again', secondary 'Close'." A failure with
                  one way out holds the sheet open until it succeeds. */}
              <button type="button" onClick={close} className={GHOST_BTN}>
                Close
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={apply}
                className={cn(PRIMARY_BTN, "flex-1 justify-center")}
              >
                Remove access
              </button>
              <button type="button" onClick={close} className={GHOST_BTN}>
                Cancel
              </button>
            </>
          )
        }
      >
        <p className="m-0 text-[14.5px] leading-[1.6] text-nevo-near-black/72">
          {teacher.name} will no longer be able to open their Nevo console.
          Their classes and notes stay with the school, and you can restore
          access later.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      busy={phase === "working"}
      title="Remove admin-side access"
      subtitle={teacher.name}
      onClose={close}
      widthClass="max-w-[472px]"
      footer={
        phase === "working" ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
            <Spinner />
            <span className="text-sm text-nevo-near-black/60">
              Handing over {applied} of {held.length}…
            </span>
          </div>
        ) : phase === "done" ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
            <span className="flex size-[26px] flex-none items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop">
              <CheckIcon />
            </span>
            <span className="text-[14.5px] font-semibold text-nevo-navy">
              {held.length} {held.length === 1 ? "class" : "classes"} handed
              over. {firstName} can no longer open their console.
            </span>
          </div>
        ) : phase === "partial" ? (
          <>
            <FailureLine>
              {applied} of {held.length} classes were handed over before this
              stopped. {firstName} still has access - nothing was revoked. You
              can pick up where it left off.
            </FailureLine>
            <button type="button" onClick={close} className={PRIMARY_BTN}>
              Close
            </button>
          </>
        ) : phase === "failed" ? (
          <>
            <FailureLine>
              That didn&rsquo;t complete, and nothing has changed. We&rsquo;re
              on it.
            </FailureLine>
            <button type="button" onClick={apply} className={PRIMARY_BTN}>
              Try again
            </button>
            {/* SCRUM-40: "Primary 'Try again', secondary 'Close'." A failure with
                one way out holds the sheet open until it succeeds. */}
            <button type="button" onClick={close} className={GHOST_BTN}>
              Close
            </button>
          </>
        ) : ready ? (
          <>
            <button
              type="button"
              onClick={apply}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              Reassign and remove access
            </button>
            <button type="button" onClick={close} className={GHOST_BTN}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {/* Neutral, not a warning: a count of what is left to decide. */}
            <p className="m-0 flex-1 text-[13.5px] text-nevo-near-black/60">
              {outstanding} of {held.length}{" "}
              {held.length === 1 ? "class" : "classes"} still{" "}
              {outstanding === 1 ? "needs" : "need"} a teacher.
            </p>
            <button type="button" disabled className={PRIMARY_BTN}>
              Reassign and remove access
            </button>
          </>
        )
      }
    >
      <p className="m-0 text-[14.5px] leading-[1.6] text-nevo-near-black/72">
        {teacher.name} teaches {held.length}{" "}
        {held.length === 1 ? "class" : "classes"}. Choose who takes each one,
        and we&rsquo;ll hand them over as they go.
      </p>

      {/*
        * SAY WHICH OF THE THREE IT IS. An empty `staff` used to render the
        * same silent, uncompletable sheet whether the read was still in
        * flight, had failed, or had honestly come back with nobody - so an
        * admin sat in front of selects that would not open and a commit that
        * would not enable, with nothing to act on.
        */}
      {read === "loading" ? (
        <p className="m-0 flex items-center gap-2.5 text-[13.5px] text-nevo-near-black/60">
          <Spinner />
          Loading your staff list…
        </p>
      ) : read === "failed" ? (
        <div className="rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3">
          <p className="m-0 text-[13.5px] leading-[1.5] text-nevo-navy">
            We couldn&rsquo;t load your staff list just now, so there is nobody
            to choose from. Nothing has changed for {firstName}.
          </p>
          <button
            type="button"
            onClick={retryStaff}
            className="mt-2 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
          >
            Try again
          </button>
        </div>
      ) : staff.length === 0 ? (
        <p className="m-0 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-navy">
          There is no one else active to hand these classes to. You can still
          remove {firstName} from each class below &ndash; they will be left
          without a teacher until you assign one.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {held.map((h) => {
          const r = plan[h.assignmentId];
          const value =
            r.kind === "reassign" ? r.toTeacherId : r.kind === "remove" ? "__remove" : "";
          return (
            <div
              key={h.assignmentId}
              className="rounded-xl border-[1.5px] border-nevo-near-black/14 bg-nevo-cream-elevated px-4 py-3.5"
            >
              <div className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-semibold text-nevo-near-black">
                    {h.className}
                  </span>
                  {(() => {
                    const info = classes.find((c) => c.id === h.classId);
                    const meta = info
                      ? [
                          yearGroupLabel(info.yearGroup),
                          `${info.studentCount} ${info.studentCount === 1 ? "student" : "students"}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : null;
                    return meta ? (
                      <span className="truncate text-[13px] text-nevo-near-black/58">{meta}</span>
                    ) : null;
                  })()}
                </span>
                <RolePill role={h.role} />
              </div>
              <label className="mt-3 block">
                <span className="sr-only">Who takes {h.className}?</span>
                <select
                  value={value}
                  disabled={read === "loading"}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPlan((prev) => ({
                      ...prev,
                      [h.assignmentId]:
                        v === ""
                          ? { kind: "unresolved" }
                          : v === "__remove"
                            ? { kind: "remove" }
                            : { kind: "reassign", toTeacherId: v },
                    }));
                  }}
                  className="h-[46px] w-full cursor-pointer rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-3.5 text-sm text-nevo-near-black outline-none transition-colors focus:border-nevo-navy"
                >
                  <option value="">Choose who takes this class</option>
                  {staff.map((t) => (
                    <option key={t.id} value={t.id}>
                      {h.role === "primary" ? `${t.name} — as Primary` : t.name}
                    </option>
                  ))}
                  {/*
                    * Offered where the class keeps its primary regardless -
                    * AND on a Primary row when there is nobody else to hand
                    * it to. The note above tells the admin "you can still
                    * remove them from each class below", and a Primary row
                    * with no remove option left the commit disabled behind
                    * that instruction, with no way through.
                    */}
                  {h.role === "co_teacher" || (read === "ready" && staff.length === 0) ? (
                    <option value="__remove">
                      Just remove {firstName} from this class
                    </option>
                  ) : null}
                </select>
              </label>
            </div>
          );
        })}
      </div>

      {ready ? (
        <p className="m-0 rounded-[10px] bg-nevo-violet/24 px-4 py-3 text-[13.5px] leading-[1.55] text-nevo-navy">
          {/* "...and you can restore access later" was cut: the contract has
              `POST /teachers/{id}/revoke` and nothing that undoes it, so the
              sentence promised a button that does not exist. */}
          {firstName}&rsquo;s classes will be handed over first, then their
          console access ends. Their notes stay with the school, attributed to
          them.
        </p>
      ) : null}
    </Sheet>
  );
}
