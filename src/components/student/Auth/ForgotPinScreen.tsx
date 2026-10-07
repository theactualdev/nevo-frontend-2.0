"use client";

import Link from "next/link";
import { useHydrated } from "@/hooks/useHydrated";
import { rememberedChildren } from "@/lib/auth/deviceRoster";
import { withNext } from "@/lib/auth/nextPath";
import { LetMyTeacherKnow } from "./LetMyTeacherKnow";

/** The entry screen (05): school code and Student ID, which asks who they are. */
const ENTRY_SCREEN = "/student/onboarding/school";

/**
 * Where both ways out of Forgot PIN go.
 *
 * The picker, when the device remembers anyone. A DEVICE THAT REMEMBERS NOBODY
 * GOES TO THE ENTRY SCREEN (D123, 6 Oct): "The entry screen, not the picker. A
 * device that remembers nobody cannot offer a child to pick, so it asks who
 * they are." The entry screen is a lookup of a child the school already
 * uploaded, not a new account, so this is not the second-account trap the old
 * onboarding Welcome was: a child with a PIN is sent on to sign in, and a
 * cleared one to choose a new PIN.
 */
export function forgotPinWayBack(
  remembersAnyone: boolean,
  next: string | undefined,
): string {
  return remembersAnyone ? withNext("/auth/login", next) : ENTRY_SCREEN;
}

/**
 * Forgot PIN (screen 00a, revised 1 Oct): says what happens next.
 *
 * Design ruled on 1 Oct (D3): nobody but the child ever sets a PIN. The child
 * asks, the adult already linked to them clears the old one, and the child
 * chooses a new one on 15 PIN Creation. So the words say exactly that, and
 * "Let my teacher know" sends the ask - see `LetMyTeacherKnow`, which owns the
 * body because the sent state replaces all of it.
 *
 * BOTH WAYS OUT GO THE SAME WAY - see `forgotPinWayBack`. They used to read
 * the legacy one-child profile key and send a device it did not name to
 * `/student/onboarding` - the new-account Welcome - which on a shared tablet
 * is how a returning child makes a second account.
 *
 * The roster is the device's, so it is read once the client is running; until
 * then the way back is the sign-in door, which handles an empty device itself.
 *
 * Laid out as 00a draws it: a 44px Back at the top left, the drawn
 * illustration, no wordmark. This replaced a literal placeholder reading
 * "Placeholder - built per the UI/UX spec", and then a key glyph standing in
 * for the art.
 */
export function ForgotPinScreen({
  next,
  childId,
}: {
  next?: string;
  /** The remembered child who forgot, as the roster's opaque id. */
  childId?: string;
}) {
  const hydrated = useHydrated();
  const back = forgotPinWayBack(
    !hydrated || rememberedChildren().length > 0,
    next,
  );

  return (
    <main className="flex min-h-[100dvh] w-full flex-col bg-nevo-cream text-nevo-near-black">
      <div className="flex h-14 shrink-0 items-center px-3 sm:h-16 sm:px-4">
        <Link
          href={back}
          aria-label="Back"
          className="flex size-11 cursor-pointer items-center justify-center rounded-[10px] transition-transform active:scale-[0.98]"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 5l-7 7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>

      <LetMyTeacherKnow childId={childId} back={back} />
    </main>
  );
}
