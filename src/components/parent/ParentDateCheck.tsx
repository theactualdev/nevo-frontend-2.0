"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AGE_CHECK_EXPIRED,
  AGE_CHECK_NOT_PENDING,
  SCHOOL_RECHECK_REQUIRED,
  ageCheckRefusal,
  ageChecksApi,
  holdStage,
  type AgeCheck,
} from "@/lib/api/ageChecks";
import { parentApi, type ParentChild } from "@/lib/api/parent";

/**
 * D01d Parent Date Check (SCRUM-243 as rewritten 20 Oct; design 96cd4b4).
 *
 * Two records of a child's date of birth differ, so the account is held and
 * the parent is asked for the date again. The whole ask is one date. Two
 * records differ and nobody is accused of anything: no proof, no documents,
 * no identity number, no apology. The school's date is never shown, so it
 * can't simply be matched.
 *
 * HOW A PARENT GETS HERE was left to us as a flow decision (design: "flagged
 * back - not drawn here"). The answer built: a signed-in parent's home shows
 * one quiet line when there is something to confirm, and it opens this page.
 * Nothing sends the parent a link today - raised with Lydia and the backend.
 *
 * THE ORDER IS THE SERVER'S: the parent can only give the date after the
 * school has re-checked its record (409 `school_recheck_required` otherwise),
 * so until then the page says the school is looking first, rather than
 * offering a form that would be refused. That state is not drawn - raised.
 *
 * Nothing here computes whether the dates agree or what happens next. The
 * thank-you says what the school and the server do, in design's words.
 *
 * "I HAVE A QUESTION" (drawn under the confirm; where it goes was not) is an
 * email to support with the child's first name in the subject - a person
 * reads it and replies, as D30 says of its own support link. Flagged for
 * Lydia via the Hub, 28 Oct.
 */

const SUPPORT = "support@nevolearning.com";

type Read =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; child: ParentChild | null; check: AgeCheck | null };

type Outcome = "thanks" | "closed" | "failed" | null;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const FIELD =
  "h-14 w-full rounded-[10px] border-[1.5px] border-nevo-near-black/18 bg-nevo-cream-elevated px-4 text-[16px] text-nevo-near-black outline-none focus:border-nevo-navy md:h-[54px] md:bg-nevo-cream";

/**
 * "2014-09-03" from the three fields, or null while they don't make a real
 * date. A calendar date, built and read back - a day that doesn't exist
 * (31 February) rolls over in `Date` and so fails the read-back.
 */
export function isoFrom(day: string, month: string, year: string): string | null {
  if (!MONTHS.includes(month) || !/^\d{1,2}$/.test(day) || !/^\d{4}$/.test(year)) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const m = MONTHS.indexOf(month) + 1;
  const iso = `${year}-${pad(m)}-${pad(Number(day))}`;
  const date = new Date(Number(year), m - 1, Number(day));
  const back = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return back === iso ? iso : null;
}

