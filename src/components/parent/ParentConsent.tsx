"use client";

import Image from "next/image";
import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import { setSession } from "@/lib/auth/session";
import {
  parentApi,
  type ParentContactMethod,
  type ParentInvitation,
} from "@/lib/api/parent";

/**
 * D01b Parent Consent (SCRUM-80).
 *
 * What a parent opens when the school sends a consent request. Unauthenticated,
 * no Nevo account: a link by email. Plain language, no jargon, no dark
 * patterns.
 *
 * EMAIL ONLY, SCRUM-162 (20 Sep). This screen was built phone-first - "a link
 * by SMS or email" - because Nigeria is SMS-first and that was the standing
 * position. The ruling reverses it on data-minimisation grounds: *"You cannot
 * collect personal data you have no use for."* Deliverability, which was the
 * argument for keeping phone, is answered instead by the written-consent route
 * (SCRUM-158) - a paper form in the child's bag - which covers the gap better
 * than SMS did.
 *
 * WHAT THAT DOES NOT MEAN: that no record says `sms`. The deployed
 * `ParentContactMethod` is still `email | sms` (re-checked 21 Sep) and the
 * backend half of the ruling has not landed, so an invitation created before it
 * can still arrive here declaring SMS. The receipt line below is therefore
 * written to be true under either value rather than asserting a channel.
 *
 * ONE BLANKET CONSENT, ONE TAP. Design ruled this on 7 Sep: the DSA already
 * defines the scope of processing, so the single "Yes" is correct and there are
 * no per-type toggles. `ConsentType` has three members but the invitation path
 * only ever requests `data_processing` today, so the tap grants exactly what
 * `invitation.consentTypes` carries - currently one thing.
 *
 * NO PRONOUNS FOR A CHILD WE HAVE NOT BEEN TOLD ABOUT. This screen was written
 * from the Amara frame and carried "she" and "her" seven times - on the first
 * page a parent ever sees, about their own child, on a page whose entire job is
 * to be trustworthy. The payload carries a NAME and no pronoun. So the name is
 * used where it reads naturally and "they" everywhere else, which is correct for
 * every child rather than half of them.
 *
 * NO DARK PATTERNS is a literal requirement, not a tone note. "I have a question
 * first" is given equal footing rather than buried, nothing is pre-ticked, and
 * the screen never implies that declining is unavailable - it simply is not an
 * action here. A parent who does not consent closes the tab, and the child stays
 * as they were.
 */

type Phase = "idle" | "asking" | "sending" | "done" | "skipped" | "failed" | "gone";

const CARD =
  "rounded-[14px] bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]";
const BODY = "mt-3 text-[15px] leading-[1.6] text-nevo-near-black/68";
const PRIMARY =
  "mt-4 flex h-[54px] w-full items-center justify-center rounded-[12px] bg-nevo-navy px-5 text-[16px] font-semibold text-nevo-cream transition-transform active:scale-[0.99] disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed";
const TEXT_BTN =
  "mt-2 flex h-11 w-full items-center justify-center text-[15px] font-semibold text-nevo-navy cursor-pointer";
const GHOST =
  "mt-2 flex h-[52px] w-full items-center justify-center rounded-[12px] border-[1.5px] border-nevo-near-black/18 text-[15px] font-semibold text-nevo-near-black cursor-pointer";

/** The three promises, in the frame's order. Icons are the frame's own. */
const POINTS = [
  {
    key: "does",
    title: (c: string) => `What ${c} does`,
    body: (c: string) => `Lessons ${c}’s teachers set, at their own pace.`,
    icon: (
      <path d="M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 0-2 2zM20 5a2 2 0 0 0-2-2h-6v18h6a2 2 0 0 1 2 2z" />
    ),
  },
  {
    key: "keep",
    title: () => "What we keep",
    body: (c: string) =>
      `${c}’s name, class, and how they’re getting on - shared only with their school.`,
    icon: (
      <>
        <path d="M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 21.3 5 17.4 5 13V6z" />
        <path d="M9.5 12.5l1.8 1.8 3.2-3.6" />
      </>
    ),
  },
  {
    key: "control",
    title: () => "You stay in control",
    body: (c: string) =>
      `You can withdraw any time. ${sentenceCase(c)}’s progress is always saved.`,
    icon: (
      <path d="M12 20s-6.5-4.2-9-8.2C1.5 9 3 5.5 6.2 5.5c2 0 3.2 1.2 3.8 2.3.6-1.1 1.8-2.3 3.8-2.3C21 5.5 22.5 9 21 11.8c-2.5 4-9 8.2-9 8.2z" />
    ),
  },
];

