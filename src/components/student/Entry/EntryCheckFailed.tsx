"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared";
import { CombinedMark } from "@/components/shared/BrandMarks";
import { ErrorScreen } from "@/components/shared/SystemScreens";
import { useOnline } from "@/components/student/Shell/TabOfflineBanner";
import { useAuth } from "@/hooks";
import { UNCHECKED_ROUTE } from "@/lib/auth/consentHold";
import { studentDestination } from "@/lib/auth/entryGate";

/** The door a held child goes back to: the picker, or 28c-2 on an empty device. */
const SIGN_IN_DOOR = "/auth/login";

/**
 * Where Try again sends a child once the read has answered: where they were
 * going, 00d or 00e - or null to stay, when it failed again.
 */
export function afterRetry(destination: string): string | null {
  return destination.split(/[?#]/)[0] === UNCHECKED_ROUTE ? null : destination;
}

/**
 * The hold for a consent read that failed at a sign-in door (D69).
 *
 * "A check that cannot complete must not leave the door open. If the consent
 * lookup or the account creation fails, the child does not proceed. Today
 * they do." Every door - the PIN unlock, the full sign-in, the SSO callback and
 * You're In's hand-off into the first lesson - resolves consent through
 * `studentDestination`, which used to let a child through when the read
 * failed. It sends them here now, with where they were going as `?next=`.
 *
 * FRAME 28'S OWN STATES, ONE PER FAILURE, and neither is the Welcome's
 * "couldn't set things up", which design keeps for "failures that stop the app
 * from starting at all":
 *
 *  - OFFLINE: "Offline (full screen)", less what cannot be true here. "Your
 *    progress is saved - and your downloaded lessons are still here" and "See
 *    saved lessons" come out: nothing says anything was saved, and a door into
 *    the saved lessons is a door past the check. "Try again" stays, as drawn.
 *  - ANY OTHER FAILURE: the generic error, "Something went wrong. We're on it.
 *    Try again or go back." The failure was reported as it happened, so "We're
 *    on it" is true.
 *
 * TRY AGAIN READS CONSENT AGAIN, and goes wherever the answer says - where they
 * were going, 00d or 00e - or stays here if it fails again. It does not sign
 * the child in again: that would end the session it is checking.
 *
 * GO BACK GOES BACK TO THE DOOR, signed out, never into the app: "back" or
 * "home" would be the lessons the check is holding them out of. A hard
 * navigation, as every sign-out is, so the route guard does not see a child
 * still signed in and send them to Home.
 *
 * Nothing is said about consent, and the address says nothing either.
 */
export function EntryCheckFailed({ next }: { next?: string }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const online = useOnline();
  const [checking, setChecking] = useState(false);

  const retry = () => {
    if (checking) return;
    setChecking(true);
    void studentDestination(next).then((destination) => {
      const to = afterRetry(destination);
      if (to) router.replace(to);
      else setChecking(false);
    });
  };

  const backToTheDoor = () => {
    signOut();
    window.location.assign(SIGN_IN_DOOR);
  };

  if (online) {
    return (
      <main className="w-full">
        <ErrorScreen retry={retry} onBack={backToTheDoor} />
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black sm:px-12">
      <CombinedMark className="mb-8 sm:mb-10" />
      <Image
        src="/illustrations/offline.png"
        alt=""
        width={1024}
        height={1024}
        sizes="220px"
        priority
        className="-my-3.5 size-[180px] object-contain sm:size-[220px]"
      />
      <h1 className="mt-7 text-xl font-medium sm:mt-8 sm:text-2xl">
        You&apos;re offline
      </h1>
      <p className="mt-2 max-w-[440px] text-[15px] leading-[1.55] text-nevo-near-black/60 sm:mt-2.5 sm:text-base">
        No internet connection right now.
      </p>
      <Button
        variant="ghost"
        className="mt-8 h-12 w-full max-w-[290px] text-[15px] font-normal sm:max-w-[340px]"
        onClick={retry}
      >
        Try again
      </Button>
    </main>
  );
}
