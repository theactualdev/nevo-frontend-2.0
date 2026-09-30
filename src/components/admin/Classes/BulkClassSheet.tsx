"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { sessionLabel } from "./groupByYear";
import {
  classesApi,
  type AdminClass,
  type ClassRejection,
} from "@/lib/api/classes";
import { YEAR_GROUPS, yearGroupLabel, yearGroupOptions } from "@/lib/constants/yearGroups";
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
  SECTION_CHOICES,
  STREAM_CHOICES,
  composeAcrossYears,
  defaultDivision,
  sendable,
  type Division,
} from "./composeClassNames";

/**
 * SCRUM-149 CL-04 — *"the one that saves a school an hour."*
 *
 * A real Nigerian secondary school runs twelve to thirty classes. Single
 * create has been built and reachable for weeks; what was missing was any way
 * to make more than one at a time, which is the actual complaint behind "a
 * school registers and then cannot create a single class".
 *
 * `POST /api/v1/classes/bulk` landed 21 Sep and is what makes this buildable.
 *
 * SEVERAL YEAR GROUPS AT ONCE, AS D05 DRAWS IT. This took one year group per
 * visit and letters only, so a school's JSS 1-3 and SS 1-3 were six trips, and
 * "SS 1 Sciences" could not be made at all. The frame's "Year groups &
 * sections" is a grid: every year group on its own row, lettered SECTIONS or
 * named STREAMS, all composed into one preview and one send. It starts from
 * the year groups the school already has classes in - there is no record of
 * which levels a school runs, and all sixteen would bury the six it does -
 * and any other can be added.
 *
 * THE PREVIEW IS THE POINT, not decoration. CL-04 asks for "a preview listing
 * every class about to be created with a total count", and it earns its place
 * three times over: it shows the composed names before they exist, it marks
 * the ones that already exist so they are never sent, and it is where a school
 * whose naming differs from ours finds that out — while nothing has happened.
 *
 * PARTIAL SUCCESS IS AN ORDINARY OUTCOME. The response is
 * `{created, rejected}`, and every rejection is rendered with the value that
 * caused it. Backend's own schema note says why: *"a school creating thirty
 * classes will not notice a count of failures."* This screen never shows one.
 */

const LABEL = "mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60";
const FIELD =
  "h-[44px] w-full cursor-pointer rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-[13px] text-[14.5px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy";

type Phase = "idle" | "saving" | "failed" | "done";

interface Row {
  yearGroup: string;
  division: Division;
  picked: string[];
}

const newRow = (yearGroup: string): Row => ({
  yearGroup,
  division: defaultDivision(yearGroup),
  picked: [],
});

/** The school's year groups in canonical order, N1 to SS3. */
const byLevel = (a: string, b: string) =>
  (YEAR_GROUPS as readonly string[]).indexOf(a) - (YEAR_GROUPS as readonly string[]).indexOf(b);

