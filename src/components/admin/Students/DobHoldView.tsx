"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AGE_CHECK_EXPIRED,
  AGE_CHECK_NOT_PENDING,
  ageCheckRefusal,
  ageChecksApi,
  holdStage,
  type AgeCheck,
} from "@/lib/api/ageChecks";
import { classesApi, type AdminClass } from "@/lib/api/classes";
import { studentsApi, type AdminStudentDetail } from "@/lib/api/students";
import { cn } from "@/lib/utils";
import { BackLink } from "../BackLink";
import { NoAccess, failureKind } from "../NoAccess";
import { GHOST_BTN, PRIMARY_BTN } from "../Roster/primitives";
import type { Back } from "../back";

/**
 * D30 Date of birth checks (SCRUM-243 as rewritten 20 Oct; design 96cd4b4).
 *
 * When the date of birth a parent gives differs from the school's, the account
 * holds and doesn't activate. The school re-checks its admissions record here;
 * the parent is asked separately. Shown: the school's OWN date (never the
 * parent's), the one thing to do, and the date the record is removed if
 * nothing happens. Weight, not red - a held account is not a fault.
 *
 * WHAT THIS SCREEN DOES NOT DECIDE. Whether a hold can clear is the server's
 * `clearable` (live 21 Oct). True: the ordinary re-check - confirm or
 * correct. False: the confirm goes, and the screen says plainly that the
 * account won't activate on either date as things stand; correcting stays,
 * because a correction can bring the dates inside the rule.
 *
 * CORRECTING IS THE RE-CHECK WITH A NEW DATE. Design routes "Correct it in the
 * roster" to the student's page, but no route edits a student's date of birth
 * (only a full roster re-import does); `POST .../school-recheck` takes the
 * school's date, so a correction is made here, in place. Raised with Lydia.
 *
 * No count of days is drawn: the server sends the date, and the day count is
 * the backend's to give (Lydia's L1 rule, 14 Oct), not ours to work out.
 *
 * BOTH CHECKS DONE AND STILL HELD (S5; design cb527bf, 27 Oct). The school
 * has re-checked, the parent has given the date again, and the dates still
 * differ. This was the re-check card again - the loop people were stuck in.
 * Now it is a calm card that never re-offers the check: what the hold waits
 * on (one date both sides agree), who can move it (the school and the parent
 * together), and an email to support for anyone who thinks it's wrong.
 *
 * NO DEAD END (Lydia, 28 Oct). Design's "Set the agreed date in the roster"
 * ships without its button - no route sets a date of birth - so the card
 * says what to do instead: agree one date with the parent, then send it to
 * support. Without that, it would be the dead end it replaced.
 * "We've let {parent} know the dates still don't match" is true since
 * Teslim's ed123cb (29 Oct): when the parent's second check leaves the hold
 * standing, the server tells the school and every linked parent. It stamps no
 * `parentNotifiedAt` for that notice, so the line rests on the stage itself -
 * this card exists only after the parent's own second check - and on the
 * server's `differs`: dates that agree but still hold (outside the enrolled
 * age band) don't "still not match", so the line isn't said of them.
 */

const SUPPORT = "support@nevolearning.com";

type Phase = "loading" | "ready" | "failed" | "denied";

