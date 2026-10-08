"use client";

import { useState } from "react";
import { useTeacherClasses } from "@/hooks/useTeacherClasses";
import {
  applyToAssignments,
  type Assignment,
} from "@/lib/api/assignments";

/**
 * Who this lesson is set for, and the two ways to change it.
 *
 * WHY THIS EXISTS. `PATCH` and `DELETE /api/v1/assignments/{id}` have both been
 * in the deployed spec for weeks with no caller: `assignmentsApi` had only
 * `create` and `list`. So a teacher who assigned the wrong lesson, or assigned
 * to JSS 2B instead of 2A, had no route back inside the product - in front of a
 * school, with children already seeing it.
 *
 * GROUPED BY CLASS, NOT BY ROW. An assignment is per-student even when created
 * for a whole class, so one "assign to JSS 2A" is thirty rows. A teacher does
 * not think in rows; they think "I set this for 2A". Every action here fans out
 * across the group and reports on the group.
 *
 * WHICH MEANS PARTIAL FAILURE IS REAL, and it is the thing this file is most
 * careful about. Thirty writes can half-succeed. This console's most expensive
 * recurring defect is a failed write that looked exactly like a successful one,
 * so nothing here says "cancelled" unless every row came back, and a partial
 * result says plainly how many landed and offers the retry.
 */

type Group = {
  key: string;
  classId: string | null;
  /**
   * The rows an action may touch - NEVER a finished child's.
   *
   * Cancel, set-again and date changes all act on these. A completed row is
   * a child's finished work: cancelling it would overwrite the record that
   * they did it, and moving its due date is moving a deadline on something
   * already handed in.
   */
  ids: string[];
  /** Everyone the lesson was set for, finished or not. */
  students: number;
  /** Of those, how many the actions will actually reach. */
  reachable: number;
  /** How many have already finished it, and so are left alone. */
  finished: number;
  availableFrom: string | null;
  dueAt: string | null;
  cancelled: boolean;
};

type Busy = { key: string; kind: "dates" | "cancel" } | null;

/**
 * WHAT A RETRY REPEATS - the action that produced the partial result.
 *
 * "Try the rest" used to call `cancelGroup` whatever it was retrying. So a
 * teacher who changed a class's dates, saw "Updated for 5 of 7 students" and
 * pressed Try the rest CANCELLED the lesson for the other two children - the
 * opposite of what they asked for, on the one control whose whole job is to
 * finish what they asked for. Restore had the same flaw.
 *
 * REQUIRED on every partial outcome, so a new action cannot produce one
 * without saying how to finish it. That is the whole fix: the button no longer
 * decides what to do; the outcome tells it.
 */
type Again =
  | { action: "cancel" }
  | { action: "restore" }
  | { action: "dates"; changes: DateChanges };

type Outcome =
  | { key: string; kind: "done"; text: string }
  | { key: string; kind: "partial"; text: string; retry: string[]; again: Again }
  | { key: string; kind: "failed"; text: string }
  | null;

