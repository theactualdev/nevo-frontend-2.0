"use client";

import { useState } from "react";
import { useSetupGate } from "@/hooks";
import { emailConfirmationApi } from "@/lib/api/emailConfirmation";
import { cn } from "@/lib/utils";
import { changeEmailFailure } from "./Onboarding/changeEmailOutcome";
import { CARD } from "./Roster/primitives";

/**
 * D01b AC-05 - the console an administrator gets before they confirm.
 *
 * *"Confirm your email to start setting up. You can look around, but changes
 * are paused until you confirm."*
 *
 * NOT AN ERROR, AND NOT A NAG. The frame is explicit that the rest of the
 * console stays reachable, and D24 puts the same idea more plainly still:
 * *"Not empty - inert. It is obvious the school is off and why."* So this is a
 * card that states a fact and offers the one action that clears it - no red, no
 * alarm glyph, no repetition of it on every screen.
 *
 * ABSENT WHEN NOTHING IS PAUSED, and absent while the gate is unresolved. A
 * banner that flickers in on a slow read and out again is worse than one that
 * arrives late, and `useSetupGate` never reports paused on a failed read.
 *
 * ONLY THE EMAIL REASON RENDERS HERE. `not_active` is D24 OB-00's, and OB-00
 * is a whole dashboard rather than a banner on this one - three moments, a
 * headcount panel and a payment state. Putting a one-line version of it here
 * would be the third description of the same thing.
 */
export function SetupPausedBanner() {
  const { pause, email, refresh } = useSetupGate();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [failed, setFailed] = useState(false);
  const [changing, setChanging] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  /** The address a fresh link just went to, after a change. */
  const [movedTo, setMovedTo] = useState<string | null>(null);

  if (pause !== "email_unconfirmed") return null;

  /*
   * AC-05's "Change email". PATCH /api/v1/admin/email authenticates by the
   * session, which is exactly what a signed-in admin has - so a mistyped
   * address is fixable here, where before it was not fixable anywhere once
   * the wizard tab was closed. The expired-link page (AC-03) sends people
   * here with "Sign in and you can change it there"; this is what makes that
   * sentence true.
   *
   * A successful change supersedes every outstanding link and sends a fresh
   * one, and the gate re-reads so the banner names the new address.
   */
  const saveEmail = () => {
    const next = draft.trim();
    if (!next) return;
    setSaving(true);
    setChangeError(null);
    emailConfirmationApi
      .changeEmail(next)
      .then((s) => {
        setMovedTo(s.email ?? next);
        setChanging(false);
        setResent(false);
        setFailed(false);
        refresh();
      })
      .catch((err: unknown) => {
        const failure = changeEmailFailure(err);
        if (failure.confirmedElsewhere) {
          // Confirmed in another tab: the banner's job is done.
          setChanging(false);
          refresh();
          return;
        }
        setChangeError(failure.message);
      })
      .finally(() => setSaving(false));
  };

  const resend = () => {
    setResending(true);
    setResent(false);
    setFailed(false);
    emailConfirmationApi
      .resend()
      .then(() => setResent(true))
      .catch(() => setFailed(true))
      .finally(() => setResending(false));
  };

  return (
    <div className={cn(CARD, "mt-5 px-[26px] py-[22px]")}>
      <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
        Confirm your email to start setting up
      </h3>
      <p className="mt-2 max-w-[62ch] text-[14.5px] leading-[1.55] text-nevo-near-black/68">
        You can look around, but changes are paused until you confirm.
        {/*
          * The address only when the server named one. `email` is nullable,
          * and "We sent a link to ." is worse than not saying where it went.
          */}
        {email ? ` We sent a link to ${email}.` : " We've sent you a link."}
      </p>

      {movedTo ? (
        <p className="mt-3 text-[13.5px] font-semibold text-nevo-navy">
          Changed. We&rsquo;ve sent a new link to {movedTo}.
        </p>
      ) : null}
      {resent ? (
        <p className="mt-3 text-[13.5px] font-semibold text-nevo-navy">
          Sent. It may take a minute to arrive.
        </p>
      ) : null}
      {failed ? (
        <p className="mt-3 max-w-[52ch] text-[13.5px] leading-[1.5] text-nevo-navy">
          We couldn&rsquo;t send that just now. Your first link is still valid
          &ndash; try again in a moment.
        </p>
      ) : null}

      {changing ? (
        <div className="mt-4 flex max-w-[440px] flex-col gap-2.5">
          <label className="text-[13px] font-medium text-nevo-near-black/62">
            The right address
            <input
              type="email"
              autoComplete="email"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setChangeError(null);
              }}
              placeholder="you@yourschool.edu.ng"
              className="mt-2 w-full rounded-[10px] border border-nevo-near-black/12 bg-nevo-cream px-4 py-3 text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy"
            />
          </label>
          {changeError ? (
            <p className="m-0 text-[13.5px] leading-[1.5] text-nevo-navy">{changeError}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={saveEmail}
              disabled={saving || !draft.trim()}
              className="h-[44px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-60"
            >
              {saving ? "Changing…" : "Use this address"}
            </button>
            <button
              type="button"
              onClick={() => {
                setChanging(false);
                setChangeError(null);
              }}
              className="h-[44px] cursor-pointer rounded-[10px] px-4 text-sm font-semibold text-nevo-near-black/70 transition-colors hover:bg-nevo-near-black/[0.05]"
            >
              {email ? `Keep ${email}` : "Cancel"}
            </button>
          </div>
        </div>
      ) : (
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="h-[44px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-60"
        >
          {resending ? "Sending…" : "Resend link"}
        </button>
        <button
          type="button"
          onClick={() => {
            setChanging(true);
            setDraft("");
            setMovedTo(null);
          }}
          className="h-[44px] cursor-pointer rounded-[10px] border-[1.5px] border-nevo-near-black/18 px-5 text-sm font-semibold text-nevo-near-black transition-colors hover:bg-nevo-near-black/[0.04]"
        >
          Change email
        </button>
        {/*
          * "I'VE CONFIRMED IT", beside the frame's two.
          *
          * ~~This took the place of "Change email", because nothing in the
          * deployed contract wrote an administrator's address.~~ That was
          * wrong: PATCH /api/v1/admin/email is session-authenticated and was
          * there to be called. Change email is above now.
          *
          * The re-check stays because the banner has a problem the wizard
          * does not: somebody who confirms in another tab has no reason to
          * reload this one, and would sit looking at a card telling them to do
          * something they have already done. The wizard step polls; a console
          * banner polling forever is a request every five seconds for as long
          * as the tab is open, so the re-check is offered instead of assumed.
          */}
        <button
          type="button"
          onClick={refresh}
          className="h-[44px] cursor-pointer rounded-[10px] px-4 text-sm font-semibold text-nevo-near-black/70 transition-colors hover:bg-nevo-near-black/[0.05]"
        >
          I&rsquo;ve confirmed it
        </button>
      </div>
      )}
    </div>
  );
}
