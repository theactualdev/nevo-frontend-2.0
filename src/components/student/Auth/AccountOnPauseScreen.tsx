import Image from "next/image";
import { Wordmark } from "@/components/shared/BrandMarks";
import type { AccountHold } from "@/lib/auth/accountPause";
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
 * BUT ONE WAY BACK TO THE PICKER (design, D52). The frame drew no controls at
 * all, and on a shared classroom tablet a screen with no controls locks every
 * other child out of the device. So it carries "Back to sign in" - 00a's own
 * words for the same door - which takes the NEXT child to the picker. It is
 * not a retry and does not present itself as one.
 *
 * THE BRAND MARK, NOT A PAUSE GLYPH. The frame puts the Nevo icon in a soft
 * violet circle and the wordmark at the top centre; a pause symbol reads as a
 * media control, or as something the child could un-pause.
 *
 * A pause that lands mid-lesson gets 28b's card over the lesson first - see
 * `AccountPauseHost` - and settles into this same screen after "Okay", so a
 * paused child meets one screen whichever way they arrive.
 *
 * A CLOSED ACCOUNT IS THIS SCREEN WITH ONE WORD CHANGED (design, D53): "A
 * removed child reads that their account is closed, not that it is on pause."
 * Backend's 5 Oct answer gives it its own 401, `account_closed` (B58), which
 * the deployed spec does not name yet. "On pause" says it will start again,
 * and a removed child told that comes back to the tablet to try. NOT DRAWN: no frame carries the closed state yet, so its heading is
 * the ruling's own words and its second line is the pause frame's, which
 * points at a person and promises nothing. Both are a DESIGN ASK until a frame
 * lands. Same mark, same way back to the picker (D52).
 */
/** What follows "Your Nevo account", which the phone heading breaks before. */
const HOLD_STATE: Record<AccountHold, string> = {
  paused: "is on pause.",
  closed: "is closed.",
};

/** The heading in one piece, for the 28b card and the dialog's name. */
export function accountHoldHeading(hold: AccountHold): string {
  return `Your Nevo account ${HOLD_STATE[hold]}`;
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

const WAY_BACK =
  "mt-9 inline-flex h-[46px] cursor-pointer items-center rounded-[10px] px-[18px] text-base font-medium text-nevo-navy transition-[background] hover:bg-nevo-navy/8 sm:mt-10";

export function AccountOnPauseView({
  className,
  back,
  hold = "paused",
}: {
  className?: string;
  back?: PauseWayBack;
  /** Which account state this is. Paused unless a 401 said closed. */
  hold?: AccountHold;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1.5 motion-safe:duration-600",
        className,
      )}
    >
      <Wordmark
        size="pause"
        className="absolute top-[34px] left-1/2 -translate-x-1/2 sm:top-10"
      />

      <span className="flex size-[132px] shrink-0 items-center justify-center rounded-full bg-nevo-violet/16 sm:size-40 lg:size-[168px]">
        <Image
          src="/brand/logo-icon-purple-tight.png"
          alt=""
          width={218}
          height={217}
          priority
          className="size-[70px] object-contain opacity-92 sm:size-[86px] lg:size-[90px]"
        />
      </span>

      <h1 className="mt-10 text-[26px] leading-[1.25] font-semibold tracking-[-0.015em] text-nevo-navy sm:mt-11 sm:text-[32px] sm:leading-[1.22] lg:text-[34px] lg:leading-[1.2]">
        Your Nevo account
        {/* The frame breaks the phone heading after "account". */}
        <br className="sm:hidden" /> {HOLD_STATE[hold]}
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

export function AccountOnPauseScreen({
  back,
  hold,
}: {
  back?: PauseWayBack;
  hold?: AccountHold;
}) {
  return (
    <main className="w-full">
      <AccountOnPauseView back={back} hold={hold} />
    </main>
  );
}