export function AssignmentSchedule({
  assignments,
  classes = [],
}: {
  assignments: Assignment[];
  /** The classes this lesson went to, named - from the lesson read itself. */
  classes?: { id: string; name: string }[];
}) {
  // `options`, NOT `classes`. `useTeacherClasses` fills `classes` only on the
  // signed-OUT fixture path and returns `classes: []` for a real teacher, so
  // reading it meant every row on this screen rendered "A class" for the only
  // people who can reach it. `options` carries {id, name} on both paths - its
  // own comment calls it "all any picker or selector actually needs".
  const { options: classOptions, live: classesLive } = useTeacherClasses();
  // Ids this component has itself cancelled. Kept locally rather than
  // refetching: we know exactly which writes the server accepted, so echoing
  // them is honest, and a refetch would need a refresh seam the route does not
  // have. Anything we did NOT successfully change stays as the server sent it.
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());
  // Ids this component has RESTORED. Needed as its own set because a group can
  // arrive already cancelled from the server, in which case there is nothing in
  // `cancelled` to remove - the restoration has to override the wire value.
  const [restored, setRestored] = useState<Set<string>>(new Set());
  const [edited, setEdited] = useState<Record<string, { availableFrom: string | null; dueAt: string | null }>>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const groups = groupByClass(assignments, cancelled, edited, restored);
  if (groups.length === 0) return null;

  /*
   * THE LESSON'S OWN CLASSES FIRST. The names came from the teacher's class
   * list alone, which is the fixture three while it loads and after it fails
   * - none of whose ids match a real class - so every group read "A class",
   * and the cancel confirmation asked "Cancel this lesson for 7 students in A
   * class?". The lesson read already carries each class it went to, by name.
   */
  const nameFor = (classId: string | null) => {
    if (!classId) return "Individual students";
    return (
      classes.find((c) => c.id === classId)?.name ??
      (classesLive ? classOptions.find((c) => c.id === classId)?.name : null) ??
      "A class"
    );
  };

  async function cancelGroup(g: Group) {
    setBusy({ key: g.key, kind: "cancel" });
    setOutcome(null);
    const { ok, failed } = await applyToAssignments(g.ids, { status: "cancelled" });
    setCancelled((prev) => new Set([...prev, ...ok]));
    setBusy(null);
    setConfirming(null);
    if (failed.length === 0) {
      setOutcome({ key: g.key, kind: "done", text: "Cancelled. Students will no longer see this lesson." });
    } else if (ok.length === 0) {
      setOutcome({ key: g.key, kind: "failed", text: "Nothing was cancelled. Please try again." });
    } else {
      // The honest case, and the one worth writing out in full.
      setOutcome({
        key: g.key,
        kind: "partial",
        text: `Cancelled for ${ok.length} of ${g.ids.length} students. The rest still have it.`,
        retry: failed,
        again: { action: "cancel" },
      });
    }
  }

  async function restoreGroup(g: Group) {
    setBusy({ key: g.key, kind: "cancel" });
    setOutcome(null);
    const { ok, failed } = await applyToAssignments(g.ids, { status: "assigned" });
    setRestored((prev) => new Set([...prev, ...ok]));
    setCancelled((prev) => {
      const next = new Set(prev);
      for (const id of ok) next.delete(id);
      return next;
    });
    setBusy(null);
    setOutcome(
      failed.length === 0
        ? { key: g.key, kind: "done", text: "Set again. Students can see this lesson." }
        : ok.length === 0
          ? { key: g.key, kind: "failed", text: "Nothing was set again. Please try again." }
          : {
              key: g.key,
              kind: "partial",
              text: `Set again for ${ok.length} of ${g.ids.length} students.`,
              retry: failed,
              again: { action: "restore" },
            },
    );
  }

  async function saveDates(g: Group, changes: DateChanges) {
    setBusy({ key: g.key, kind: "dates" });
    setOutcome(null);
    // Only the field the teacher changed (C03): sending both rewrote an
    // untouched opening time every time a due date moved.
    const { ok, failed } = await applyToAssignments(g.ids, changes);
    setBusy(null);
    if (ok.length > 0) {
      setEdited((prev) => {
        const next = { ...prev };
        for (const id of ok) {
          next[id] = {
            availableFrom:
              "availableFrom" in changes ? (changes.availableFrom ?? null) : g.availableFrom,
            dueAt: "dueAt" in changes ? (changes.dueAt ?? null) : g.dueAt,
          };
        }
        return next;
      });
    }
    if (failed.length === 0) {
      setEditing(null);
      setOutcome({ key: g.key, kind: "done", text: "Dates updated." });
    } else if (ok.length === 0) {
      setOutcome({ key: g.key, kind: "failed", text: "Nothing was changed. Please try again." });
    } else {
      setOutcome({
        key: g.key,
        kind: "partial",
        text: `Updated for ${ok.length} of ${g.ids.length} students. The rest keep the old dates.`,
        retry: failed,
        again: { action: "dates", changes },
      });
    }
  }

  /** Finish a partial write: the same action, on only the rows that failed. */
  function tryTheRest(g: Group, retry: string[], again: Again) {
    const rest = { ...g, ids: retry, students: retry.length };
    if (again.action === "cancel") return cancelGroup(rest);
    if (again.action === "restore") return restoreGroup(rest);
    return saveDates(rest, again.changes);
  }

  return (
    <section className="mt-9">
      <h3 className="text-[11px] font-bold tracking-[0.14em] text-nevo-violet uppercase">
        Who this is set for
      </h3>

      <div className="mt-3 flex flex-col gap-2.5">
        {groups.map((g) => {
          const working = busy?.key === g.key;
          const said = outcome?.key === g.key ? outcome : null;
          return (
            <div
              key={g.key}
              className="rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[16px] font-semibold text-nevo-near-black">
                      {nameFor(g.classId)}
                    </span>
                    {g.cancelled && (
                      <span className="rounded-full bg-nevo-near-black/8 px-2.5 py-0.5 text-[11.5px] font-semibold text-nevo-near-black/60">
                        Cancelled
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[13.5px] text-nevo-near-black/62">
                    {g.students} {g.students === 1 ? "student" : "students"}
                    {" · "}
                    {describeWindow(g.availableFrom, g.dueAt)}
                  </p>
                  {/* PATCH was chosen over DELETE precisely because it is
                      reversible. Without this the argument was theoretical, and
                      a teacher who cancelled the wrong class was left in the
                      same dead end the whole change set out to remove. */}
                  {g.cancelled && (
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void restoreGroup(g)}
                      className="mt-2 cursor-pointer text-[13.5px] font-semibold text-nevo-navy underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {working ? "Setting again…" : "Set it again"}
                    </button>
                  )}
                </div>

                {!g.cancelled && g.ids.length > 0 && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => {
                        setOutcome(null);
                        setEditing(editing === g.key ? null : g.key);
                      }}
                      className="cursor-pointer rounded-[9px] border border-nevo-navy/22 px-3 py-1.5 text-[13.5px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/5 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Change dates
                    </button>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => {
                        setOutcome(null);
                        setEditing(null);
                        setConfirming(confirming === g.key ? null : g.key);
                      }}
                      className="cursor-pointer rounded-[9px] px-3 py-1.5 text-[13.5px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/5 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Cancel lesson
                    </button>
                  </div>
                )}
              </div>

              {editing === g.key && !g.cancelled && (
                <DateForm
                  availableFrom={g.availableFrom}
                  dueAt={g.dueAt}
                  busy={working && busy?.kind === "dates"}
                  onCancel={() => setEditing(null)}
                  onSave={(changes) => void saveDates(g, changes)}
                />
              )}

              {confirming === g.key && !g.cancelled && (
                <div className="mt-3.5 rounded-[10px] bg-nevo-violet/14 p-3.5">
                  {/* Named plainly. A teacher cancelling for a class is doing
                      something to real children's screens, and the count is the
                      fact that makes it clear which class they picked. */}
                  <p className="text-[14px] leading-[1.5] text-nevo-near-black/80">
                    {/* The count is who the cancel will REACH. A child who has
                        finished is left alone, so counting them here would
                        tell a teacher they were cancelling for someone they
                        are not - and a teacher who reads "7" and sees 6 go is
                        left wondering what happened to the seventh. */}
                    Cancel this lesson for {g.reachable}{" "}
                    {g.reachable === 1 ? "student" : "students"} in{" "}
                    {nameFor(g.classId)}? They will no longer see it. You can set
                    it again afterwards.
                    {g.finished > 0 &&
                      (g.finished === 1
                        ? " The student who has already finished it keeps it."
                        : ` The ${g.finished} students who have already finished it keep it.`)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void cancelGroup(g)}
                      className="cursor-pointer rounded-[9px] bg-nevo-navy px-3.5 py-1.5 text-[13.5px] font-semibold text-nevo-cream disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {working ? "Cancelling…" : "Yes, cancel it"}
                    </button>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => setConfirming(null)}
                      className="cursor-pointer rounded-[9px] px-3.5 py-1.5 text-[13.5px] font-semibold text-nevo-navy disabled:cursor-not-allowed"
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              )}

              {said && (
                <p
                  role="status"
                  className="mt-3 text-[13.5px] leading-[1.5] text-nevo-near-black/70"
                >
                  {said.text}
                  {said.kind === "partial" && (
                    <button
                      type="button"
                      onClick={() => void tryTheRest(g, said.retry, said.again)}
                      className="ml-2 cursor-pointer font-semibold text-nevo-navy underline underline-offset-2"
                    >
                      Try the rest
                    </button>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DateForm({
  availableFrom,
  dueAt,
  busy,
  onSave,
  onCancel,
}: {
  availableFrom: string | null;
  dueAt: string | null;
  busy: boolean;
  onSave: (changes: DateChanges) => void;
  onCancel: () => void;
}) {
  const [opens, setOpens] = useState(toDateInput(availableFrom));
  const [due, setDue] = useState(toDateInput(dueAt));
  // `availableFrom` is when it OPENS and `dueAt` is when it is DUE - separate
  // fields that must not be mapped onto each other. A lesson that opens after
  // it is due is not a schedule, it is a mistake, so it is refused here rather
  // than sent.
  const backwards = Boolean(opens && due && opens > due);
  /** What the teacher actually moved - the rest is left exactly as it was. */
  const changes: DateChanges = {};
  if (opens !== toDateInput(availableFrom)) {
    changes.availableFrom = onDay(opens, availableFrom, "start");
  }
  if (due !== toDateInput(dueAt)) changes.dueAt = onDay(due, dueAt, "end");
  const unchanged = Object.keys(changes).length === 0;

  return (
    <div className="mt-3.5 rounded-[10px] bg-nevo-cream p-3.5">
      <div className="flex flex-wrap gap-3.5">
        <label className="text-[13px] font-medium text-nevo-near-black/70">
          Opens
          <input
            type="date"
            value={opens}
            onChange={(e) => setOpens(e.target.value)}
            className="mt-1 block rounded-[8px] border border-nevo-navy/20 bg-nevo-cream-elevated px-2.5 py-1.5 text-[14px] text-nevo-near-black"
          />
        </label>
        <label className="text-[13px] font-medium text-nevo-near-black/70">
          Due
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="mt-1 block rounded-[8px] border border-nevo-navy/20 bg-nevo-cream-elevated px-2.5 py-1.5 text-[14px] text-nevo-near-black"
          />
        </label>
      </div>

      {backwards && (
        <p role="alert" className="mt-2.5 text-[13px] text-nevo-navy">
          A lesson cannot be due before it opens.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy || backwards || unchanged}
          onClick={() => onSave(changes)}
          className="cursor-pointer rounded-[9px] bg-nevo-navy px-3.5 py-1.5 text-[13.5px] font-semibold text-nevo-cream disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "Saving…" : "Save dates"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="cursor-pointer rounded-[9px] px-3.5 py-1.5 text-[13.5px] font-semibold text-nevo-navy disabled:cursor-not-allowed"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

/**
 * One row per class the lesson was set for. `classId` is null for anything
 * assigned to individuals, and those collapse into a single group rather than
 * one per child - a teacher who picked six names set one thing, not six.
 */
export function groupByClass(
  assignments: Assignment[],
  cancelled: Set<string>,
  edited: Record<string, { availableFrom: string | null; dueAt: string | null }>,
  restored: Set<string> = new Set(),
): Group[] {
  const by = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const key = a.classId ?? "__individual__";
    const list = by.get(key);
    if (list) list.push(a);
    else by.set(key, [a]);
  }

  return [...by.entries()].map(([key, rows]) => {
    const first = rows[0];
    const override = edited[first.id];
    const open = rows.filter((r) => r.status !== "completed");
    return {
      key,
      classId: first.classId,
      ids: open.map((r) => r.id),
      students: new Set(rows.map((r) => r.studentId)).size,
      reachable: new Set(open.map((r) => r.studentId)).size,
      finished: new Set(
        rows.filter((r) => r.status === "completed").map((r) => r.studentId),
      ).size,
      availableFrom: override ? override.availableFrom : first.availableFrom,
      dueAt: override ? override.dueAt : first.dueAt,
      // Cancelled only when EVERY row still open is - a group with one live
      // row is still set for that child, and saying otherwise would be a lie
      // about who can see the lesson. Finished rows are neither: a child who
      // has done the work is not "cancelled", and must not stop a group being.
      // A restoration overrides both the local cancel and the wire value: it
      // is the most recent thing we know actually happened on the server.
      cancelled:
        open.length > 0 &&
        open.every(
          (r) =>
            !restored.has(r.id) &&
            (cancelled.has(r.id) || r.status === "cancelled"),
        ),
    };
  });
}

/** "Opens 3 Oct · due 10 Oct", or the honest absence of either. */
export function describeWindow(
  availableFrom: string | null,
  dueAt: string | null,
): string {
  const opens = shortDate(availableFrom);
  const due = shortDate(dueAt);
  if (opens && due) return `opens ${opens} · due ${due}`;
  if (opens) return `opens ${opens}`;
  if (due) return `due ${due}`;
  return "no dates set";
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** A date edit: only the fields present are sent. */
export type DateChanges = { availableFrom?: string | null; dueAt?: string | null };

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * ISO timestamp to the `yyyy-mm-dd` an `<input type="date">` wants - IN THE
 * TEACHER'S OWN DAY (C03). This took the UTC date, so a lesson set to open
 * between midnight and 01:00 in Lagos showed the day before.
 */
export function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Back again, onto the chosen day. An empty box means "no date", which is a
 * real value here.
 *
 * KEEPING THE TIME IT HAD (C03). This wrote midnight UTC whatever the date had
 * been: the wizard schedules a lesson for 08:00, and moving it a day here
 * moved it to 01:00 as well. A date that had a time keeps it; one that had
 * none starts at the beginning of the day if it opens, and runs to the end of
 * the day if it is due - "due Friday" is due by the end of Friday, not before
 * it starts.
 */
export function onDay(
  value: string,
  had: string | null,
  fresh: "start" | "end",
): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  const before = had ? new Date(had) : null;
  const at =
    before && !Number.isNaN(before.getTime())
      ? new Date(before)
      : fresh === "start"
        ? new Date(y, m - 1, d, 0, 0, 0, 0)
        : new Date(y, m - 1, d, 23, 59, 0, 0);
  at.setFullYear(y, m - 1, d);
  return at.toISOString();
}
