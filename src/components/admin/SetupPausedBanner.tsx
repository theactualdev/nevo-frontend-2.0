"use client";

import { useState } from "react";
import { useSetupGate } from "@/hooks";
import { emailConfirmationApi } from "@/lib/api/emailConfirmation";
import { cn } from "@/lib/utils";
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

  if (pause !== "email_unconfirmed") return null;

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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className="h-[44px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-60"
        >
          {resending ? "Sending…" : "Resend link"}
        </button>
        {/*
          * "I'VE CONFIRMED IT" RATHER THAN THE FRAME'S "Change email".
          *
          * AC-05 draws Resend and Change email. Nothing in the deployed
          * contract writes an administrator's address - the same absence as
          * D01 step 2 and D01b AC-03 - so that control cannot be built and is
          * raised rather than faked.
          *
          * This takes its place because the banner has a problem the wizard
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
    </div>
  );
}
