"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  parentApi,
  type ParentInvitation,
  type ParentRightType,
} from "@/lib/api/parent";

/**
 * D01c Parent Data Management (SCRUM-80).
 *
 * The one screen where a parent can change something consequential, and the
 * reason it exists is legal rather than product: NDPA 2023 s.31 requires a
 * direct route to review, object and withdraw.
 *
 * TONE IS PART OF THE SPEC. The frame note is explicit - withdrawal is "the
 * one consequential action", carried in soft violet and navy, NEVER red. A
 * parent exercising a lawful right is not doing something dangerous, and the
 * screen should not flinch at them. No alarm colours anywhere on this page.
 *
 * WHAT CHANGED 8 SEP. `GET /api/v1/consents/parent/{token}` now exists, so the
 * three things this page could not previously do all work:
 *
 *   - it names the child and their school, as the frame always intended
 *   - a parent who ALREADY withdrew arrives at the suspended state instead of
 *     being offered the withdrawal actions a second time
 *   - an objection carries the parent's words, because `reason` is persisted
 *     and the receipt confirms it with `reasonRecorded`
 *
 * The school's phone and email are nullable and null for most schools today -
 * they come from the billing contact - so every "contact your school" route
 * degrades to plain text rather than rendering a blank or a dead link.
 */

type Phase = "idle" | "sending" | "done" | "failed" | "gone";

/** Which action produced the current outcome, so the copy can match it. */
type Outcome = {
  right: ParentRightType;
  requestId: string;
  reasonRecorded: boolean;
  reasonGiven: boolean;
} | null;

const CARD =
  "rounded-[14px] bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]";
const H3 = "text-[16px] font-semibold text-nevo-near-black";
const BODY = "mt-1.5 text-[14.5px] leading-[1.55] text-nevo-near-black/68";
const NOTE =
  "mt-3.5 rounded-[10px] bg-nevo-violet/14 px-4 py-3 text-[14px] leading-[1.5] text-nevo-near-black/80";
const PRIMARY =
  "mt-4 w-full rounded-[10px] bg-nevo-navy px-5 py-3 text-[15px] font-semibold text-nevo-cream transition-transform active:scale-[0.99] disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed";
const QUIET =
  "mt-2.5 w-full rounded-[10px] border border-nevo-navy/25 px-5 py-3 text-[15px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45";

/**
 * The four transparency sections. Content is the parental-notice material
 * SCRUM-80 lists; counsel drafts the final wording, so this is deliberately
 * factual and free of framework names.
 */
const SECTIONS: { heading: string; body: (child: string) => string }[] = [
  {
    heading: "What Nevo collects",
    body: (c) =>
      `${sentenceCase(c)}’s name, their year group, and how they interact with each lesson - what they answer, how long they spend, and when they ask for help.`,
  },
  {
    heading: "How profiling works",
    body: (c) =>
      `Nevo adjusts each lesson to how ${c} is learning in the moment. It never stores a label or a diagnosis, and it never decides anything about ${c} on its own.`,
  },
  {
    heading: "Where data is processed",
    body: () =>
      "Some processing happens outside Nigeria, including in the United States, which has no adequacy decision from the NDPC. Those transfers are made under Standard Contractual Clauses.",
  },
  {
    heading: "How long data is kept",
    body: (c) =>
      `For as long as ${c}’s school uses Nevo. If consent is withdrawn, their account is suspended straight away and the school decides what happens next.`,
  },
];

/**
 * What the page says about a child and their school. A tokenised link's
 * invitation is one; a signed-in parent's reads make another (`ParentMyData`,
 * 14 Oct), so the page's words are one set, held exactly as counsel last
 * worded them.
 */
export type DataSubject = Pick<
  ParentInvitation,
  "studentFirstName" | "schoolName" | "schoolPhone" | "schoolEmail" | "status" | "decidedAt"
> & {
  /** Named only on a tokenised link, which can be forwarded. */
  parentName?: string | null;
};

/** Exercise one right; the page says what came back. */
export type ExerciseRight = (
  right: ParentRightType,
  reason?: string,
) => Promise<{ requestId: string; reasonRecorded: boolean }>;

