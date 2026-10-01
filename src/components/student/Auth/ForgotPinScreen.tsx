"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/shared";
import { getRememberedProfile } from "@/lib/auth/session";

/**
 * Forgot PIN (screen 00a) — informational, and deliberately so.
 *
 * The frame's own note: "No self-service reset · points gently to the teacher ·
 * never a dead end." A child does not reset their own PIN; a teacher issues a
 * new one through `POST /api/v1/students/{id}/pin/reset`, whose response is
 * flagged `mustShareSecurely`, and hands it over in person.
 *
 * WHY `POST /api/v1/auth/pin/reset` IS NOT CALLED HERE, given it exists and
 * takes exactly the `{ schoolCode, loginIdentifier }` this device already
 * holds. It is a REQUEST, not a reset - it returns no content and presumably
 * notifies staff - so wiring it would not contradict "no self-service reset".
 * But it would put an action on a screen design drew as informational, and
 * that is a product decision rather than a wiring one. Raised with design;
 * until they rule, the screen says what the frame says.
 *
 * This replaced a literal placeholder reading "Placeholder - built per the
 * UI/UX spec", which was the one thing it was not.
 */
export function ForgotPinScreen() {
  const router = useRouter();
  // Where "Back to sign in" belongs: a device that remembers a child returns to
  // the PIN unlock; one that does not has nothing to unlock and starts over.
  const back = () =>
    router.push(getRememberedProfile() ? "/auth/login" : "/student/onboarding");

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-9 text-center text-nevo-near-black">
      <Image
        src="/brand/nevo-wordmark.png"
        alt="Nevo"
        width={344}
        height={116}
        priority
        className="mb-9 h-5 w-auto"
      />

      <span className="flex size-16 items-center justify-center rounded-full bg-nevo-violet/22 text-nevo-navy">
        <KeyRound className="size-7" strokeWidth={1.9} />
      </span>

      <h1 className="mt-6 text-[22px] font-semibold tracking-[-0.01em] sm:text-2xl">
        Forgot your PIN?
      </h1>
      <p className="mt-2.5 max-w-[320px] text-[15px] leading-[1.55] text-nevo-near-black/70 sm:text-base">
        That&rsquo;s okay - it happens. Ask your teacher and they&rsquo;ll
        help you sign back in.
      </p>

      <Button className="mt-8 w-full max-w-[300px]" onClick={back}>
        Back to sign in
      </Button>
    </main>
  );
}
