import { Wordmark } from "@/components/shared/BrandMarks";
import { cn } from "@/lib/utils";
import { type PauseWayBack, WAY_BACK } from "./AccountOnPauseScreen";

/** 28d's child version, verbatim, and the one line product added (7 Oct). */
export const ACCOUNT_CLOSED_COPY = {
  heading: "Your account is closed",
  line: "This account is closed, so there's nothing more to do here.",
  ask: "If you're not sure why, ask your teacher or someone at your school.",
  someoneElse: "Someone else using this device?",
} as const;

/**
 * 28d Account Closed (D116), the child's version.
 *
 * "Closed, not paused. A child removed from the roster (or who has changed
 * schools) reaches this instead of a sign-in." Round 5 drew this state as the
 * pause screen with one word changed - "Your Nevo account is closed." under
 * the brand mark, with "Back to sign in" - because no frame drew it. 28d does
 * now, and differs on everything that matters:
 *
 *  - TERMINAL FOR THIS CHILD. "No sign-in route, because offering a way back
 *    in would be cruel." So there is no "Back to sign in", here or on any
 *    surface that shows it - including the sign-in doors, where the pause
 *    screen keeps D52's.
 *  - BUT NOT FOR THE DEVICE (product, 7 Oct). A screen with no control held a
 *    shared tablet until the app was reopened, so it carries one line, "Someone
 *    else using this device?", which takes the NEXT child to the picker. It
 *    says nothing about the closed child's own access and is not a way back in
 *    for them. 28d does not draw it yet.
 *  - "A QUIET STATIC RING, NOT THE BREATHING DOT (this is settled, not
 *    waiting)", and not the brand mark the pause screen used to carry.
 *  - "Gives no reason, names no decision, attaches no blame in any direction,
 *    and reads the same either way. Never says removed, deactivated, erased,
 *    deleted or terminated."
 *
 * The wordmark sits top left at the frame's three sizes; the content fades up
 * as the frame's does.
 */
export function AccountClosedView({
  className,
  toPicker,
}: {
  className?: string;
  /**
   * Where "Someone else using this device?" goes: the picker, in the pause
   * screen's two shapes. A full page load where the closure landed mid-session
   * (it is sticky for the page, `accountPause.ts`); `onBack` at the PIN
   * unlock, which only has to put its picker back. Required, because every
   * surface that shows 28d is on a device the next child may need.
   */
  toPicker: PauseWayBack;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[100dvh] w-full flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black sm:px-16 lg:px-20",
        className,
      )}
    >
      <Wordmark
        size="corner"
        className="absolute top-[34px] left-7 sm:top-10 sm:left-10 lg:top-11 lg:left-12"
      />
      <div className="flex flex-col items-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-[6px] motion-safe:duration-500">
        <span
          aria-hidden="true"
          className="mb-[30px] block size-[60px] shrink-0 rounded-full border-2 border-nevo-violet/50 sm:mb-[34px] sm:size-[72px] lg:size-[76px]"
        />
        <h1 className="max-w-[300px] text-[23px] leading-[1.2] font-semibold tracking-[-0.015em] sm:max-w-[440px] sm:text-[28px] lg:max-w-[460px] lg:text-[30px]">
          {ACCOUNT_CLOSED_COPY.heading}
        </h1>
        <p className="mt-4 max-w-[300px] text-base leading-[1.6] text-nevo-near-black/70 sm:max-w-[440px] sm:text-lg lg:max-w-[460px]">
          {ACCOUNT_CLOSED_COPY.line}
        </p>
        <p className="mt-2.5 max-w-[300px] text-base leading-[1.6] text-nevo-near-black/70 sm:max-w-[440px] sm:text-lg lg:max-w-[460px]">
          {ACCOUNT_CLOSED_COPY.ask}
        </p>
        {"href" in toPicker ? (
          <a href={toPicker.href} className={WAY_BACK}>
            {ACCOUNT_CLOSED_COPY.someoneElse}
          </a>
        ) : (
          <button type="button" onClick={toPicker.onBack} className={WAY_BACK}>
            {ACCOUNT_CLOSED_COPY.someoneElse}
          </button>
        )}
      </div>
    </div>
  );
}

export function AccountClosedScreen({ toPicker }: { toPicker: PauseWayBack }) {
  return (
    <main className="w-full">
      <AccountClosedView toPicker={toPicker} />
    </main>
  );
}
