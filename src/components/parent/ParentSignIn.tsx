"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import { parentApi } from "@/lib/api/parent";
import { setSession } from "@/lib/auth/session";

/**
 * D03 Parent Sign-In. How a returning parent gets back in.
 *
 * WHY THIS MATTERS MORE THAN ITS SIZE. Until this existed, a parent's only way
 * into the portal was the original consent link, and that link dies: the
 * invitation carries `expiresAt`, and a spent or expired token 404s into "It
 * may have expired or been replaced by a newer one." So a parent who gave
 * consent, closed the tab and came back a week later had no route in at all,
 * and `/parent-portal` told them to "Open the link your school sent you" -
 * advice that is wrong for someone who has an account and useless to someone
 * whose link is dead. D01c exists to guarantee an NDPA right; a right you
 * cannot reach is not one.
 *
 * NO PASSWORD ANYWHERE. `POST /consents/parent/{token}/account` and
 * `POST /auth/login/parent` were both removed on 11 Sep - "gone, not
 * deprecated". A code to the email address the school holds is the whole of
 * parent auth now: nothing for a parent to remember or reset.
 *
 * THE RESPONSE IS UNIVERSAL, and that is the point of the screen rather than a
 * detail of it. D03: "whatever the parent types, the next screen is the same,
 * so it never reveals whether an account exists for that address." Backend
 * enforces the same rule from its side - `request-code` answers 202 either way,
 * "A 'we could not find an account' reply on a surface tied to named children
 * is a way to find out which families use Nevo, one address at a time." So
 * there is nothing here to branch on, and no error state for "we don't know
 * you" to occupy. A throttled send answers identically too.
 *
 * EMAIL ONLY, AS D03 DRAWS IT (SCRUM-126). The field took a phone number
 * too, built to design's 14 Sep "SMS is the path to get right" before
 * SCRUM-162 (20 Sep) made parent contact email only. It was held open until
 * the backend half of SCRUM-162 landed, because narrowing it early would have
 * locked out parents whose school recorded a phone. That has landed:
 * `ParentContactMethod` is `email` and nothing else ("SMS was removed on 20
 * September by ruling"). So a code sent to a phone went nowhere, and the
 * screen said "Check your phone" over a dead end. Refusing it at the field is
 * the honest version.
 *
 * ONE DEVIATION FROM D03, flagged to design rather than resolved here: THE
 * RESEND READS "Send it again". D03 draws "Resend code"; the 14 Sep ruling
 * says "Send it again" and says it for both paths. Two parent auth screens
 * with two wordings for one action is the worse outcome, so this follows the
 * newer wording.
 */

/** Shape only - never a verdict on whether the address is known. */
function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

const FIELD =
  "mt-1.5 h-[52px] w-full rounded-[10px] border border-nevo-navy/20 bg-nevo-cream px-3.5 text-[16px] text-nevo-near-black outline-none focus:border-nevo-navy/45";
const PRIMARY =
  "mt-5 h-[52px] w-full cursor-pointer rounded-[10px] bg-nevo-navy text-[15px] font-semibold text-nevo-cream transition-[filter] duration-[120ms] hover:brightness-93 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55";
const TEXT_BTN =
  "mt-3 h-[44px] w-full cursor-pointer text-[14px] font-medium text-nevo-navy";

export function ParentSignIn() {
  const [contact, setContact] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const code = digits.join("");

  async function send(isResend: boolean) {
    const value = contact.trim();
    if (!looksLikeEmail(value)) {
      // Shape only. This is NOT "we don't know that address" - the screen
      // cannot know that, and must never imply it.
      setError("Enter an email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await parentApi.requestCode(value);
      setSent(value);
      setDigits(["", "", "", ""]);
      if (isResend) setResent(true);
    } catch {
      // A transport failure is ours. `request-code` answers 202 whether or not
      // it knows the contact, so anything else is our problem and must not be
      // reported as a verdict on the address.
      setError("We couldn’t send that code just now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.length !== 4 || !sent) return;
    setBusy(true);
    setError(null);
    try {
      const session = await parentApi.verifyCode(sent, code);
      setSession({
        token: session.accessToken,
        expiresAt: session.expiresAt,
        userId: session.userId,
        role: session.role,
      });
      // A hard navigation: the session and its mirror cookie must have settled
      // before the portal is asked for.
      window.location.assign("/parent-portal");
    } catch (e) {
      setBusy(false);
      setDigits(["", "", "", ""]);
      // ONE MESSAGE for wrong and for expired, because the contract has one
      // code for both. Splitting them tells a caller their guess was
      // structurally right and only late, and "expired" confirms a code was
      // issued, which confirms the contact is known.
      setError(
        e instanceof ApiError
          ? "That code is wrong or has expired. Ask for a new one."
          : "We couldn’t check that code just now. Please try again.",
      );
    }
  }

  function setDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setDigits((d) => d.map((x, i) => (i === index ? digit : x)));
    setError(null);
    if (digit && index < 3) {
      document.getElementById("parent-signin-" + (index + 1))?.focus();
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-nevo-cream px-6 py-10 text-nevo-near-black">
      <div className="w-full max-w-[340px]">
        <p className="text-[13px] text-nevo-near-black/55">Learning, made fluid.</p>

        {sent === null ? (
          <>
            <h1 className="mt-5 text-[26px] font-semibold tracking-[-0.01em]">
              Welcome back
            </h1>

            <label
              htmlFor="parent-contact"
              className="mt-7 block text-[14px] font-medium text-nevo-near-black/80"
            >
              Email address
            </label>
            <input
              id="parent-contact"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={contact}
              onChange={(e) => {
                setContact(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send(false);
              }}
              className={FIELD}
            />

            <button
              type="button"
              className={PRIMARY}
              disabled={busy}
              onClick={() => void send(false)}
            >
              {busy ? "Sending…" : "Sign in"}
            </button>

            <a
              href="/parent-portal"
              className="mt-3 block h-[44px] text-center text-[14px] font-medium leading-[44px] text-nevo-navy"
            >
              I don’t have an account yet
            </a>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-[26px] font-semibold tracking-[-0.01em]">
              Check your email
            </h1>
            <p className="mt-3 text-[15px] leading-[1.55] text-nevo-near-black/72">
              If that address has an account, we’ve sent a code. Enter it below.
            </p>

            <p className="mt-6 text-[14px] font-medium text-nevo-near-black/80">
              Verification code
            </p>
            <div className="mt-1.5 flex gap-2.5">
              {digits.map((d, i) => (
                <input
                  key={i}
                  id={"parent-signin-" + i}
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  maxLength={1}
                  aria-label={"Digit " + (i + 1) + " of 4"}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !digits[i] && i > 0) {
                      document.getElementById("parent-signin-" + (i - 1))?.focus();
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
              {busy ? "Checking…" : "Continue"}
            </button>
            <button
              type="button"
              className={TEXT_BTN}
              disabled={busy}
              onClick={() => void send(true)}
            >
              Send it again
            </button>
            <button
              type="button"
              className={TEXT_BTN}
              disabled={busy}
              onClick={() => {
                setSent(null);
                setDigits(["", "", "", ""]);
                setError(null);
                setResent(false);
              }}
            >
              Try a different email
            </button>
          </>
        )}

        {(error || resent) && (
          <p
            role="alert"
            className="mt-4 text-[13.5px] leading-[1.5] text-nevo-navy"
          >
            {/* A resend retires the previous code, so say so: a parent looking
                at two messages needs to know which one still works. */}
            {error ?? "We’ve sent a new code. The one before it no longer works."}
          </p>
        )}
      </div>
    </main>
  );
}
