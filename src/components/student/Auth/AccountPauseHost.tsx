"use client";

import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  isAccountPaused,
  onAccountPause,
  registerPauseHost,
} from "@/lib/auth/accountPause";
import { clearSession } from "@/lib/auth/session";
import { AccountOnPauseView } from "./AccountOnPauseScreen";

/**
 * 28b - an account paused while the child is using it.
 *
 * "The lesson the child was on stays visible but goes quiet behind a soft
 * scrim, and a calm card explains in two lines ... After they tap Okay it
 * settles into a full paused screen with the same two lines and nothing
 * further to do." Until this existed the step was skipped: `client.ts` cleared
 * the session and left the page on the first 401, so the lesson vanished
 * mid-sentence, and `AccountOnPauseScreen`'s docblock said this case was
 * undrawn when 28b had drawn it.
 *
 * Mounted once, in the student layout, so it covers every student screen and
 * not only the player - a pause is the same news on Home as mid-read. It is the
 * host `client.ts` checks for; see `accountPause.ts` for what happens where
 * there is none.
 *
 * THE SESSION IS CLEARED ON "OKAY", NOT ON THE 401. Clearing it flips every
 * screen's `useHasSession`, and a signed-out render is the sample walkthrough -
 * the lesson behind the scrim would have turned into someone else's. The token
 * is already refused by the server, so keeping it a moment longer exposes
 * nothing, and any further 401 meets the latch in `client.ts`.
 *
 * MODAL, AND IT DOES NOT DISMISS. No Escape, no tap on the scrim: there is
 * nothing behind it the child can go back to. Radix keeps focus in the card and
 * hides the page from assistive tech, which is what "goes quiet" means for a
 * child on a keyboard or a screen reader.
 *
 * THE CARD'S GLYPH IS THE BRAND MARK. 28b's circle is empty in the frame file
 * - its icon slot renders nothing - and the frame rules out "an error icon".
 * The `Account On Pause` frame puts the Nevo mark in the same violet circle, so
 * that is what fills it. Flagged to design.
 */
/**
 * The picker, by a full page load (D52): the pause is sticky for this page, and
 * the next child to pick up the tablet must start on a fresh one.
 */
const SIGN_IN_DOOR = "/auth/login";

export function AccountPauseHost() {
  useEffect(() => registerPauseHost(), []);
  const paused = useSyncExternalStore(
    onAccountPause,
    isAccountPaused,
    () => false,
  );
  const [settled, setSettled] = useState(false);

  if (!paused) return null;

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        {settled ? (
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onEscapeKeyDown={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            className="fixed inset-0 z-50 overflow-y-auto bg-nevo-cream outline-none"
          >
            <DialogPrimitive.Title className="sr-only">
              Your Nevo account is on pause.
            </DialogPrimitive.Title>
            <AccountOnPauseView back={{ href: SIGN_IN_DOOR }} />
          </DialogPrimitive.Content>
        ) : (
          <>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-nevo-near-black/40 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300" />
            <DialogPrimitive.Content
              onEscapeKeyDown={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
              className="fixed top-1/2 left-1/2 z-50 flex w-[295px] max-w-[calc(100%-48px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-2xl bg-nevo-cream-elevated px-[30px] py-9 text-center text-nevo-near-black shadow-[0_8px_32px_rgba(0,0,0,0.16)] outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-98 motion-safe:slide-in-from-bottom-2.5 motion-safe:duration-[380ms] sm:w-[388px] sm:px-10 sm:py-11"
            >
              <span className="mb-5 flex size-[52px] items-center justify-center rounded-full bg-nevo-violet/22 sm:mb-6 sm:size-[58px]">
                <Image
                  src="/brand/logo-icon-purple-tight.png"
                  alt=""
                  width={218}
                  height={217}
                  className="size-7 object-contain opacity-92 sm:size-8"
                />
              </span>
              <DialogPrimitive.Title className="text-xl leading-[1.3] font-semibold tracking-[-0.01em] sm:text-[23px]">
                Your Nevo account is on pause.
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-3 text-[15px] leading-[1.55] text-nevo-near-black/68 sm:mt-3.5 sm:text-base">
                If you have questions, talk to your teacher.
              </DialogPrimitive.Description>
              <button
                type="button"
                onClick={() => {
                  clearSession();
                  setSettled(true);
                }}
                className="mt-[26px] h-[52px] w-full cursor-pointer rounded-[10px] bg-nevo-navy text-base font-semibold text-nevo-cream transition-[filter] hover:brightness-108 sm:mt-[30px] sm:h-[54px]"
              >
                Okay
              </button>
            </DialogPrimitive.Content>
          </>
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