/** "14 March 2013", from a date-only "2013-03-14", without a timezone shift. */
function longDate(day: string | null): string | null {
  if (!day) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(day);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** "19 November 2026", from a timestamp. */
function longDay(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Today as "2026-10-21", for the date field's upper bound. */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface Person {
  name: string;
  first: string;
  className: string | null;
}

/** What the admin just did here, so the card can say it in their terms. */
type Done = { kind: "confirmed" } | { kind: "corrected"; to: string };

export function DobHoldView({ back = null }: { back?: Back | null }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [held, setHeld] = useState<AgeCheck[]>([]);
  const [people, setPeople] = useState<Map<string, Person>>(() => new Map());
  const [done, setDone] = useState<Record<string, Done>>({});

  const read = useCallback(() => {
    ageChecksApi
      .held()
      .then((rows) => {
        setHeld(rows);
        setPhase("ready");
        // Who each child is: names and class from the reads the roster
        // already makes. A child who can't be read keeps the server's first
        // name, and no class is guessed.
        Promise.all([
          classesApi.list(true).catch(() => [] as AdminClass[]),
          ...rows.map((r) => studentsApi.get(r.studentId).catch(() => null)),
        ]).then(([classes, ...students]) => {
          const byId = new Map<string, Person>();
          (students as (AdminStudentDetail | null)[]).forEach((s, i) => {
            if (!s) return;
            const name = [s.firstName, s.lastName].filter(Boolean).join(" ").trim();
            const cls = (classes as AdminClass[]).find((c) => s.classIds.includes(c.id));
            byId.set(rows[i].studentId, {
              name: name || rows[i].studentFirstName?.trim() || "This student",
              first: s.firstName?.trim() || rows[i].studentFirstName?.trim() || "this student",
              className: cls?.name ?? null,
            });
          });
          setPeople(byId);
        });
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
  }, []);

  useEffect(() => {
    read();
  }, [read]);

  const personFor = (c: AgeCheck): Person =>
    people.get(c.studentId) ?? {
      name: c.studentFirstName?.trim() || "This student",
      first: c.studentFirstName?.trim() || "this student",
      className: null,
    };

  const onRechecked = (next: AgeCheck, what: Done) => {
    setDone((d) => ({ ...d, [next.id]: what }));
    // Resolved on the server's word: still held stays listed, anything else goes.
    setHeld((rows) => (next.blocksAccess ? rows.map((r) => (r.id === next.id ? next : r)) : rows.filter((r) => r.id !== next.id)));
  };

  const toDo = held.filter((c) => holdStage(c) === "school");
  const waiting = held.filter((c) => holdStage(c) === "parent");
  // Both have checked and it still holds: never the re-check again.
  const settled = held.filter((c) => holdStage(c) === "both");

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[820px]">
        <BackLink back={back} fallback={{ href: "/admin/students", label: "All students" }} />
        <h2 className="m-0 mt-3 text-[28px] font-semibold tracking-[-0.018em] text-nevo-near-black max-lg:text-[24px]">
          Date of birth checks
        </h2>

        {phase === "denied" ? (
          <NoAccess what="date of birth checks" className="mt-6" />
        ) : phase === "loading" ? (
          <div className="mt-6 h-[240px] animate-pulse rounded-xl bg-nevo-cream-elevated" />
        ) : phase === "failed" ? (
          <div className="mt-6 rounded-xl bg-nevo-cream-elevated px-[26px] py-7 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
              We couldn&rsquo;t load the date of birth checks
            </h3>
            <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
              Nothing has changed. Try again in a moment.
            </p>
            <button
              type="button"
              onClick={() => {
                setPhase("loading");
                read();
              }}
              className={cn(PRIMARY_BTN, "mt-5")}
            >
              Try again
            </button>
          </div>
        ) : held.length === 0 ? (
          <div className="mt-8 flex flex-col items-center rounded-xl bg-nevo-cream-elevated px-8 py-14 text-center shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <span className="flex size-[64px] items-center justify-center rounded-full bg-nevo-violet/24 text-nevo-navy">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="4.5" width="18" height="17" rx="2.5" />
                <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
                <path d="M9.5 15l2 2 3.5-4" />
              </svg>
            </span>
            <h3 className="m-0 mt-5 text-[20px] font-semibold tracking-[-0.01em] text-nevo-near-black">
              No accounts are waiting on a date of birth
            </h3>
            <p className="m-0 mt-2.5 max-w-[56ch] text-[15px] leading-[1.6] text-nevo-near-black/64">
              If the date of birth a parent gives differs from your admissions record, that
              child&rsquo;s account waits here until it&rsquo;s checked. When it happens,
              you&rsquo;ll find them listed here with the one thing to do.
            </p>
          </div>
        ) : (
          <>
            {toDo.length > 0 || waiting.length > 0 ? (
              <p className="mt-2 max-w-[68ch] text-[15px] leading-[1.6] text-nevo-near-black/64">
                {toDo.length > 0
                  ? "These accounts can’t start yet because the date of birth a parent gave differs from your admissions record. Check each one against your record, then confirm it’s right or correct it."
                  : "You’ve done your part on these. They’re waiting on the parent now; nothing else is needed from you."}
              </p>
            ) : null}
            <ul className="m-0 mt-6 flex list-none flex-col gap-3.5 p-0">
              {toDo.map((c) => (
                <RecheckCard
                  key={c.id}
                  check={c}
                  person={personFor(c)}
                  onRechecked={onRechecked}
                  onGone={read}
                />
              ))}
              {waiting.map((c) => (
                <WaitingCard key={c.id} check={c} person={personFor(c)} done={done[c.id] ?? null} />
              ))}
              {settled.map((c) => (
                <BothCheckedCard key={c.id} check={c} person={personFor(c)} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** D30's held card: the school's own date and the one thing to do. */
function RecheckCard({
  check,
  person,
  onRechecked,
  onGone,
}: {
  check: AgeCheck;
  person: Person;
  onRechecked: (next: AgeCheck, what: Done) => void;
  /** The server says it is no longer held: read the list again. */
  onGone: () => void;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [date, setDate] = useState(check.schoolDateOfBirth ?? "");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // The SERVER'S word, read as sent - nothing here works it out.
  const cannotClear = check.clearable === false;
  const schoolDate = longDate(check.schoolDateOfBirth);
  const removal = longDay(check.deletionDueAt);

  const send = (dateOfBirth: string, what: Done) => {
    if (busy || !dateOfBirth) return;
    setBusy(true);
    setRefusal(null);
    ageChecksApi
      .schoolRecheck(check.id, dateOfBirth)
      .then((next) => onRechecked(next, what))
      .catch((err: unknown) => {
        const code = ageCheckRefusal(err);
        if (code === AGE_CHECK_NOT_PENDING) {
          onGone();
          return;
        }
        setRefusal(
          code === AGE_CHECK_EXPIRED
            ? "This check has closed, so the date can’t be changed here."
            : "That didn’t go through, and nothing has changed. Try again in a moment.",
        );
      })
      .finally(() => setBusy(false));
  };

  return (
    <li className="rounded-xl border-l-4 border-nevo-navy bg-nevo-cream-elevated px-6 py-[22px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] max-lg:px-5 max-lg:py-[18px]">
      <div className="flex items-start justify-between gap-4 max-lg:flex-col max-lg:gap-2.5">
        <div className="min-w-0">
          <span className="block text-[18px] font-semibold tracking-[-0.01em] text-nevo-near-black">
            {person.name}
          </span>
          {person.className ? (
            <span className="mt-1 block text-[13.5px] text-nevo-near-black/58">{person.className}</span>
          ) : null}
        </div>
        <span className="inline-flex flex-none items-center whitespace-nowrap rounded-full bg-nevo-violet/24 px-3 py-[5px] text-[12.5px] font-semibold text-nevo-navy">
          {cannotClear ? "On hold · needs a correction" : "On hold · date of birth difference"}
        </span>
      </div>

      <div className="mt-4 rounded-[10px] bg-nevo-cream px-4 py-3.5">
        <span className="block text-[12.5px] font-semibold text-nevo-near-black/60">
          Date of birth on your record
        </span>
        {correcting ? (
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <input
              type="date"
              aria-label={`${person.first}’s date of birth`}
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
              disabled={busy}
              className="h-[46px] rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream-elevated px-3.5 text-[15px] text-nevo-near-black outline-none focus:border-nevo-navy"
            />
            <button
              type="button"
              onClick={() => send(date, { kind: "corrected", to: date })}
              disabled={busy || !date || date === check.schoolDateOfBirth}
              className={PRIMARY_BTN}
            >
              {busy ? "Saving…" : "Save the corrected date"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCorrecting(false);
                setDate(check.schoolDateOfBirth ?? "");
              }}
              disabled={busy}
              className={GHOST_BTN}
            >
              Cancel
            </button>
          </div>
        ) : (
          <span className="mt-1 block text-[17px] font-semibold text-nevo-near-black">
            {schoolDate ?? "Not on your record"}
          </span>
        )}
        <span className="mt-1 block text-[12.5px] text-nevo-near-black/55">The parent&rsquo;s date is not shown.</span>
      </div>

      {cannotClear ? (
        <p className="m-0 mt-4 text-[14px] leading-[1.6] text-nevo-near-black/72">
          As things stand, {person.first}&rsquo;s account won&rsquo;t activate on either date.
          Confirming the date above won&rsquo;t change that. Correcting your admissions record is
          what can.
        </p>
      ) : (
        <p className="m-0 mt-4 text-[14px] leading-[1.6] text-nevo-near-black/72">
          Check this against your admissions record, then confirm it&rsquo;s right or correct it.
        </p>
      )}

      {!correcting ? (
        <div className="mt-3.5 flex flex-wrap gap-3">
          {cannotClear ? null : (
            <button
              type="button"
              onClick={() => send(check.schoolDateOfBirth ?? "", { kind: "confirmed" })}
              disabled={busy || !check.schoolDateOfBirth}
              className={PRIMARY_BTN}
            >
              {busy ? "Confirming…" : "This date is correct"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setCorrecting(true);
              setRefusal(null);
            }}
            disabled={busy}
            className={cannotClear ? PRIMARY_BTN : GHOST_BTN}
          >
            Correct it
          </button>
        </div>
      ) : null}

      {refusal ? (
        <p role="status" className="m-0 mt-3 text-[13.5px] leading-[1.5] text-nevo-navy">
          {refusal}
        </p>
      ) : null}

      {removal ? (
        <p className="m-0 mt-4 border-t border-nevo-near-black/8 pt-3.5 text-[13.5px] leading-[1.55] text-nevo-near-black/66">
          If this isn&rsquo;t resolved, {person.first}&rsquo;s record is removed on{" "}
          <strong className="font-semibold text-nevo-near-black">{removal}</strong>.
        </p>
      ) : null}
    </li>
  );
}

/** After the school's re-check: waiting on the parent, said plainly. */
function WaitingCard({ check, person, done }: { check: AgeCheck; person: Person; done: Done | null }) {
  const removal = longDay(check.deletionDueAt);
  return (
    <li className="rounded-xl bg-nevo-cream-elevated px-6 py-[22px] shadow-[0_2px_8px_rgba(0,0,0,0.05)] max-lg:px-5 max-lg:py-[18px]">
      <span className="block text-[13.5px] font-semibold text-nevo-near-black/58">{person.name}</span>
      <h3 className="m-0 mt-1.5 text-[17px] font-semibold text-nevo-near-black">
        {done?.kind === "corrected"
          ? `You’ve updated ${person.first}’s date of birth`
          : `You’ve confirmed ${person.first}’s date of birth`}
      </h3>
      <p className="m-0 mt-2 text-[14px] leading-[1.6] text-nevo-near-black/70">
        {done?.kind === "corrected" && longDate(done.to)
          ? `Your record now reads ${longDate(done.to)}. `
          : ""}
        {person.first}&rsquo;s parent now needs to enter the date again. If the two dates agree,{" "}
        {person.first}&rsquo;s account activates on its own.
      </p>
      <p className="m-0 mt-3 text-[13px] leading-[1.5] text-nevo-near-black/58">
        Not active yet - waiting on the parent.
        {removal ? ` Record removed on ${removal} if unresolved.` : ""}
      </p>
    </li>
  );
}

/**
 * D30 S5: both checks done, and the hold still stands. Nothing to confirm or
 * correct here - the same check again won't settle it.
 *
 * TWO WAYS TO GET HERE since ed123cb, told apart by the server's `differs`:
 * the dates still differ (too far apart), or the dates now AGREE but fall
 * outside the year group the child is enrolled in. For the second, the card
 * says what's true, in Lydia's words (31 Oct, Q12), and leaves out the two
 * boxes about agreeing a date - the date is agreed; the enrolment is the
 * question.
 */
function BothCheckedCard({ check, person }: { check: AgeCheck; person: Person }) {
  const agree = !check.differs;
  const schoolDate = longDate(check.schoolDateOfBirth);
  const removal = longDay(check.deletionDueAt);
  const parentName = check.parentName?.trim() || null;
  const parent = parentName ?? `${person.first}’s parent`;
  const mail = `mailto:${SUPPORT}?subject=${encodeURIComponent(
    `Date of birth check for ${person.first}`,
  )}&body=${encodeURIComponent(`About ${person.first}’s date of birth check:\n\n`)}`;
  const agreed = `mailto:${SUPPORT}?subject=${encodeURIComponent(
    `Agreed date of birth for ${person.first}`,
  )}`;
  return (
    <li className="rounded-xl bg-nevo-cream-elevated px-6 py-[22px] shadow-[0_2px_8px_rgba(0,0,0,0.05)] max-lg:px-5 max-lg:py-[18px]">
      <div className="flex items-start justify-between gap-4 max-lg:flex-col max-lg:gap-2.5">
        <div className="min-w-0">
          <span className="block text-[18px] font-semibold tracking-[-0.01em] text-nevo-near-black">
            {person.name}
          </span>
          {person.className ? (
            <span className="mt-1 block text-[13.5px] text-nevo-near-black/58">{person.className}</span>
          ) : null}
        </div>
        <span className="inline-flex flex-none items-center whitespace-nowrap rounded-full bg-nevo-violet/24 px-3 py-[5px] text-[12.5px] font-semibold text-nevo-navy">
          On hold · both checks done
        </span>
      </div>

      {agree ? (
        <p className="m-0 mt-4 text-[14px] leading-[1.6] text-nevo-near-black/72">
          You&rsquo;ve checked the date on your record, and we&rsquo;ve heard back from {parent}. The
          dates now agree, but the date of birth does not match the year group {person.first} is
          enrolled in, and the school needs to check the enrolment rather than the date.
        </p>
      ) : (
        <p className="m-0 mt-4 text-[14px] leading-[1.6] text-nevo-near-black/72">
          You&rsquo;ve checked the date on your record, and we&rsquo;ve heard back from {parent}. The
          two still differ, so {person.first}&rsquo;s account stays on hold. Nobody has got this
          wrong - the records just don&rsquo;t agree yet, and running the same check again
          won&rsquo;t settle it.
        </p>
      )}

      {agree ? null : (
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-[10px] bg-nevo-cream px-4 py-3.5">
          <span className="block text-[12.5px] font-semibold text-nevo-near-black/60">
            What it&rsquo;s waiting on
          </span>
          <p className="m-0 mt-1 text-[14px] leading-[1.55] text-nevo-near-black/78">
            One date of birth both sides agree on.
            {schoolDate
              ? ` Your record reads ${schoolDate}; ${parentName ? `${parentName}’s` : "the parent’s"} doesn’t match it.`
              : ""}{" "}
            Until they do, the account can&rsquo;t start.
          </p>
        </div>
        <div className="rounded-[10px] bg-nevo-cream px-4 py-3.5">
          <span className="block text-[12.5px] font-semibold text-nevo-near-black/60">Who can move it</span>
          <p className="m-0 mt-1 text-[14px] leading-[1.55] text-nevo-near-black/78">
            You and {parent} together. Agree {person.first}&rsquo;s real date between you, then
            send it to us at{" "}
            <a href={agreed} className="cursor-pointer font-semibold text-nevo-navy hover:underline">
              {SUPPORT}
            </a>
            .
          </p>
        </div>
      </div>
      )}

      <div className="mt-4">
        <a href={mail} className="cursor-pointer text-[14px] font-semibold text-nevo-navy hover:underline">
          This doesn&rsquo;t look right to me
        </a>
        <p className="m-0 mt-1 max-w-[62ch] text-[13px] leading-[1.5] text-nevo-near-black/58">
          That opens an email to {SUPPORT} with {person.first}&rsquo;s name filled in. A person on
          our team reads it and replies - it doesn&rsquo;t go into a form or a queue you can&rsquo;t
          see.
        </p>
      </div>

      {check.differs || removal ? (
        <p className="m-0 mt-4 border-t border-nevo-near-black/8 pt-3.5 text-[13.5px] leading-[1.55] text-nevo-near-black/66">
          {check.differs ? `We’ve let ${parent} know the dates still don’t match. ` : null}
          {removal ? (
            <>
              If it isn&rsquo;t settled, {person.first}&rsquo;s record is removed on{" "}
              <strong className="font-semibold text-nevo-near-black">{removal}</strong>.
            </>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}
