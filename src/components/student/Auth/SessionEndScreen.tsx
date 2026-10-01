import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/shared";
import { CombinedMark, Wordmark } from "@/components/shared/BrandMarks";
import { withNext } from "@/lib/auth/nextPath";
import type { SessionEndReason } from "@/lib/auth/sessionEndReason";

/**
 * Session-end states (board 28), for a child.
 *
 * NO LONGER DEMO-ONLY. This carried a `TODO(api)` saying the auth layer would
 * route here later. It does now: #422 made the backend's reason survive the
 * redirect as `?reason=`, and the learner door reads it.
 *
 * WHY THE COPY IS HERE RATHER THAN FROM `sessionEndCopy`. That module is the
 * shared ruling on which of the five codes collapse into which screen, and
 * this file uses it for exactly that - `SessionEndReason` comes from there and
 * the mapping is not duplicated. What it does NOT take is the wording. The
 * `learner` audience there adapts the staff screens down a register; board 28
 * drew the child's screens directly, and they are gentler: a child is told
 * they have been away for a while, not that sessions expire after a period of
 * inactivity for their security.
 *
 * Two sets of learner copy now exist for the same states. Raised for design
 * rather than resolved here, because picking one silently is how the console
 * and the child's app drift apart in the first place.
 *
 * THE LOGO AND THE ART ARE THE FRAMES', not stand-ins. These were lucide icons
 * on cream tiles - board 28's own caption calls its tiles "placeholder art",
 * and the screens beside it carry the real files. Per frame: the combined mark
 * above the session-expired illustration, the wordmark above the
 * concurrent-session one, and 28a's revoked screen with the wordmark at the
 * top and NO picture at all.
 *
 * `paused` is not in this union. It is an account state rather than a session
 * one and the child has their own drawn frame for it, so the door renders
 * `AccountOnPauseScreen` instead - which is the same call #422 made for staff,
 * one level up.
 */

type Shown = Exclude<SessionEndReason, "paused">;

const COPY: Record<Shown, { heading: string; body: string; action: string }> =
  {
    expired: {
      heading: "You've been away for a while",
      body: "Log back in to continue",
      action: "Log back in",
    },
    replaced: {
      heading: "You logged in on another device",
      body: "Your progress is saved",
      action: "Log back in",
    },
    // Verbatim from `student/28a Session Ended - Revoked`: the ordinary screen
    // with the inactivity line deleted, because this session did not time out
    // - and its button says "Sign in", not "Log back in".
    revoked: {
      heading: "Your session has ended.",
      body: "Sign in again to continue.",
      action: "Sign in",
    },
  };

const ART: Record<Exclude<Shown, "revoked">, { src: string; w: number; h: number }> = {
  expired: { src: "/illustrations/session-expired.png", w: 1024, h: 1536 },
  replaced: { src: "/illustrations/concurrent-session.png", w: 1254, h: 1254 },
};

export function SessionEndScreen({
  variant,
  next,
}: {
  variant: Shown;
  /**
   * Where the child was when it ended, already through `safeNextPath`. The way
   * in carries it, so the PIN they type next lands them back in their lesson.
   */
  next?: string;
}) {
  const { heading, body, action } = COPY[variant];
  const signIn = withNext("/auth/login", next);

  if (variant === "revoked") {
    return (
      <div className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center bg-nevo-cream px-9 text-center text-nevo-near-black">
        <Wordmark size="revoked" className="absolute top-10 left-1/2 -translate-x-1/2" />
        <h1 className="text-2xl leading-[1.25] font-semibold tracking-[-0.015em]">
          {heading}
        </h1>
        <p className="mt-3.5 text-base leading-[1.55] text-nevo-near-black/68">
          {body}
        </p>
        <Button asChild className="mt-[30px] h-14 w-full max-w-[290px] text-base font-semibold">
          <Link href={signIn}>{action}</Link>
        </Button>
      </div>
    );
  }

  const art = ART[variant];
  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black">
      {variant === "expired" ? (
        <CombinedMark className="mb-8 sm:mb-10" />
      ) : (
        <Wordmark size="compact" className="mb-7 sm:mb-9" />
      )}
      <Image
        src={art.src}
        alt=""
        width={art.w}
        height={art.h}
        sizes="220px"
        priority
        className="-my-3.5 size-[180px] object-contain sm:my-0 sm:h-[184px] sm:w-[220px]"
      />
      <h1 className="mt-7 text-xl font-medium sm:mt-8 sm:text-2xl">{heading}</h1>
      <p className="mt-2 text-[15px] text-nevo-near-black/60 sm:mt-2.5 sm:text-base">
        {body}
      </p>
      <Button asChild className="mt-8 w-full max-w-[290px] text-base sm:mt-9 sm:max-w-[340px]">
        <Link href={signIn}>{action}</Link>
      </Button>
    </div>
  );
}
