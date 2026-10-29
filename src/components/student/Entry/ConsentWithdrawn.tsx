"use client";

import { useEffect } from "react";
import { WAY_BACK } from "@/components/student/Auth/AccountOnPauseScreen";
import { purgeStoredCaptures } from "@/lib/profiling/capture";
import { cn } from "@/lib/utils";
import { HoldWayBack, useLeaveForThePicker } from "./WaitingOnConsent";

/** 00e's words, verbatim. */
export const WITHDRAWN_COPY = {
  heading: "Nevo isn't available to you at the moment",
  line: "Someone at home or at school can tell you more.",
  someoneElse: "Someone else using this device?",
} as const;

/**
 * Frame 00e / SE-02 - Consent Withdrawn (D117).
 *
 * "The entry gate after permission is gone. Distinct from 00d Waiting on
 * Consent, which stands in for it today. Waiting means it hasn't arrived yet
 * and can honestly say 'soon'; this means it was there and is gone, so 'soon'
 * would be a lie - a child told to wait for something never coming goes back
 * every day."
 *
 * So, as the frame has it: "a calm, still dot rather than the breathing one,
 * no 'soon', no countdown, and no sign-in route back for this child." It
 * never uses the word consent, never mentions a parent, never mentions
 * withdrawal, and never implies a decision was made about the child by
 * anybody.
 *
 * BUT THERE IS A WAY BACK (Lydia, 17 Oct), which the frame does not draw:
 * "Consent Withdrawn: yes, give it Back, same as waiting-on-consent ... A
 * shared device should not be stuck." So 00d's row - the chevron, top left,
 * and the same cropped wordmark (`HoldWayBack`) - and it leaves for the
 * device picker; it moves nothing along.
 *
 * AND THE FRAME'S OWN WAY FORWARD (design 5bb9ee2, 28 Oct): "the neutral
 * 'Someone else using this device?' hand-off to the shared-device picker -
 * the same exit Account Closed uses - so it never ends at the browser". Under
 * the line, in Account Closed's link style, and it leaves exactly as Back
 * does. Still no retry, no sign-in form, nothing that moves this child on.
 *
 * Reached from every door a withdrawn child can use: a refused request
 * (`withdrawnDoor`), a sign-in (`studentDestination`), and 05 Entry, which
 * draws it in place because that child has no session. A child sent to
 * `/student/unavailable` is signed in, so Back signs them out first - else
 * the route guard would send the picker back to Home and the consent gate
 * straight back here. The child on 05 has nobody to sign out.
 */
export function ConsentWithdrawn() {
  /*
   * NOTHING OF THEIRS IS KEPT ON ARRIVAL (19 Oct browser-storage audit). A
   * child reaches 00e because their consent is gone, and a baseline run that
   * was under way when it went left its raw taps in IndexedDB - the page that
   * held the capture was left before it could stop it. Every way here lets
   * them go: a refused request (`holdIfWithdrawn` starts it), a sign-in, and
   * 05 Entry's in-place hold.
   */
  useEffect(() => {
    void purgeStoredCaptures();
  }, []);
  const leave = useLeaveForThePicker();
  return (
    <div className="flex min-h-dvh w-full flex-col bg-nevo-cream text-nevo-near-black">
      <HoldWayBack />

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-10 text-center sm:px-12 lg:px-20">
        <div className="flex flex-col items-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-[6px] motion-safe:duration-500">
          {/* STILL, not 00d's breathing dot: nothing here is on its way. */}
          <span
            aria-hidden="true"
            className="mb-[30px] block size-[76px] shrink-0 rounded-full bg-nevo-violet/28 sm:mb-[34px] sm:size-23"
          />
          <h1 className="max-w-[300px] text-[23px] leading-[1.3] font-medium tracking-[-0.01em] sm:max-w-[440px] sm:text-[27px] lg:max-w-[460px] lg:text-[28px]">
            {WITHDRAWN_COPY.heading}
          </h1>
          <p className="mt-[18px] max-w-[280px] text-base leading-[1.6] text-nevo-near-black/70 sm:max-w-[420px] sm:text-[17px] lg:max-w-[440px]">
            {WITHDRAWN_COPY.line}
          </p>
          {/* 00e: 26px under the line, a size under it (15px, 16px from sm). */}
          <button
            type="button"
            onClick={leave}
            className={cn(WAY_BACK, "mt-[26px] text-[15px] sm:text-base")}
          >
            {WITHDRAWN_COPY.someoneElse}
          </button>
        </div>
      </div>
    </div>
  );
}
