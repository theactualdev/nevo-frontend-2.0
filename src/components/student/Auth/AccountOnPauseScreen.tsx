import { Wordmark } from "@/components/shared/BrandMarks";
import { cn } from "@/lib/utils";

/**
 * Account on pause (`Account On Pause` frame).
 *
 * Shown at sign-in, in place of the normal login flow, when a child's PIN was
 * RIGHT and the account is not open. Until backend could tell those apart, this
 * child typed a correct PIN and was told "That PIN didn't match" - so they tried
 * again, and again, and then asked an adult why they had been locked out of
 * their own account. Backend now answers 401 `account_paused` once the
 * credential itself verifies.
 *
 * IT NAMES NO REASON, AND MUST NOT. Backend deliberately sends no cause, no who
 * paused it and no resume date, and we would not want them: a parent withdrawing
 * consent, a safeguarding hold and an unpaid invoice are not things to explain
 * to a child on a login screen. The frame agrees - two sentences, and the second
 * points at a person rather than a process.
 *
 * NOTHING FOR THE PAUSED CHILD TO PRESS, also from the frame. There is nothing
 * here they can do about the pause, and offering an action that cannot work
 * would be worse than offering none. The way back is a teacher.
 *
 * BUT ONE WAY BACK TO THE PICKER (design, D52; "Back to sign in" confirmed,
 * D64). The frame drew no controls at all, and on a shared classroom tablet a
 * screen with no controls locks every other child out of the device. So it
 * carries "Back to sign in" - 00a's own words for the same door - which takes
 * the NEXT child to the picker. It is not a retry and does not present itself
 * as one.
 *
 * THE PAUSE BARS, NOT THE BRAND MARK (D64, 6 Oct): "The glyph is the pause
 * bars, not the brand mark. Our mark does not appear on a screen that is
 * telling someone their access has been interrupted." 28b draws the bars in its
 * card; the `Account On Pause` frame still has the Nevo icon in its circle, and
 * the ruling covers both, so both carry the bars - the circle as that frame
 * sizes it, the bars in it at the share of the circle 28b gives them. The
 * wordmark at the top is the page's, not the glyph, and stays.
 *
 * A pause that lands mid-lesson gets 28b's card over the lesson first - see
 * `AccountPauseHost` - and settles into this same screen after "Okay", so a
 * paused child meets one screen whichever way they arrive ("a shared system
 * state is drawn once and reused").
 *
 * A CLOSED ACCOUNT IS NOT THIS SCREEN ANY MORE. It was, with one word changed
 * (D53), until 28d drew its own: see `AccountClosedScreen`.
 */
export const ACCOUNT_PAUSED_HEADING = "Your Nevo account is on pause.";

/** 28b's pause bars, as the frame draws them. Decorative: the words say it. */
export function PauseBars({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <rect x="7" y="5" width="3.4" height="14" rx="1.4" />
      <rect x="13.6" y="5" width="3.4" height="14" rx="1.4" />
    </svg>
  );
}

/**
 * Where "Back to sign in" goes.
 *
 * `href` is a FULL page load, deliberately a plain anchor: a pause that landed
 * mid-session is sticky for the life of the page (`accountPause.ts`), and the
 * next child must not inherit it. `onBack` is for the sign-in screens, which
 * hold no pause and only need to put their picker back.
 */
export type PauseWayBack = { href: string } | { onBack: () => void };

/**
 * The doors' quiet line, as "Not you? Go back" draws it. 28d's "Someone else
 * using this device?" takes it too, so the two account screens' one way out
 * looks the same.
 */
export const WAY_BACK =
  "mt-9 inline-flex h-[46px] cursor-pointer items-center rounded-[10px] px-[18px] text-base font-medium text-nevo-navy transition-[background] hover:bg-nevo-navy/8 sm:mt-10";

export function AccountOnPauseView({
  className,
  back,
}: {
  className?: string;
  back?: PauseWayBack;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-[6px] motion-safe:duration-600",
        className,
      )}
    >
      <Wordmark
        size="pause"
        className="absolute top-[34px] left-1/2 -translate-x-1/2 sm:top-10"
      />

      <span className="flex size-[132px] shrink-0 items-center justify-center rounded-full bg-nevo-violet/16 text-nevo-navy sm:size-40 lg:size-[168px]">
        <PauseBars className="size-[60px] sm:size-[72px] lg:size-[76px]" />
      </span>

      <h1 className="mt-10 text-[26px] leading-[1.25] font-semibold tracking-[-0.015em] text-nevo-navy sm:mt-11 sm:text-[32px] sm:leading-[1.22] lg:text-[34px] lg:leading-[1.2]">
        Your Nevo account
        {/* The frame breaks the phone heading after "account". */}
        <br className="sm:hidden" /> is on pause.
      </h1>
      <p className="mt-4 max-w-[280px] text-[17px] leading-[1.6] text-pretty text-nevo-near-black/68 sm:mt-[18px] sm:max-w-[360px] sm:text-lg lg:max-w-[420px] lg:text-[19px]">
        If you have questions, talk to your teacher.
      </p>

      {back &&
        ("href" in back ? (
          <a href={back.href} className={WAY_BACK}>
            Back to sign in
          </a>
        ) : (
          <button type="button" onClick={back.onBack} className={WAY_BACK}>
            Back to sign in
          </button>
        ))}
    </div>
  );
}

export function AccountOnPauseScreen({ back }: { back?: PauseWayBack }) {
  return (
    <main className="w-full">
      <AccountOnPauseView back={back} />
    </main>
  );
}
