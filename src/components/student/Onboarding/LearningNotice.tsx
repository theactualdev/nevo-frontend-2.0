"use client";

import Image from "next/image";
import { Button, IllustrationWrapper } from "@/components/shared";

/**
 * The first screen after baseline profiling: a plain-language notice of what
 * Nevo does with what it learns, and a single Continue on to PIN creation.
 * Calm, one decision, no dense legalese.
 *
 * NO OPENING WAIT. This opened on a spinner, "Just a moment, we're getting
 * things ready for you" and a disabled Continue for 1.4 seconds, bracketed as
 * `system_busy` `auth_pending` - but nothing was being got ready and no auth
 * was pending. It was a timer left behind when the consent check it once
 * waited on was removed. The frame draws only the notice, so a child reads it
 * the moment it appears, and the signal stream is not told the system was busy
 * when it was not.
 *
 * WAS `ConsentGate`, AND IS NO LONGER A GATE. Design ruled on SCRUM-80 (7 Sep)
 * that Nevo does not gate on consent at all: the school warrants it through
 * the DSA, so `granted: false` means the school has not filed the paperwork,
 * which is not the child's problem. The screen used to call
 * `GET /students/me/consent-gate` and dev-log a not-granted result while
 * revealing anyway - a check whose only consequence was a console line. That
 * call is gone.
 *
 * The SCREEN stays, and the ruling did not ask for it to go: what it does is
 * TELL A CHILD, in words they can read, that Nevo notices how they learn.
 * Under a model where a school consents on their behalf, that notice is the
 * only thing standing between the child and being profiled without ever being
 * told. It is renamed rather than deleted so that nothing here reads as a gate
 * again.
 *
 * NOT HANDLED HERE: withdrawal. If a parent withdraws, processing must stop
 * (same ruling), and this screen is the wrong place for it - a child reaching
 * onboarding has already been profiled one step earlier. See
 * `processingWithdrawn` in `lib/api/consents.ts` for the seam, and
 * docs/BUILD_STATUS.md for the open design question of what a withdrawn child
 * should actually see.
 */
export function LearningNotice({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      {/* Top bar: wordmark only — the sequence dots are done by now */}
      <div className="flex h-[60px] shrink-0 items-center px-5 sm:px-8">
        <Image
          src="/brand/nevo-wordmark.png"
          alt="Nevo"
          width={344}
          height={116}
          priority
          className="h-[18px] w-auto sm:h-5"
        />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-10 pb-10 text-center">
        <div className="flex flex-col items-center motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
          <IllustrationWrapper
            src="/illustrations/consent-gate.png"
            alt=""
            width={1254}
            height={1254}
            priority
            className="mb-2 w-[200px]"
          />
          <h2 className="max-w-[300px] text-[23px] font-medium leading-[1.3] tracking-[-0.01em] text-balance sm:max-w-[440px] sm:text-[27px]">
            Nevo will get to know how you learn
          </h2>
          <p className="mt-6 max-w-[290px] text-base leading-[1.6] text-balance sm:max-w-[430px] sm:text-[17px]">
            As you use lessons, Nevo quietly notices what helps and adjusts
            things to make learning easier for you.
          </p>
          <Button
            size="lg"
            onClick={onContinue}
            className="mt-12 w-full max-w-[300px]"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