/**
 * The invitation arrives as a PROP, read once by `ParentPortal`. This screen
 * used to fetch it itself, which was right when it was the only parent screen
 * and wrong as soon as D01b joined it: two components reading the same record
 * meant two requests, two loading states, and a window in which they could
 * disagree about whether consent had been given.
 */
export function ParentDataManagement({
  token,
  invitation,
  act,
}: {
  /** The tokenised link's, when the page was opened from one. */
  token?: string;
  invitation: DataSubject;
  /** A signed-in parent's own routes; without it, the link's. */
  act?: ExerciseRight;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");

  async function exercise(right: ParentRightType) {
    const withReason = right === "object" ? reason : undefined;
    setPhase("sending");
    try {
      const res = act
        ? await act(right, withReason)
        : await parentApi.exerciseRight(token ?? "", right, withReason);
      setOutcome({
        right,
        requestId: res.requestId,
        reasonRecorded: res.reasonRecorded,
        reasonGiven: Boolean(withReason?.trim()),
      });
      setPhase("done");
    } catch (e) {
      // "This link is no longer active" is about a link; signed in, there is none.
      setPhase(!act && e instanceof ApiError && e.status === 404 ? "gone" : "failed");
    }
  }

  // No loading state here any more - `ParentPortal` owns the read and does not
  // render this screen until it has one. `gone` survives, because a link can
  // still be revoked BETWEEN opening the page and tapping an action.
  if (phase === "gone") {
    return (
      <Shell>
        <div className={CARD}>
          <h2 className={H3}>This link is no longer active</h2>
          <p className={BODY}>
            It may have expired, been replaced by a newer one, or the school may
            have updated your details. Contact your child&rsquo;s school and
            they can send you a fresh link.
          </p>
        </div>
        <Footer school={invitation} />
      </Shell>
    );
  }

  // TWO FORMS, because the backend can legitimately send the literal string
  // "your child" - it does that when the school never entered a first name,
  // which is real in the data. A `??` fallback does not help: the field is
  // always present, so the literal flows straight into whatever sentence it
  // lands in. Mid-sentence that reads correctly; at the head of a heading it
  // renders "your child's data on Nevo" with a lowercase y.
  const child = invitation.studentFirstName;
  const childLead = sentenceCase(child);
  // Suspended on ARRIVAL as well as after the act. A parent who withdrew last
  // week must not be shown the withdrawal actions again.
  const suspended =
    invitation.status === "withdrawn" ||
    (phase === "done" && outcome?.right === "withdraw_consent");

  if (suspended) {
    return (
      <Shell>
        <div className={CARD}>
          <h2 className={H3}>{childLead}&rsquo;s account is suspended</h2>
          {/* One expression rather than text-expression-text. Not for spacing -
              JSX strips newline-adjacent whitespace around an expression, so
              that form joins cleanly; I checked by reintroducing it. The reason
              is that the date has THREE states, not two: absent, valid, and
              present-but-unparseable. Interpolating on `decidedAt` being truthy
              gets the third wrong, emitting " on " with nothing in it and
              rendering "You withdrew consent on , so ...". Composing the whole
              sentence from the FORMATTED value collapses that to two states. */}
          <p className={BODY}>
            {withdrawalSentence(invitation.decidedAt)}
          </p>
          <p className={BODY}>
            To restore access, contact {schoolPhrase(invitation)}. The school
            will work with Nevo to reactivate the account.
          </p>
        </div>
        <div className={`${CARD} mt-3.5`}>
          <h3 className={H3}>Request {child}&rsquo;s Data</h3>
          {/* Kept deliberately: the right of access SURVIVES withdrawal of
              consent, and the frame says so in as many words. */}
          <p className={BODY}>
            You keep this right even after withdrawing consent.
          </p>
          {outcome?.right === "request_data" && phase === "done" ? (
            <p className={NOTE}>
              Request submitted. You will receive {child}&rsquo;s data within 5
              working days.
            </p>
          ) : (
            <button
              type="button"
              className={PRIMARY}
              disabled={phase === "sending"}
              onClick={() => void exercise("request_data")}
            >
              {phase === "sending" ? "Sending…" : `Request ${child}’s data`}
            </button>
          )}
        </div>
        <Footer school={invitation} />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className={CARD}>
        <h1 className="text-[21px] font-semibold tracking-[-0.015em] text-nevo-near-black">
          {childLead}&rsquo;s data on Nevo
        </h1>
        <p className={BODY}>
          {invitation
            ? `${invitation.schoolName} enrolled ${child} on Nevo.`
            : "Your child’s school enrolled them on Nevo."}{" "}
          This page explains what that means, and lets you act on it.
        </p>
        {/* A tokenised link can be forwarded. Naming the parent the school
            recorded lets someone who received it in error see that at once.
            FLAGGED TO DESIGN: the wording is ours, not from a frame. */}
        {invitation?.parentName && (
          <p className="mt-2.5 text-[13px] text-nevo-near-black/50">
            This link was sent to {invitation.parentName}.
          </p>
        )}
      </div>

      <div className="mt-3.5 overflow-hidden rounded-[14px] bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        {SECTIONS.map((s, i) => {
          const isOpen = open === s.heading;
          return (
            <div
              key={s.heading}
              className={i > 0 ? "border-t border-nevo-near-black/8" : ""}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : s.heading)}
                className="flex w-full cursor-pointer items-center justify-between px-[22px] py-4 text-left"
              >
                <span className="text-[15px] font-medium text-nevo-near-black">
                  {s.heading}
                </span>
                <span
                  aria-hidden
                  className="text-nevo-near-black/40 transition-transform"
                  style={{ transform: isOpen ? "rotate(180deg)" : undefined }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
              {isOpen && (
                <p className="px-[22px] pb-4 text-[14.5px] leading-[1.6] text-nevo-near-black/70">
                  {s.body(child)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className={`${CARD} mt-3.5`}>
        <h3 className={H3}>Request {child}&rsquo;s Data</h3>
        <p className={BODY}>
          We will prepare a copy of {child}&rsquo;s data and send it to the
          email address your school has for you.
        </p>
        {outcome?.right === "request_data" && phase === "done" ? (
          <p className={NOTE}>
            Request submitted. You will receive {child}&rsquo;s data within 5
            working days.
          </p>
        ) : (
          <button
            type="button"
            className={PRIMARY}
            disabled={phase === "sending"}
            onClick={() => void exercise("request_data")}
          >
            {phase === "sending" ? "Sending…" : `Request ${child}’s data`}
          </button>
        )}
      </div>

      <div className={`${CARD} mt-3.5`}>
        <h3 className={H3}>Object to Processing</h3>
        <p className={BODY}>
          Tell us your concern. We will review it within 48 hours.
        </p>
        {outcome?.right === "object" && phase === "done" ? (
          <p className={NOTE}>
            Objection submitted. We will respond within 48 hours to the email
            address your school has for you.
            {/* The contract answers "did my words go anywhere". If it says no,
                say no - promising a recorded concern that was dropped is the
                exact failure this textarea was withheld for. */}
            {outcome.reasonGiven && !outcome.reasonRecorded
              ? " We could not attach your note to this request, so please repeat it when we contact you."
              : ""}
          </p>
        ) : (
          <>
            <label
              htmlFor="objection-reason"
              className="mt-3.5 block text-[14px] font-medium text-nevo-near-black/80"
            >
              Describe your concern{" "}
              <span className="font-normal text-nevo-near-black/50">
                (optional)
              </span>
            </label>
            <textarea
              id="objection-reason"
              value={reason}
              maxLength={2000}
              rows={4}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1.5 w-full resize-y rounded-[10px] border border-nevo-navy/20 bg-nevo-cream px-3.5 py-2.5 text-[15px] leading-[1.5] text-nevo-near-black outline-none focus:border-nevo-navy/45"
            />
            <button
              type="button"
              className={PRIMARY}
              disabled={phase === "sending"}
              onClick={() => void exercise("object")}
            >
              {phase === "sending" ? "Sending…" : "Object to processing"}
            </button>
          </>
        )}
      </div>

      <div className={`${CARD} mt-3.5`}>
        <h3 className={H3}>Withdraw Consent</h3>
        {!confirming ? (
          <>
            <p className={BODY}>
              This will immediately suspend {child}&rsquo;s access to Nevo.
            </p>
            <button
              type="button"
              className={QUIET}
              onClick={() => setConfirming(true)}
            >
              Withdraw consent
            </button>
          </>
        ) : (
          <>
            <p className={BODY}>
              This will immediately suspend {child}&rsquo;s access to Nevo. They
              will not be able to use the platform until consent is restored
              through your school.
            </p>
            <p className={BODY}>
              To restore access later, contact {schoolPhrase(invitation)}.
            </p>
            <button
              type="button"
              className={PRIMARY}
              disabled={phase === "sending"}
              onClick={() => setConfirming(false)}
            >
              Keep active
            </button>
            <button
              type="button"
              className={QUIET}
              disabled={phase === "sending"}
              onClick={() => void exercise("withdraw_consent")}
            >
              {phase === "sending" ? "Withdrawing…" : "Withdraw consent"}
            </button>
          </>
        )}
      </div>

      {phase === "failed" && (
        <p role="alert" className={NOTE}>
          We couldn&rsquo;t send that just now. Nothing has changed - please try
          again in a moment.
        </p>
      )}

      <Footer school={invitation} />
    </Shell>
  );
}

/**
 * "your child's school" or its actual name - never a blank where a name should
 * be. The school's own phone and email are null for most schools today, so
 * this stays prose rather than becoming a link that might go nowhere.
 */
/**
 * Capitalise a leading word without touching the rest.
 *
 * Deliberately NOT a general title-caser: a real first name arrives already
 * cased ("Amara"), and forcing case on it would mangle names like "de Souza".
 * This only lifts the first character, which is all a sentence-initial
 * position needs.
 */
function sentenceCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * "3 September 2026". The year is kept: a withdrawal from a previous year
 * reading as a bare "3 September" would look like it happened days ago.
 * An unparseable value yields nothing rather than "Invalid Date".
 */
function formatDecided(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
}

/**
 * Built as one string so the comma cannot drift away from the clause before
 * it. Falls back to the undated sentence when `decidedAt` is null (a parent
 * mid-decision) or unparseable - saying WHEN is an improvement, not a
 * precondition for telling them their child is suspended.
 */
function withdrawalSentence(decidedAt: string | null): string {
  const when = decidedAt ? formatDecided(decidedAt) : "";
  return when
    ? `You withdrew consent on ${when}, so they can no longer access Nevo.`
    : "You withdrew consent, so they can no longer access Nevo.";
}

function schoolPhrase(inv: DataSubject | null): string {
  return inv?.schoolName ?? "your child’s school";
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-nevo-cream px-5 py-8 text-nevo-near-black">
      <div className="mx-auto w-full max-w-[560px]">{children}</div>
    </main>
  );
}

function Footer({ school }: { school: DataSubject | null }) {
  // The school's own contact details are shown ONLY when they exist. They come
  // from the billing contact and are null for most schools, and a "call your
  // school" line with nothing after it is worse than not offering the route.
  const phone = school?.schoolPhone;
  const email = school?.schoolEmail;
  return (
    <div className="mt-7 pb-4 text-center text-[13px] leading-[1.6] text-nevo-near-black/55">
      {(phone || email) && (
        <p className="m-0 mb-1.5">
          {school?.schoolName}:{" "}
          {phone && (
            <a
              href={`tel:${phone.replace(/\s+/g, "")}`}
              className="font-medium text-nevo-navy underline underline-offset-2"
            >
              {phone}
            </a>
          )}
          {phone && email ? " · " : ""}
          {email && (
            <a
              href={`mailto:${email}`}
              className="font-medium text-nevo-navy underline underline-offset-2"
            >
              {email}
            </a>
          )}
        </p>
      )}
      <p className="m-0">
        Need help? Contact{" "}
        <a
          href="mailto:support@nevolearning.com"
          className="font-medium text-nevo-navy underline underline-offset-2"
        >
          support@nevolearning.com
        </a>
      </p>
      <p className="m-0 mt-1.5">
        You can also contact the Nigeria Data Protection Commission (NDPC) at{" "}
        <a
          href="https://ndpc.gov.ng"
          className="font-medium text-nevo-navy underline underline-offset-2"
          rel="noreferrer noopener"
          target="_blank"
        >
          ndpc.gov.ng
        </a>
      </p>
    </div>
  );
}
