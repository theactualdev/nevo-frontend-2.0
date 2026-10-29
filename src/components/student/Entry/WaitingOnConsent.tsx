"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/shared";
import { useAuth } from "@/hooks";
import { WAITING_ROUTE } from "@/lib/auth/consentHold";
import { studentDestination, UNCHECKED_ROUTE } from "@/lib/auth/entryGate";
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
 * IT NEVER SAYS "SOON", AND IT IS NOT A DEAD END (design 5bb9ee2, 28 Oct):
 * "Says Nevo is waiting for the school to confirm, never that it will be ready
 * soon (a promise we cannot keep, since consent may be slow or may never
 * come). It carries a calm way forward instead of ending at the browser: Check
 * again re-checks (if consent has arrived it goes straight to the
 * assessment) ... No countdown, no door held shut, never a dead end." It said
 * "It will be soon." until then.
 *
 * CHECK AGAIN IS THE CHILD'S, NEVER A TIMER. It replaced a gate that POLLED,
 * so there is still no interval here, no "checking..." and no live region:
 * one read when the child presses, through the caller (`onCheckAgain`), which
 * knows whether this child is signed in (`WaitingOnConsentPage`) or held in
 * place on 05 Entry. Still waiting is the same screen, unchanged. Where the
 * caller has nothing to re-check with, there is no Check again.
 *
 * The frame's "Ask your teacher" is not drawn yet: the frame draws a button
 * and says only that it "points to the person who can help", so what a tap
 * does is asked. The line still says it.
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
    line: "We are waiting for your school to confirm. You can check again, or ask your teacher.",
  },
  "age-check": {
    heading: "Nevo is sorting something out with your school",
    line: "It's nothing you did, and there's nothing for you to fix.",
  },
};

export function WaitingOnConsent({
  hold = "consent",
  onCheckAgain,
}: {
  /** What holds the child. Changes the words only, never the screen. */
  hold?: WaitingHold;
  /**
   * Read the child's consent again, and go on if it has come. 00d's alone:
   * the age check's hold has nothing a child can do (D121).
   */
  onCheckAgain?: () => Promise<unknown>;
} = {}) {
  const checking = useRef(false);
  const checkAgain = () => {
    // One read at a time: a second press while one is out does nothing.
    if (!onCheckAgain || checking.current) return;
    checking.current = true;
    void onCheckAgain()
      .catch(() => {})
      .finally(() => {
        checking.current = false;
      });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-nevo-cream">
      <HoldWayBack />

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-10">
        <HoldMessage hold={hold} />
        {hold === "consent" && onCheckAgain && (
          <div className="mt-[30px] w-full max-w-[360px] sm:mt-9">
            <Button className="w-full text-base" onClick={checkAgain}>
              Check again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 00d for a child SIGNED IN and sent here from a door (`/student/waiting`).
 * Check again asks the consent gate again, as the doors do
 * (`studentDestination`), and goes where it says: on, or to 00e if consent
 * has gone. Still waiting, or a read that did not answer, stays here as it
 * was.
 */
export function WaitingOnConsentPage() {
  const router = useRouter();
  return (
    <WaitingOnConsent
      onCheckAgain={async () => {
        const to = await studentDestination();
        const path = to.split(/[?#]/)[0];
        if (path === WAITING_ROUTE || path === UNCHECKED_ROUTE) return;
        router.replace(to);
      }}
    />
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
  const back = useLeaveForThePicker();

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
 * Off a hold to the device picker, for whoever is next: a signed-in child is
 * signed out first, by a hard navigation - see `WaitingOnConsent`. Back on
 * every hold, and 00e's "Someone else using this device?".
 */
export function useLeaveForThePicker() {
  const { signOut } = useAuth();
  return () => {
    if (getSession()) signOut();
    window.location.assign(WAITING_WAY_BACK);
  };
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
