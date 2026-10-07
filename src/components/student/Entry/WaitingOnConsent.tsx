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
 * There is no way onward from here ON PURPOSE. Every other dead end in this app
 * offers a way out, and this one must not: the only thing that changes this
 * state is an adult, elsewhere.
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
  const { heading, line } = WAITING_COPY[hold];
  return (
    <div className="flex min-h-dvh flex-col bg-nevo-cream">
      {/* Same cropped wordmark as the PIN beat and the picker, so the doors do
          not drift apart. */}
      <div className="flex h-[60px] shrink-0 items-center px-[22px]">
        <span className="relative block h-[15px] w-12 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-wordmark-purple.png"
            alt="Nevo"
            className="absolute block h-[152px] w-[152px] max-w-none -translate-x-[55px] -translate-y-[74px]"
          />
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-10 text-center">
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
    </div>
  );
}
