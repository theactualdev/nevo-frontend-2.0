import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/shared";
import { withNext } from "@/lib/auth/nextPath";
import { LetMyTeacherKnow } from "./LetMyTeacherKnow";

/**
 * Forgot PIN (screen 00a) — informational, and deliberately so.
 *
 * The frame's own note: "No self-service reset · points gently to the teacher ·
 * never a dead end." A child does not reset their own PIN; a teacher issues a
 * new one through `POST /api/v1/students/{id}/pin/reset`, whose response is
 * flagged `mustShareSecurely`, and hands it over in person.
 *
 * "LET MY TEACHER KNOW" CALLS `POST /api/v1/auth/pin/reset` NOW. Design ruled
 * on 1 Oct (D3): nobody but the child ever sets a PIN; the adult linked to
 * them clears it, and the child sets a new one. The request was deliberately
 * left unused until that was decided - see `LetMyTeacherKnow`.
 *
 * THE BODY COPY IS STILL THE FRAME'S, ON PURPOSE. Design says 00a's words
 * change, because they promise teacher help and describe none, but gave no
 * new ones. Until they do, the frame's line stays and the button is the only
 * addition.
 *
 * BOTH WAYS OUT GO TO THE SIGN-IN DOOR, always. They used to read the legacy
 * one-child profile key and send a device it did not name to
 * `/student/onboarding` - the new-account Welcome - which on a shared tablet
 * is how a returning child makes a second account. `/auth/login` already
 * knows what to do with a device that remembers nobody (28c-2).
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
  const back = withNext("/auth/login", next);

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

      <div className="flex flex-1 flex-col items-center justify-center px-9 pb-12 text-center sm:px-10 sm:pb-16">
        <Image
          src="/illustrations/error.png"
          alt="A calm figure with an open, questioning hand"
          width={1254}
          height={1254}
          sizes="248px"
          priority
          className="size-[184px] object-contain sm:size-[248px]"
        />

        <h1 className="mt-8 text-[23px] font-semibold tracking-[-0.01em] sm:mt-9 sm:text-[28px]">
          Forgot your PIN?
        </h1>
        <p className="mt-3.5 max-w-[300px] text-base leading-[1.55] text-nevo-near-black/70 sm:mt-4 sm:max-w-[400px] sm:text-lg">
          That&rsquo;s okay - it happens. Ask your teacher and they&rsquo;ll help
          you sign back in.
        </p>

        <Button asChild className="mt-8 w-full text-base sm:mt-9 sm:max-w-[360px]">
          <Link href={back}>Back to sign in</Link>
        </Button>
        <LetMyTeacherKnow childId={childId} />
      </div>
    </main>
  );
}
