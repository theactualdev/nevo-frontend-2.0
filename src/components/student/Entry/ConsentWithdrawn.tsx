import { HoldWayBack } from "./WaitingOnConsent";

/** 00e's words, verbatim. */
export const WITHDRAWN_COPY = {
  heading: "Nevo isn't available to you at the moment",
  line: "Someone at home or at school can tell you more.",
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
 * no 'soon', no countdown, no button, no sign-in route. It never uses the
 * word consent, never mentions a parent, never mentions withdrawal, and never
 * implies a decision was made about the child by anybody."
 *
 * BUT THERE IS A WAY BACK (Lydia, 17 Oct), which the frame does not draw:
 * "Consent Withdrawn: yes, give it Back, same as waiting-on-consent ... A
 * shared device should not be stuck." So 00d's row - the chevron, top left,
 * and the same cropped wordmark (`HoldWayBack`) - and it leaves for the
 * device picker; it moves nothing along. Nothing onward, still: no retry, no
 * sign-in form, no link.
 *
 * Reached from every door a withdrawn child can use: a refused request
 * (`withdrawnDoor`), a sign-in (`studentDestination`), and 05 Entry, which
 * draws it in place because that child has no session. A child sent to
 * `/student/unavailable` is signed in, so Back signs them out first - else
 * the route guard would send the picker back to Home and the consent gate
 * straight back here. The child on 05 has nobody to sign out.
 */
export function ConsentWithdrawn() {
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
        </div>
      </div>
    </div>
  );
}
