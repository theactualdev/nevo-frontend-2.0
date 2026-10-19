"use client";

import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/hooks";
import { getSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/**
 * Where 00d's Back goes (D189), and 00e's (Lydia, 17 Oct): the device picker,
 * for whoever is next.
 */
export const WAITING_WAY_BACK = "/auth/login";

/**
 * Frame 00d / SE-01 - Waiting on Consent.
 *
 * **WHAT THIS SCREEN DELIBERATELY DOES NOT DO**, because the frame spends more
 * words on that than on what it shows: *"Says Nevo isn't ready, says it will be
 * soon, nothing more. No progress, no countdown, no refresh, no door held shut.
 * When consent arrives, opening the link again goes straight to the assessment
 * - no action needed."*
 *
 * It replaced a gate that POLLED. So there is no interval here, no retry
 * button, no "checking..." and no live region - and their absence is the
 * feature. A child is not kept at a spinner for a decision an adult makes on
 * another day; they close the link and come back. Anything that re-checks on a
 * timer re-creates the screen this replaces.
 *
 * There is no way ONWARD from here on purpose: the only thing that changes
 * this state is an adult, elsewhere.
 *
 * BUT THERE IS A WAY BACK (D189, 13 Oct). Lydia: "Waiting on consent is a
 * genuine dead end and gets fixed ... Yes, give it Back, same as the age-check
 * hold. On a shared tablet one child waiting on consent currently holds the
 * device hostage for everyone else until the app is restarted. Back goes to
 * the device picker." So the age-check hold's Back - the chevron, top left -
 * and it leaves; it moves nothing along.
 *
 * A child sent here from a door is SIGNED IN, so Back signs them out first,
 * by a hard navigation, as every sign-out is: the route guard would read the
 * student cookie, send them to Home, and the consent gate would send them
 * straight back here. A child held in place on 05 Entry has no session to
 * end.
 *
 * Primary case is the shared classroom tablet at 768x1024, which is why the
 * copy is centred in the viewport rather than near the top.
 */
export type WaitingHold = "consent" | "age-check";

/**
 * 00d's words, and the age check's.
 *
 * THE AGE CHECK'S ARE THE ENTRY FRAME'S "ON HOLD" STATE (D121, drawn 6 Oct):
 * "the child is identified, but something on their record has to be settled
 * with the school before they go on ... a calm hold with no button, because
 * nothing a child can do moves it along, and no timeframe, because nobody
 * controls one. It never names age, dates, records, checks or verification,
 * never blames the school". It replaced backend's stand-in, "Nevo is
 * checking something with your school" and "Come back in a day or two", which
 * named a check and promised a timeframe.
 */
export const WAITING_COPY: Record<
  WaitingHold,
  { heading: string; line: string }
> = {
  consent: {
    heading: "Nevo isn't quite ready for you yet",
    line: "It will be soon.",
  },
  "age-check": {
    heading: "Nevo is sorting something out with your school",
    line: "It's nothing you did, and there's nothing for you to fix.",
  },
};

export function WaitingOnConsent({
  hold = "consent",
}: {
  /** What holds the child. Changes the words only, never the screen. */
  hold?: WaitingHold;
} = {}) {
  return (
    <div className="flex min-h-dvh flex-col bg-nevo-cream">
      <HoldWayBack />

      <HoldMessage
        hold={hold}
        className="min-h-0 flex-1 justify-center px-10"
      />
    </div>
  );
}

/**
 * The holds' top row: the age-check hold's Back (D189), then the same cropped
 * wordmark as the PIN beat and the picker, so the doors do not drift apart.
 *
 * 00d's, and since Lydia's ruling of 17 Oct 00e Consent Withdrawn's too:
 * "Consent Withdrawn: yes, give it Back, same as waiting-on-consent ... A
 * shared device should not be stuck." One row for both, so the two holds
 * cannot come to leave differently.
 *
 * Back signs a signed-in child out first and then goes to the device picker,
 * by a hard navigation - see `WaitingOnConsent`. A child held in place on 05
 * Entry has no session to end, so nobody is signed out.
 */
export function HoldWayBack() {
  const { signOut } = useAuth();
  const back = () => {
    if (getSession()) signOut();
    window.location.assign(WAITING_WAY_BACK);
  };

  return (
    <div className="flex h-[60px] shrink-0 items-center px-4">
      <button
        type="button"
        aria-label="Back"
        onClick={back}
        className="flex size-11 cursor-pointer items-center justify-center rounded-[10px] transition-colors hover:bg-nevo-near-black/[0.06] active:bg-nevo-near-black/[0.12]"
      >
        <ChevronLeft className="size-6 text-nevo-near-black" strokeWidth={2} />
      </button>
      <span className="relative ml-1.5 block h-[15px] w-12 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-wordmark-purple.png"
          alt="Nevo"
          className="absolute block h-[152px] w-[152px] max-w-none -translate-x-[55px] -translate-y-[74px]"
        />
      </span>
    </div>
  );
}

/**
 * The hold itself - the breathing mark, the heading and the line - without
 * the screen around it. 00d puts it under its own wordmark; the Entry frame's
 * "On hold" state (05, state 6) keeps the entry screen's chevron row and Back
 * around the same three things (`AgeCheckHold`).
 */
export function HoldMessage({
  hold,
  className,
}: {
  hold: WaitingHold;
  className?: string;
}) {
  const { heading, line } = WAITING_COPY[hold];
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      {/*
        AMBIENT, NOT A PROGRESS INDICATOR, and the difference is the whole
        instruction. It breathes at a fixed rate and never fills, advances or
        completes - a spinner would say "wait here", which is the one thing
        this screen is not allowed to say.

        `motion-safe:` so it simply does not run for a child who asked for
        less motion; nothing is lost, because it carries no information.
      */}
      <span
        aria-hidden="true"
        className="mb-[30px] block size-[76px] rounded-full bg-nevo-violet/28 motion-safe:animate-nevo-breathe sm:mb-[34px] sm:size-23"
      />

      {/* 00d and the hold draw the phone a size down: 76px, 23px, 16px. */}
      <h1 className="m-0 max-w-[300px] text-[23px] leading-[1.3] font-medium tracking-[-0.01em] text-nevo-near-black sm:max-w-[440px] sm:text-[27px]">
        {heading}
      </h1>
      <p className="mt-[18px] max-w-[280px] text-base leading-[1.6] text-nevo-near-black/70 sm:max-w-[420px] sm:text-[17px]">
        {line}
      </p>
    </div>
  );
}
