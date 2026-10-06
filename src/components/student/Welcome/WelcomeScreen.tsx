"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { startOnboardingDraft } from "@/lib/auth/onboarding";
import { Button, NevoLockup, SettlingCharacter } from "@/components/shared";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** 05 Entry - the school code and the Student ID, on one screen. */
const ENTRY = "/student/onboarding/school";
/** 03 Teacher Join - the same screen, framed for a code the teacher reads out. */
const TEACHER_JOIN = "/student/onboarding/teacher-join";

/**
 * Welcome Screen (UI/UX spec B.1) — first arrival for the manual onboarding
 * entry. SSO students never reach here: they enter through /auth/sso-callback,
 * which routes them straight to the sequence. Solid cream, Level 0, no chrome.
 * See design outputs "01 Welcome" and "02 Welcome - Teacher Invite".
 *
 * ONE ROUTE IN, TWO DOORS TO IT (30 Sep, SCRUM-208). Both buttons reach the
 * entry screen; the teacher sheet only frames it for a code read out loud.
 * The QR scan and class code the sheet used to offer were retired, and so was
 * the join link's `?token=` hand-off this screen once read: a child is never
 * sent a link (D5).
 */
export function WelcomeScreen() {
  const router = useRouter();

  /*
   * A NEW CHILD STARTS HERE, SO THE DRAFT STARTS EMPTY. It used to be merged
   * into, and cleared only when a child finished - so a child who walked away
   * left their name and age for the next child on the tablet.
   */
  useEffect(() => {
    startOnboardingDraft();
  }, []);

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

        <div className="mt-7 flex w-full flex-col gap-2 sm:mt-8 sm:max-w-[480px]">
          <Button onClick={() => router.push(ENTRY)} className="w-full">
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
                <SheetDescription className="text-nevo-near-black">
                  Your teacher will read out your school&apos;s code for you to
                  type in.
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-2 px-4 pb-2 sm:px-0">
                <Button
                  className="w-full"
                  onClick={() => router.push(TEACHER_JOIN)}
                >
                  Enter the school code
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </main>
  );
}