export function BulkClassSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** Fired once, after the admin acknowledges the result. */
  onCreated: () => void;
}) {
  /** Null until the school's classes are read - the rows start from them. */
  const [rows, setRows] = useState<Row[] | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [created, setCreated] = useState(0);
  const [rejected, setRejected] = useState<ClassRejection[]>([]);
  /**
   * THIS SHEET FETCHES ITS OWN LIST, AND FETCHES IT WITH ARCHIVED INCLUDED.
   *
   * Taking the parent's `classes` would have been one prop and a silent bug:
   * that array only contains archived rows while the list's "Show archived"
   * toggle happens to be on, so a school with the toggle off would be offered
   * a name that is already taken by an archived class — and archive is
   * reversible and never deletes, so it genuinely is taken.
   *
   * Null means the read has not answered. Collisions are NOT computed against
   * an empty list in that window: showing "12 classes will be created" and
   * then rejecting four is precisely the outcome the preview exists to stop.
   * A failed read says so and offers a retry; it used to leave the sheet
   * composing nothing, with no word why.
   */
  const [existing, setExisting] = useState<readonly AdminClass[] | null>(null);
  const [readFailed, setReadFailed] = useState(false);

  const loadExisting = useCallback(() => {
    classesApi
      .list(true)
      .then((list) => {
        setExisting(list);
        setReadFailed(false);
        // The year groups the school already runs, from its LIVE classes.
        setRows((prev) => {
          if (prev) return prev;
          const years = [
            ...new Set(
              list
                .filter((c) => !c.archivedAt && c.yearGroup)
                .map((c) => c.yearGroup as string),
            ),
          ]
            .filter((y) => yearGroupOptions().some((o) => o.value === y))
            .sort(byLevel);
          return years.map(newRow);
        });
      })
      .catch(() => setReadFailed(true));
  }, []);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  const composed = useMemo(
    () => (rows && existing ? composeAcrossYears(rows, existing) : []),
    [rows, existing],
  );
  const toSend = sendable(composed);
  const alreadyThere = composed.length - toSend.length;
  const session = existing ? sessionLabel([...existing]) : null;

  const shown = new Set((rows ?? []).map((r) => r.yearGroup));
  const addable = yearGroupOptions().filter((o) => !shown.has(o.value));

  const update = (yearGroup: string, change: (r: Row) => Row) =>
    setRows((prev) => (prev ? prev.map((r) => (r.yearGroup === yearGroup ? change(r) : r)) : prev));

  const toggle = (yearGroup: string, option: string) =>
    update(yearGroup, (r) => {
      const choices = r.division === "streams" ? STREAM_CHOICES : SECTION_CHOICES;
      const next = r.picked.includes(option)
        ? r.picked.filter((x) => x !== option)
        : [...r.picked, option];
      // Kept in the order the chips are drawn, so the preview reads A, B, C.
      return { ...r, picked: choices.filter((c) => next.includes(c)) };
    });

  /** Switching how a year divides clears its picks - a letter is not a stream. */
  const switchDivision = (yearGroup: string) =>
    update(yearGroup, (r) => ({
      ...r,
      division: r.division === "streams" ? "sections" : "streams",
      picked: [],
    }));

  const addYear = (yearGroup: string) => {
    if (!yearGroup) return;
    setRows((prev) =>
      [...(prev ?? []), newRow(yearGroup)].sort((a, b) => byLevel(a.yearGroup, b.yearGroup)),
    );
  };

  const submit = () => {
    if (toSend.length === 0) return;
    setPhase("saving");
    classesApi
      .createMany(
        toSend.map((c) => ({
          name: c.name,
          // Each class its own year group - a batch spans several now.
          yearGroup: c.yearGroup,
          section: c.section,
          /*
           * THE SESSION THE SCHOOL IS ALREADY IN, and this sheet was creating
           * classes without one.
           *
           * D05's own count line promises it - *"N classes will be created in
           * the 2026/27 session"* - and the field arrived on every class and
           * was discarded until 23 Sep, so there was nothing to promise with.
           *
           * TAKEN FROM THE SCHOOL'S EXISTING CLASSES, never from the clock.
           * `sessionLabel` is null when they disagree or none of them says, and
           * null is the right thing to send: a session guessed from today's
           * date would be a claim the school never made, stamped on thirty
           * classes at once.
           */
          academicSession: session,
        })),
      )
      .then((res) => {
        setCreated(res.created.length);
        setRejected(res.rejected);
        setPhase("done");
      })
      .catch(() => setPhase("failed"));
  };

  // ------------------------------------------------------------- RESULT ---
  if (phase === "done") {
    return (
      <Sheet
        title={
          created > 0
            ? `${created} ${created === 1 ? "class" : "classes"} created`
            : "Nothing was created"
        }
        onClose={onCreated}
        widthClass="max-w-[472px]"
        footer={
          <button
            type="button"
            onClick={onCreated}
            className={cn(PRIMARY_BTN, "flex-1 justify-center")}
          >
            Done
          </button>
        }
      >
        {created > 0 ? (
          <div className="flex justify-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop">
              <CheckIcon size={22} />
            </span>
          </div>
        ) : null}

        {/*
          * EVERY REJECTION, INDIVIDUALLY. `ClassRejection` carries `index`
          * into the array we sent, so unlike the invitation import there is no
          * numbering ambiguity - the rejection pairs with the exact class the
          * admin asked for, and `value` names what was wrong with it.
          */}
        {rejected.length > 0 ? (
          <div>
            <span className={LABEL}>
              {rejected.length}{" "}
              {rejected.length === 1 ? "was not created" : "were not created"}
            </span>
            <ul className="m-0 list-none space-y-0 overflow-hidden rounded-[10px] border border-nevo-near-black/10 p-0">
              {rejected.map((r) => (
                <li
                  key={`${r.index}-${r.field}`}
                  className="border-b border-nevo-near-black/[0.07] px-3.5 py-2.5 text-[13.5px] leading-[1.5] last:border-b-0"
                >
                  <span className="font-semibold text-nevo-near-black">
                    {toSend[r.index]?.name ?? r.value}
                  </span>{" "}
                  <span className="text-nevo-near-black/72">{r.reason}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] leading-[1.5] text-nevo-near-black/55">
              The rest were created. You can add these individually once
              they&rsquo;re sorted.
            </p>
          </div>
        ) : null}
      </Sheet>
    );
  }

  // --------------------------------------------------------------- FORM ---
  return (
    <Sheet
      busy={phase === "saving"}
      title="Add several at once"
      subtitle="Pick a year group and tick the sections you run. Nevo composes the names."
      onClose={onClose}
      widthClass="max-w-[472px]"
      footer={
        phase === "saving" ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
            <Spinner />
            <span className="text-sm text-nevo-near-black/60">
              Creating {toSend.length}&hellip;
            </span>
          </div>
        ) : phase === "failed" ? (
          <>
            <FailureLine>
              That didn&rsquo;t go through, and no classes were created.
            </FailureLine>
            <button type="button" onClick={submit} className={PRIMARY_BTN}>
              Try again
            </button>
            {/* SCRUM-40: "Primary 'Try again', secondary 'Close'." A failure with
                one way out holds the sheet open until it succeeds. */}
            <button type="button" onClick={onClose} className={GHOST_BTN}>
              Close
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={submit}
              disabled={toSend.length === 0}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              {toSend.length > 0
                ? `Create ${toSend.length} ${toSend.length === 1 ? "class" : "classes"}`
                : "Create classes"}
            </button>
            <button type="button" onClick={onClose} className={GHOST_BTN}>
              Cancel
            </button>
          </>
        )
      }
    >
      {readFailed && !existing ? (
        <ReadFailed
          what="your classes"
          onRetry={() => {
            setReadFailed(false);
            loadExisting();
          }}
        />
      ) : !rows || !existing ? (
        /* Nothing is known yet, so nothing is offered. */
        <p className="m-0 text-[13px] text-nevo-near-black/45">
          Looking up your classes&hellip;
        </p>
      ) : (
        <>
          <div>
            <span className={LABEL}>Year groups &amp; sections</span>
            <div className="flex flex-col gap-3">
              {rows.map((row) => {
                const label = yearGroupLabel(row.yearGroup) ?? row.yearGroup;
                const choices = row.division === "streams" ? STREAM_CHOICES : SECTION_CHOICES;
                return (
                  <div
                    key={row.yearGroup}
                    role="group"
                    aria-label={label}
                    className="rounded-[10px] border border-nevo-near-black/10 px-3.5 py-3"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[14.5px] font-semibold text-nevo-near-black">
                        {label}
                      </span>
                      <button
                        type="button"
                        onClick={() => switchDivision(row.yearGroup)}
                        className="cursor-pointer text-[12.5px] font-medium text-nevo-navy hover:underline"
                      >
                        {row.division === "streams" ? "Streams · use sections" : "Sections · use streams"}
                      </button>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {choices.map((option) => {
                        const on = row.picked.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => toggle(row.yearGroup, option)}
                            aria-pressed={on}
                            className={cn(
                              "flex h-[38px] min-w-[38px] cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] px-2.5 text-[14px] font-semibold transition-colors",
                              on
                                ? "border-nevo-navy bg-nevo-navy text-nevo-cream"
                                : "border-nevo-near-black/16 text-nevo-near-black hover:bg-nevo-near-black/[0.04]",
                            )}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {addable.length > 0 ? (
              <div className="mt-3">
                <label htmlFor="bulk-add-year" className="sr-only">
                  Add a year group
                </label>
                <select
                  id="bulk-add-year"
                  value=""
                  onChange={(e) => addYear(e.target.value)}
                  className={FIELD}
                >
                  <option value="">
                    {rows.length === 0 ? "Choose a year group" : "Add another year group"}
                  </option>
                  {addable.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {composed.length > 0 ? (
            <div>
              <span className={LABEL}>About to be created</span>
              <ul className="m-0 list-none space-y-0 overflow-hidden rounded-[10px] border border-nevo-near-black/10 p-0">
                {composed.map((c) => (
                  <li
                    key={`${c.yearGroup}-${c.section}`}
                    className="flex items-baseline gap-3 border-b border-nevo-near-black/[0.07] px-3.5 py-2.5 text-[14px] leading-[1.5] last:border-b-0"
                  >
                    <span
                      className={cn(
                        "font-semibold",
                        c.collision
                          ? "text-nevo-near-black/45 line-through"
                          : "text-nevo-near-black",
                      )}
                    >
                      {c.name}
                    </span>
                    {c.collision ? (
                      <span className="text-[13px] text-nevo-near-black/60">
                        {c.collision}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[13.5px] leading-[1.5] text-nevo-near-black/70">
                {toSend.length > 0 ? (
                  <>
                    <strong className="font-semibold text-nevo-near-black">
                      {toSend.length} {toSend.length === 1 ? "class" : "classes"}
                    </strong>{" "}
                    {/* The session only when the school's classes agree on one. */}
                    {session
                      ? `will be created in the ${session} session.`
                      : "will be created."}
                  </>
                ) : (
                  "Nothing new to create."
                )}
              </p>
              {alreadyThere > 0 ? (
                <p className="mt-1 text-[13px] leading-[1.5] text-nevo-near-black/55">
                  {alreadyThere === 1
                    ? "One is already there and won’t be created again."
                    : `${alreadyThere} are already there and won’t be created again.`}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="m-0 text-[13.5px] leading-[1.55] text-nevo-near-black/70">
              {rows.length === 0
                ? "Choose a year group to start."
                : "Tick the sections or streams each year group runs."}
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
