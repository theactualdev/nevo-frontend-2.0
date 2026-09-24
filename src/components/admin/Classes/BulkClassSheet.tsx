"use client";

import { useEffect, useMemo, useState } from "react";
import { sessionLabel } from "./groupByYear";
import {
  classesApi,
  type AdminClass,
  type ClassRejection,
} from "@/lib/api/classes";
import { yearGroupLabel, yearGroupOptions } from "@/lib/constants/yearGroups";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  FailureLine,
  GHOST_BTN,
  PRIMARY_BTN,
  Sheet,
  Spinner,
} from "../Roster/primitives";
import { SECTION_CHOICES, composeClassNames, sendable } from "./composeClassNames";

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
  "h-[50px] w-full cursor-pointer rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-[15px] text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy";

type Phase = "idle" | "saving" | "failed" | "done";

export function BulkClassSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** Fired once, after the admin acknowledges the result. */
  onCreated: () => void;
}) {
  const [year, setYear] = useState("");
  const [sections, setSections] = useState<string[]>([]);
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
   */
  const [existing, setExisting] = useState<readonly AdminClass[] | null>(null);

  useEffect(() => {
    classesApi
      .list(true)
      .then(setExisting)
      .catch(() => setExisting(null));
  }, []);

  const composed = useMemo(
    () =>
      year && existing
        ? composeClassNames({ yearGroup: year, sections, existing })
        : [],
    [year, sections, existing],
  );
  const toSend = sendable(composed);
  const alreadyThere = composed.length - toSend.length;

  const toggle = (s: string) =>
    setSections((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s].sort(),
    );

  const submit = () => {
    if (toSend.length === 0) return;
    setPhase("saving");
    classesApi
      .createMany(
        toSend.map((c) => ({
          name: c.name,
          yearGroup: year,
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
          academicSession: existing ? sessionLabel([...existing]) : null,
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
      title="Add several classes"
      subtitle="Pick a year group and tick the sections. We'll name them for you."
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
      <div>
        <label htmlFor="bulk-year" className={LABEL}>
          Year group
        </label>
        <select
          id="bulk-year"
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

      <div>
        <span className={LABEL}>Sections</span>
        <div className="flex flex-wrap gap-2">
          {SECTION_CHOICES.map((s) => {
            const on = sections.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                aria-pressed={on}
                disabled={!year}
                className={cn(
                  "flex size-[44px] cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] text-[15px] font-semibold transition-colors",
                  on
                    ? "border-nevo-navy bg-nevo-navy text-nevo-cream"
                    : "border-nevo-near-black/16 text-nevo-near-black hover:bg-nevo-near-black/[0.04]",
                  !year && "cursor-not-allowed opacity-45",
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
        {!year ? (
          <p className="mt-2 text-[13px] leading-[1.5] text-nevo-near-black/55">
            Choose a year group first.
          </p>
        ) : null}
      </div>

      {composed.length > 0 ? (
        <div>
          <span className={LABEL}>
            {toSend.length > 0
              ? `${toSend.length} ${toSend.length === 1 ? "class" : "classes"} will be created`
              : "Nothing new to create"}
          </span>
          <ul className="m-0 list-none space-y-0 overflow-hidden rounded-[10px] border border-nevo-near-black/10 p-0">
            {composed.map((c) => (
              <li
                key={c.section}
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
          {alreadyThere > 0 ? (
            <p className="mt-2 text-[13px] leading-[1.5] text-nevo-near-black/55">
              {alreadyThere === 1
                ? "One is already there and won’t be created again."
                : `${alreadyThere} are already there and won’t be created again.`}
            </p>
          ) : null}
        </div>
      ) : year ? (
        <p className="m-0 text-[13.5px] leading-[1.55] text-nevo-near-black/70">
          {yearGroupLabel(year)
            ? "Tick the sections this year group has."
            : "Your school hasn’t named this year group yet, so we can’t compose class names for it. Add these individually instead."}
        </p>
      ) : null}
    </Sheet>
  );
}
