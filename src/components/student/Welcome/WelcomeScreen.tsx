"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startOnboardingDraft } from "@/lib/auth/onboarding";
import { useAuth } from "@/hooks";
import { invitesApi } from "@/lib/api/invites";
import { clearSession, getStoredDisplayName } from "@/lib/auth/session";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { JoinHandover } from "@/components/student/Onboarding/JoinHandover";
import { Button, NevoLockup, SettlingCharacter } from "@/components/shared";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** First onboarding step (Name & Age entry) - the primary action's destination. */
const NEXT_STEP = "/student/onboarding/name";

/**
 * Welcome Screen (UI/UX spec B.1) — first arrival for the manual onboarding
 * entry. SSO students never reach here: they enter through /auth/sso-callback,
 * which routes them straight to the sequence. Solid cream, Level 0, no chrome.
 * Routes into onboarding or opens the teacher-join path. See design output
 * "01 Welcome".
 */
export function WelcomeScreen({
  linkError = false,
  joinToken,
}: {
  /**
   * Force the dead-link message. Kept for callers that already know the link
   * is bad; the screen now finds that out for itself too - see `badLink`.
   */
  linkError?: boolean;
  /**
   * The token from a join link. `JoinLanding` has always sent students here
   * as `/student/onboarding?token=...` and nothing read it, so the invitation
   * was dropped on the doorstep - the child then onboarded as nobody, and the
   * device remembered them under an identifier invented from their name.
   * Held in the draft until PIN creation, which redeems it.
   */
  joinToken?: string;
}) {
  const router = useRouter();
  const { signOut } = useAuth();
  const hydrated = useHydrated();
  const signedIn = useHasSession();
  const [handedOver, setHandedOver] = useState(false);

  /*
   * A JOIN LINK ON A TABLET SOMEBODY IS SIGNED INTO IS A HAND-OVER.
   *
   * The route guard lets `?token=` through on purpose - bouncing it would
   * discard the invitation in silence and drop the arriving child into the
   * signed-in child's dashboard. But letting it run straight into onboarding
   * means the name, school, class and motor baseline are all collected from
   * whoever is holding the tablet while a different child's session is live.
   *
   * So the tablet is handed over explicitly. Buildable now because 28c remembers
   * up to six children: signing the current child out costs a PIN rather than
   * their account.
   */
  const needsHandover = Boolean(joinToken) && signedIn && !handedOver;

  /*
   * A DEAD LINK SAID SO AT THE END OF ONBOARDING, OR NEVER.
   *
   * `linkError` renders the dead-link copy and NOTHING EVER SET IT - the prop
   * had no caller anywhere.
   * So an expired or revoked invitation looked exactly like a good one: the
   * child gave their name, their school, their class and sat the whole motor
   * baseline, and the link was only redeemed at PIN creation - where it failed
   * and they were told their PIN did not save.
   *
   * `GET /api/v1/join/{token}` is public and answers `status` as
   * "valid" | "expired" | "revoked", and it is the same call the admin console's
   * join landing already makes. So the screen can ask at the door.
   *
   * A FAILED LOOKUP IS NOT A DEAD LINK. A network that dropped says nothing
   * about the invitation, and turning that into "ask your teacher for a new
   * one" would send a child away from a link that works. Only an answer that
   * names the link as bad closes the door.
   */
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!joinToken) return;
    let cancelled = false;
    void invitesApi
      .lookupJoin(joinToken)
      .then((res) => {
        if (!cancelled) setTokenStatus(res.status);
      })
      .catch(() => {
        // Deliberately not `linkError`: see above.
      });
    return () => {
      cancelled = true;
    };
  }, [joinToken]);

  const badLink =
    linkError || (tokenStatus !== null && tokenStatus !== "valid");

  useEffect(() => {
    // Only once the invitation is actually this child's. Writing it while a
    // hand-over is still on screen would attach the invite to the draft even
    // if the signed-in child chose to stay - and before hydration the screen
    // cannot yet know whether a hand-over is needed.
    if (!hydrated || needsHandover) return;
    /*
     * A NEW CHILD STARTS HERE, SO THE DRAFT STARTS EMPTY. It used to be merged
     * into, and cleared only when a child finished - so a child who walked
     * away left their name, class code and invitation for the next child on
     * the tablet. Only this arrival's own invitation goes in.
     */
    startOnboardingDraft(joinToken ? { joinToken } : {});
  }, [hydrated, joinToken, needsHandover]);

  /*
   * A token cannot be judged until the client can see the session, so neither
   * screen is drawn before then. `useHasSession`'s server snapshot is
   * hardcoded false, so rendering early would show the arriving child the
   * welcome and then swap it for a hand-over - or worse, let them start.
   *
   * Only gated when there IS a token: every ordinary arrival still renders on
   * the server exactly as it did.
   */
  if (joinToken && !hydrated) return null;

  if (needsHandover) {
    return (
      <JoinHandover
        signedInName={getStoredDisplayName()}
        onCarryOn={() => {
          // The session goes FIRST. Everything downstream of this - the
          // baseline especially - must not be able to attribute itself to the
          // child who was here. Revoked on the server and the on-device signal
          // store purged, not just forgotten locally.
          signOut();
          clearSession();
          setHandedOver(true);
        }}
      />
    );
  }

  return (
    // Short viewports start at the top rather than centring: centring wastes
    // the space it does not have, and pushed both buttons below the fold on a
    // 700x300 landscape screen. Measured, not assumed.
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-6 text-nevo-near-black [@media(max-height:460px)]:justify-start [@media(max-height:460px)]:py-1">
      {/* Combined lockup — the primary brand mark for this first-arrival moment */}
      <NevoLockup
        priority
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
      />

      {/* Settling character (Design System §12 illustration) */}
      {/*
        THE WIDTH LIVES ON A WRAPPER, not on the illustration.
        `IllustrationWrapper` merges its own classes with the caller's through
        `cn`, and tailwind-merge treats a `[@media(max-height:...)]:w-[96px]`
        as conflicting with `w-[280px]` and drops one of them - measured: the
        class never reached the DOM and the illustration stayed 292px tall on a
        300px screen. A wrapper's width cannot conflict with the image's, so
        the short-viewport size actually applies.
      */}
      <div className="mt-7 w-[280px] sm:w-[340px] lg:w-[320px] [@media(max-height:460px)]:mt-2 [@media(max-height:460px)]:w-[96px]">
        <SettlingCharacter
          priority
          className="w-full motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:delay-150 motion-safe:duration-500"
        />
      </div>

      <div className="mt-8 flex w-full flex-col items-center motion-safe:animate-in motion-safe:fade-in motion-safe:delay-300 motion-safe:duration-500 sm:mt-9 [@media(max-height:460px)]:mt-2">
        {/* The single line of explanatory copy — warm, present-tense, no punctuation */}
        <p className="text-center text-base font-normal sm:text-[17px] lg:text-lg">
          Let&apos;s get you learning
        </p>

        {badLink ? (
          /*
           * DESIGN'S WORDS, 24 Sep, and the change is the tense.
           *
           * This read "This link isn't working right now", which says
           * TEMPORARY - and a child who reads that waits, or tries again
           * later, on a link that has been revoked or has expired and will
           * never work. The next action is to ask for a different one, so the
           * copy has to close the first door before it opens the second.
           *
           * Two lines rather than one because they are two different things:
           * what happened, and what to do about it.
           */
          <div className="mt-10 w-full max-w-[480px] text-center text-sm text-nevo-near-black/70 sm:mt-11">
            <p>This link is not working any more.</p>
            <p className="mt-1">Ask your teacher to send you a new one.</p>
          </div>
        ) : (
          <div className="mt-7 flex w-full flex-col gap-2 sm:mt-8 sm:max-w-[480px]">
            <Button
              onClick={() => router.push(NEXT_STEP)}
              className="w-full"
            >
              I have a school code
            </Button>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="md" className="w-full font-normal">
                  I&apos;m joining through my teacher
                </Button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="rounded-t-[20px] border-0! bg-nevo-cream pb-7 sm:inset-x-auto! sm:top-1/2! sm:bottom-auto! sm:left-1/2! sm:w-[440px] sm:max-w-[calc(100%-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px]! sm:p-7 sm:shadow-[0_8px_32px_rgba(0,0,0,0.16)]"
              >
                <SheetHeader className="pr-11">
                  <SheetTitle className="text-nevo-navy">
                    Joining through your teacher
                  </SheetTitle>
                  <SheetDescription className="text-nevo-near-black/70">
                    Your teacher can show you a QR code to scan, or read out a
                    class code for you to type in.
                  </SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-2 px-4 pb-2 sm:px-0">
                  <Button
                    className="w-full"
                    onClick={() =>
                      router.push("/student/onboarding/teacher-join?mode=scan")
                    }
                  >
                    Scan a QR code
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    className="w-full font-normal"
                    onClick={() =>
                      router.push("/student/onboarding/teacher-join?mode=code")
                    }
                  >
                    Enter a code instead
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
    </main>
  );
}