export function ParentDateCheck() {
  const wanted = useSearchParams().get("child");
  const [read, setRead] = useState<Read>({ kind: "loading" });
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([parentApi.myChildren(), ageChecksApi.parent()])
      .then(([children, checks]) => {
        if (!alive) return;
        const child = children.find((c) => c.studentId === wanted) ?? children[0] ?? null;
        const check = child ? (checks.find((c) => c.studentId === child.studentId) ?? null) : null;
        setRead({ kind: "ready", child, check });
      })
      .catch(() => {
        if (alive) setRead({ kind: "failed" });
      });
    return () => {
      alive = false;
    };
  }, [wanted]);

  if (read.kind === "loading") {
    return <main className="min-h-dvh bg-nevo-cream" aria-busy="true" />;
  }

  const child = read.kind === "ready" ? read.child : null;
  const check = read.kind === "ready" ? read.check : null;
  const first = child?.firstName?.trim() || check?.studentFirstName?.trim() || "your child";
  const school = child?.schoolName?.trim() || null;

  const submit = () => {
    const iso = isoFrom(day, month, year);
    if (!check || !iso || sending) return;
    setSending(true);
    ageChecksApi
      .parentReconfirm(check.id, iso)
      .then(() => setOutcome("thanks"))
      .catch((err: unknown) => {
        const code = ageCheckRefusal(err);
        if (code === AGE_CHECK_EXPIRED) setOutcome("closed");
        else if (code === SCHOOL_RECHECK_REQUIRED) setWaiting(true);
        // Already settled since the page opened: nothing left to ask.
        else if (code === AGE_CHECK_NOT_PENDING) setRead({ kind: "ready", child, check: { ...check, blocksAccess: false } });
        else setOutcome("failed");
      })
      .finally(() => setSending(false));
  };

  const stage = check && check.blocksAccess ? holdStage(check) : null;

  let body: React.ReactNode;
  if (read.kind === "failed") {
    body = (
      <Message title="We couldn’t load this just now" text="Nothing has changed. Try again in a moment." />
    );
  } else if (outcome === "closed") {
    body = (
      <Message
        icon="soft"
        title="This link has closed."
        text={`To get ${first} started, please get in touch with ${first}’s school. They can set this right.`}
        school={school}
      />
    );
  } else if (outcome === "thanks" || stage === "both") {
    body = (
      <Message
        icon="done"
        title="Thank you - we’ve got that."
        text={`We’ll check it against ${first}’s school record. If the two agree, ${first} can start right away. If they still differ, the school will take another look.`}
      />
    );
  } else if (!stage) {
    body = (
      <Message
        icon="done"
        title="This is already sorted."
        text={
          check
            ? `The dates line up and there’s nothing else to do. ${first} is all set.`
            : "There’s nothing else to do."
        }
      />
    );
  } else if (stage === "school" || waiting) {
    body = (
      <Message
        icon="soft"
        title={`${first}’s school is checking first`}
        text={`${school ?? `${first}’s school`} is checking ${first}’s date of birth against its own records. Once it has, you’ll be able to confirm it here.`}
      />
    );
  } else {
    const iso = isoFrom(day, month, year);
    body = (
      <>
        {school ? (
          <span className="block text-[11.5px] font-semibold tracking-[0.14em] text-nevo-violet uppercase">
            {school}
          </span>
        ) : null}
        <h1 className="m-0 mt-3 text-[26px] font-semibold leading-[1.25] tracking-[-0.015em] text-nevo-near-black md:text-[30px]">
          Can you confirm {first}&rsquo;s date of birth?
        </h1>
        <p className="m-0 mt-3 text-[15.5px] leading-[1.6] text-nevo-near-black/70">
          The date of birth on {first}&rsquo;s school record and the one we have don&rsquo;t quite
          match. It&rsquo;s a common mix-up. Entering it again lets us line the two up.
        </p>
        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2.5">
            <label className="block">
              <span className="mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60">Day</span>
              <input
                inputMode="numeric"
                autoComplete="bday-day"
                value={day}
                onChange={(e) => setDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                className={FIELD}
              />
            </label>
            <label className="block">
              <span className="mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60">Month</span>
              <select
                autoComplete="bday-month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className={`${FIELD} cursor-pointer`}
              >
                <option value="" />
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60">Year</span>
              <input
                inputMode="numeric"
                autoComplete="bday-year"
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className={FIELD}
              />
            </label>
          </div>
          <p className="m-0 mt-4 flex gap-2 text-[14px] leading-[1.55] text-nevo-near-black/66">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 flex-none text-nevo-navy">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5" />
              <circle cx="12" cy="7.6" r="0.6" fill="currentColor" />
            </svg>
            <span>
              {first}&rsquo;s account isn&rsquo;t active yet. Once the two dates agree, {first} can get
              started.
            </span>
          </p>
          {outcome === "failed" ? (
            <p role="status" className="m-0 mt-3 text-[14px] leading-[1.5] text-nevo-navy">
              That didn&rsquo;t go through, and nothing has changed. Try again in a moment.
            </p>
          ) : null}
          <div className="mt-6 flex flex-col items-center gap-3 md:items-start">
            <button
              type="submit"
              disabled={!iso || sending}
              className="flex h-[54px] w-full cursor-pointer items-center justify-center rounded-xl bg-nevo-navy text-[16px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-50 md:w-auto md:px-10"
            >
              {sending ? "Sending…" : "Confirm date of birth"}
            </button>
            <a
              href={`mailto:${SUPPORT}?subject=${encodeURIComponent(
                `A question about ${first}’s date of birth`,
              )}`}
              className="cursor-pointer py-1.5 text-[15px] font-semibold text-nevo-navy hover:opacity-75"
            >
              I have a question
            </a>
          </div>
        </form>
      </>
    );
  }

  return (
    <main className="min-h-dvh bg-nevo-cream text-nevo-near-black">
      <div className="flex h-14 items-center justify-between gap-4 border-b border-nevo-near-black/8 px-5 md:h-16 md:px-10">
        <Image src="/brand/nevo-wordmark.png" alt="Nevo" width={344} height={116} priority className="h-[15px] w-auto" />
        <Link href="/parent-portal" className="text-[14px] font-semibold text-nevo-navy hover:opacity-75">
          Back to home
        </Link>
      </div>
      <div className="mx-auto w-full max-w-[560px] px-5 py-8 md:py-14">
        {body}
        <p className="m-0 mt-10 text-[12.5px] leading-[1.5] text-nevo-near-black/50">
          Your details are never sold or shared beyond the school.
        </p>
      </div>
    </main>
  );
}

function Message({
  icon,
  title,
  text,
  school = null,
}: {
  icon?: "done" | "soft";
  title: string;
  text: string;
  school?: string | null;
}) {
  return (
    <div>
      {icon === "done" ? (
        <span className="flex size-[72px] items-center justify-center rounded-full bg-nevo-navy text-nevo-cream">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </span>
      ) : icon === "soft" ? (
        <span className="flex size-16 items-center justify-center rounded-full bg-nevo-violet/24 text-nevo-navy">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4.5" width="18" height="17" rx="2.5" />
            <path d="M3 9h18M8 2.5v4M16 2.5v4" />
          </svg>
        </span>
      ) : null}
      <h1 className="m-0 mt-6 text-[24px] font-semibold leading-[1.3] tracking-[-0.012em] text-nevo-near-black">
        {title}
      </h1>
      <p className="m-0 mt-3 text-[15.5px] leading-[1.6] text-nevo-near-black/70">{text}</p>
      {school ? <p className="m-0 mt-5 text-[15px] font-semibold text-nevo-near-black">{school}</p> : null}
    </div>
  );
}