export function ParentConsent({
  token,
  invitation,
}: {
  token: string;
  invitation: ParentInvitation;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  // Where a copy of the decision actually went, straight from the receipt. The
  // line is rendered only when there IS one - the screen never assumes.
  const [receipt, setReceipt] = useState<ParentContactMethod | null>(null);

  // The API sends the LITERAL string "your child" when the school entered no
  // first name - it is a real row, not a hypothetical - so the name has to be
  // capitalised wherever it opens a sentence. See `sentenceCase` below.
  const child = invitation.studentFirstName;
  const childLead = sentenceCase(child);

  async function consent() {
    setPhase("sending");
    try {
      /*
       * `grantedTypes` is what the INVITATION asked about, not a list this
       * screen composes. Backend used to infer it from the token and now
       * requires it stated; sending the invitation's own list keeps what a
       * parent grants exactly as it was.
       *
       * THE ONE-TAP RULING AND THE CONTRACT NOW DISAGREE, and this is the
       * raise rather than the resolution. Design ruled on 7 Sep that one
       * blanket "Yes" is correct because the DSA defines the scope. The
       * contract's new `ConsentType` description says the opposite: *"Each is
       * asked and answered on its own."* Both cannot hold on a screen with one
       * button.
       *
       * It does not bite yet: the invitation path only ever requests
       * `data_processing`, so one tap grants one thing and the two positions
       * agree by accident. The first invitation carrying two types — most
       * obviously `cross_border_transfer`, which the contract singles out — is
       * the moment this screen starts recording a consent nobody was
       * separately asked for. Needs a design ruling before that happens, not
       * after.
       */
      const res = await parentApi.completeConsent(token, invitation.consentTypes);
      setReceipt(res.receiptSentTo);
      setPhase("done");
    } catch (e) {
      // 404 covers unknown, revoked and expired - the same dead end, and the
      // same fix: the school issues a fresh link.
      setPhase(e instanceof ApiError && e.status === 404 ? "gone" : "failed");
    }
  }

  if (phase === "gone") {
    return (
      <Shell>
        <div className={CARD}>
          <h1 className="text-[21px] font-semibold text-nevo-near-black">
            This link is no longer active
          </h1>
          <p className={BODY}>
            It may have expired or been replaced by a newer one. Contact{" "}
            {invitation.schoolName} and they can send you a fresh one.
          </p>
        </div>
      </Shell>
    );
  }

  if (phase === "done") {
    return (
      <Shell>
        <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
          <span className="flex size-[76px] items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-500">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          <h1 className="mt-6 text-[23px] font-semibold leading-[1.3] tracking-[-0.01em] text-nevo-near-black">
            Thank you. That&rsquo;s all we needed.
          </h1>
          <p className="mt-3 max-w-[320px] text-[15px] leading-[1.6] text-nevo-near-black/68">
            {childLead} can start learning with their class. Set up an account
            and you can follow how they&rsquo;re getting on, whenever you like.
          </p>

          <AccountSetup
            token={token}
            /* The contact the SCHOOL entered. Passed down rather than asked
               for: it is what the code is bound to, and asking a parent to
               type it would both duplicate a fact we hold and open the door
               the binding exists to close. */
            contact={invitation.parentContact}
            onSkip={() => setPhase("skipped")}
          />

          {receipt && (
            <p className="mt-6 text-center text-[12px] leading-[1.5] text-nevo-near-black/50">
              A copy of your consent has been sent to you.
            </p>
          )}
        </div>
      </Shell>
    );
  }

  if (phase === "skipped") {
    return (
      <Shell>
        <div className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
          <h1 className="text-[23px] font-semibold leading-[1.3] tracking-[-0.01em] text-nevo-near-black">
            All done. Thank you.
          </h1>
          <p className="mt-3 max-w-[320px] text-[15px] leading-[1.6] text-nevo-near-black/68">
            {childLead} can start learning with their class. You can set up an
            account later from the same link.
          </p>
          {receipt && (
            <p className="mt-6 text-[12px] leading-[1.5] text-nevo-near-black/50">
              A copy of your consent has been sent to you.
            </p>
          )}
        </div>
      </Shell>
    );
  }

  if (phase === "asking") {
    return (
      <Shell>
        <div className="flex items-center gap-3">
          {/* "Back", not "Back to the request": the ghost button at the foot
              of this screen already carries that name, and two controls with
              the same accessible name is a genuine ambiguity for anyone
              navigating by voice or a screen reader's control list. */}
          <button
            type="button"
            aria-label="Back"
            onClick={() => setPhase("idle")}
            className="flex size-[38px] cursor-pointer items-center justify-center rounded-[10px] bg-nevo-cream-elevated text-nevo-near-black"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-[15px] font-semibold text-nevo-near-black">
            Before you decide
          </span>
        </div>

        <h1 className="mt-6 text-[22px] font-semibold leading-[1.3] tracking-[-0.01em] text-nevo-near-black">
          Any question is welcome, and {child}&rsquo;s school can help.
        </h1>
        <p className={BODY}>
          Nothing happens until you&rsquo;re ready, and consent is never assumed.
          {hasContact(invitation)
            ? " Reach the school directly:"
            : " Your school can answer any question about this request."}
        </p>

        <div className="mt-5 rounded-[12px] bg-nevo-cream-elevated px-[22px] py-5">
          <div className="text-[16px] font-semibold text-nevo-near-black">
            {invitation.schoolName}
          </div>
          {/*
            * The school's own phone and email are NULL for most schools today -
            * they come from the billing contact. So this degrades to naming the
            * school rather than rendering an empty row or a dead `tel:` link,
            * and Nevo's own support line is always offered underneath.
            */}
          {hasContact(invitation) ? (
            <div className="mt-3.5 flex flex-col gap-3">
              {invitation.schoolPhone && (
                <ContactRow
                  href={`tel:${invitation.schoolPhone.replace(/\s+/g, "")}`}
                  label={invitation.schoolPhone}
                  icon={
                    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L8 11.5a16 16 0 0 0 6 6l1-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z" />
                  }
                />
              )}
              {invitation.schoolEmail && (
                <ContactRow
                  href={`mailto:${invitation.schoolEmail}`}
                  label={invitation.schoolEmail}
                  icon={
                    <>
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="M3 7l9 6 9-6" />
                    </>
                  }
                />
              )}
            </div>
          ) : (
            <p className="mt-2 text-[14.5px] leading-[1.55] text-nevo-near-black/68">
              Contact the school the way you normally would. They sent you
              this request and can explain it.
            </p>
          )}
        </div>

        <p className="mt-4 text-center text-[13px] leading-[1.6] text-nevo-near-black/55">
          You can also reach Nevo at{" "}
          <a
            href="mailto:support@nevolearning.com"
            className="font-medium text-nevo-navy underline underline-offset-2"
          >
            support@nevolearning.com
          </a>
        </p>

        <button type="button" className={GHOST} onClick={() => setPhase("idle")}>
          Back to the request
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex justify-center">
        <Image
          src="/brand/nevo-wordmark.png"
          alt="Nevo"
          width={344}
          height={116}
          priority
          className="h-5 w-auto"
        />
      </div>

      <div className="mt-7">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-nevo-violet">
          {invitation.schoolName}
        </div>
        <h1 className="mt-3 text-[24px] font-semibold leading-[1.25] tracking-[-0.01em] text-nevo-near-black">
          {childLead}&rsquo;s school would like your okay to get {child} started
          on Nevo.
        </h1>
        <p className={BODY}>
          Nevo is the school&rsquo;s learning platform, personalised
          learning for every student. As {child}&rsquo;s parent or guardian, your
          consent is all we need before they begin.
        </p>
      </div>

      {/* Mobile stacks them as rows, icon beside the words. Desktop is the
          frame's three-column grid, each cell centred on its own icon. Same
          three promises either way - the layout changes, the content does not. */}
      <div className="mt-6 grid gap-3.5 md:grid-cols-3">
        {POINTS.map((p) => (
          <div
            key={p.key}
            className="flex items-start gap-3.5 md:flex-col md:items-center md:rounded-[12px] md:bg-nevo-cream md:px-3.5 md:py-4 md:text-center"
          >
            <span className="flex size-[38px] flex-none items-center justify-center rounded-[10px] bg-nevo-violet/20 text-nevo-navy">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {p.icon}
              </svg>
            </span>
            <div className="md:mt-2.5">
              <div className="text-[14.5px] font-semibold text-nevo-near-black">
                {p.title(child)}
              </div>
              <div className="mt-1 text-[13.5px] leading-[1.5] text-nevo-near-black/64">
                {p.body(child)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className={PRIMARY}
        disabled={phase === "sending"}
        onClick={() => void consent()}
      >
        {phase === "sending" ? "Recording…" : "Yes, I give my consent"}
      </button>
      <button
        type="button"
        className={TEXT_BTN}
        disabled={phase === "sending"}
        onClick={() => setPhase("asking")}
      >
        I have a question first
      </button>

      {phase === "failed" && (
        <p
          role="alert"
          className="mt-3.5 rounded-[10px] bg-nevo-violet/14 px-4 py-3 text-[14px] leading-[1.5] text-nevo-near-black/80"
        >
          We couldn&rsquo;t record that just now. Nothing has changed.
          please try again in a moment.
        </p>
      )}

      <p className="mt-4 text-center text-[12px] leading-[1.5] text-nevo-near-black/50">
        Sent to you by {invitation.schoolName}.
        <br />
        Your details are never sold or shared beyond the school.
      </p>
    </Shell>
  );
}

/**
 * D02 Parent Account Setup - "confirm the contact, verify a code, and land
 * straight in". Rendered here rather than at its own URL: the frame calls it a
 * standalone screen between D01b and D03, and the journey is identical, but the
 * consent token lives in this route. Flagged to design; moving it is a route
 * change, not a rewrite.
 *
 * WHAT THIS REPLACED. Until 11 Sep this asked for a password and posted it to
 * `POST /consents/parent/{token}/account`. That endpoint and
 * `POST /auth/login/parent` are both gone - "not deprecated" - and nothing on
 * the parent path takes a password any more. The replacement is better for the
 * families this product is for: password sign-in was email-only, so every
 * SMS-first parent hit a dead end that the old code had a whole state for
 * (`sms-only`). That state is deleted, because the limitation it explained no
 * longer exists.
 *
 * TWO DEVIATIONS FROM D02, both flagged to design rather than resolved here:
 *
 *  1. THE CONTACT IS NOT EDITABLE. D02 draws it pre-filled with "Change it if
 *     you'd prefer a different address." It cannot be editable on this path:
 *     backend binds the code to the contact the school entered whenever a token
 *     is present, precisely so "a link holder can't redirect a code to an
 *     address they chose". Making the field editable would either break the
 *     send or, if we dropped the token to make it work, hand whoever opens the
 *     link a way to point a child's account at themselves. So it is shown, not
 *     offered.
 *  2. ~~D02 SAYS "EMAIL" THROUGHOUT, and the copy follows the method the school
 *     recorded because Nigeria is SMS-first.~~ **RESOLVED BY SCRUM-162 (20 Sep):
 *     D02 was right and this deviation is withdrawn.** Parent contact is email
 *     only. The frame's wording is the wording.
 *
 *     THE BACKEND HALF HAS NOW LANDED. `ParentContactMethod` is a one-member
 *     enum on the deployed contract and has been since 20 Sep - we went on
 *     asserting otherwise in three comments for a day. So the prop is gone and
 *     the branch with it: there is no second channel to be truthful about.
 *
 *     What we give up by hard-coding D02's wording is the legacy case - an
 *     invitation created before the ruling whose `parentContact` is a phone
 *     number would now be labelled "Your email address". We accept that rather
 *     than branch on the contact string, because inferring a channel from the
 *     shape of an address is the exact guess `useConsentRequests` had removed
 *     from it, and that hook refuses to create such a request at all. If one
 *     ever surfaces it is a data bug with a visible symptom, which is better
 *     than a client that quietly keeps a withdrawn channel alive.
 */
function AccountSetup({
  token,
  contact,
  onSkip,
}: {
  token: string;
  contact: string;
  onSkip: () => void;
}) {
  const [step, setStep] = useState<"confirm" | "code">("confirm");
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const code = digits.join("");

  async function send(isResend: boolean) {
    setBusy(true);
    setError(null);
    try {
      await parentApi.requestCode(contact, token);
      setStep("code");
      setDigits(["", "", "", ""]);
      if (isResend) setResent(true);
    } catch {
      // A send failure is OURS, not a verdict on the contact - request-code
      // answers 202 whether or not it knows the address, so anything else is a
      // transport problem and must not be reported as "we don't know you".
      setError("We couldn’t send that code just now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      const session = await parentApi.verifyCode(contact, code);
      setSession({
        token: session.accessToken,
        expiresAt: session.expiresAt,
        userId: session.userId,
        role: session.role,
      });
      // A hard navigation, not a router push: the session and its mirror cookie
      // must have settled before the portal is asked for.
      window.location.assign("/parent-portal");
    } catch (e) {
      setBusy(false);
      setDigits(["", "", "", ""]);
      /*
       * ONE MESSAGE FOR WRONG AND FOR EXPIRED, because the contract has one
       * code for both. Backend: distinguishing them "tells an attacker their
       * guess was structurally right and only late - and worse, 'expired'
       * confirms a code was issued, which confirms the address is known."
       * Do not split this on `e.status` either; 401 is the only failure shape.
       */
      if (e instanceof ApiError) {
        setError("That code is wrong or has expired. Ask for a new one.");
      } else {
        setError("We couldn’t check that code just now. Please try again.");
      }
    }
  }

  function setDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setDigits((d) => d.map((x, i) => (i === index ? digit : x)));
    setError(null);
    if (digit && index < 3) {
      document.getElementById("parent-code-" + (index + 1))?.focus();
    }
  }

  if (step === "confirm") {
    return (
      <div className="mt-7 w-full max-w-[340px] text-left">
        <p className="text-[15px] leading-[1.5] text-nevo-near-black/80">
          This is how you&rsquo;ll sign in to check on your child&rsquo;s
          progress.
        </p>
        <p className="mt-4 text-[14px] font-medium text-nevo-near-black/80">
          Your email address
        </p>
        <p className="mt-1.5 rounded-[10px] border border-nevo-navy/20 bg-nevo-cream px-3.5 py-3.5 text-[16px] break-all text-nevo-near-black">
          {contact}
        </p>
        <p className="mt-1.5 text-[12.5px] leading-[1.45] text-nevo-near-black/50">
          From your school&rsquo;s records. To use a different one, ask your
          school to update it.
        </p>

        <button
          type="button"
          className={PRIMARY}
          disabled={busy}
          onClick={() => void send(false)}
        >
          {busy ? "Sending…" : "Continue"}
        </button>
        <button type="button" className={TEXT_BTN} disabled={busy} onClick={onSkip}>
          Maybe later
        </button>

        {error && (
          <p role="alert" className="mt-2 text-[13.5px] leading-[1.5] text-nevo-navy">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-7 w-full max-w-[340px] text-left">
      <p className="text-[15px] font-semibold text-nevo-near-black">
        Check your email.
      </p>
      <p className="mt-2 text-[14.5px] leading-[1.55] text-nevo-near-black/72">
        {"We’ve sent a code to " + contact + ". Enter it below to finish setting up your account."}
      </p>

      <div className="mt-4 flex gap-2.5">
        {digits.map((d, i) => (
          <input
            key={i}
            id={"parent-code-" + i}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            aria-label={"Digit " + (i + 1) + " of 4"}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) {
                document.getElementById("parent-code-" + (i - 1))?.focus();
              }
            }}
            className="h-[58px] w-[58px] rounded-[10px] border border-nevo-navy/20 bg-nevo-cream text-center text-[22px] text-nevo-near-black outline-none focus:border-nevo-navy/45"
          />
        ))}
      </div>

      <button
        type="button"
        className={PRIMARY}
        disabled={busy || code.length !== 4}
        onClick={() => void verify()}
      >
        {busy ? "Checking…" : "Verify and sign in"}
      </button>
      <button
        type="button"
        className={TEXT_BTN}
        disabled={busy}
        onClick={() => void send(true)}
      >
        Resend code
      </button>

      {(error || resent) && (
        <p role="alert" className="mt-2 text-[13.5px] leading-[1.5] text-nevo-navy">
          {/* A resend retires the previous code, so say so - a parent looking
              at two messages needs to know which one still works. */}
          {error ?? "We’ve sent a new code. The one before it no longer works."}
        </p>
      )}
    </div>
  );
}


function ContactRow({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a href={href} className="flex items-center gap-3 text-[14.5px] text-nevo-near-black">
      <span className="flex size-[34px] flex-none items-center justify-center rounded-[10px] bg-nevo-navy/10 text-nevo-navy">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </span>
      {label}
    </a>
  );
}

/** Whether the school gave us anything a parent could actually dial or email. */
function hasContact(inv: ParentInvitation): boolean {
  return Boolean(inv.schoolPhone || inv.schoolEmail);
}

/**
 * Capitalise a leading word without touching the rest. Deliberately not a
 * title-caser: a real first name arrives already cased, and forcing case would
 * mangle names like "de Souza".
 */
function sentenceCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Phone-first, because that is how a parent opens an SMS link - but the frame
 * also draws a desktop, and this screen had NO breakpoint at all: a 430px
 * column stretched down the middle of a laptop, which is not what was designed.
 *
 * Desktop is the frame's 560px card on the cream ground, centred vertically.
 * Mobile is untouched.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-nevo-cream px-6 py-7 text-nevo-near-black md:flex md:items-center md:justify-center md:px-8 md:py-12">
      <div className="mx-auto flex w-full max-w-[430px] flex-col md:max-w-[560px] md:rounded-[20px] md:bg-nevo-cream-elevated md:px-12 md:py-11 md:shadow-[0_12px_40px_rgba(0,0,0,0.10)]">
        {children}
      </div>
    </main>
  );
}
