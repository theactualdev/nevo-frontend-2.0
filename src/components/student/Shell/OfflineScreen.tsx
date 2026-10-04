"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { CombinedMark } from "@/components/shared/BrandMarks";
import { getSession } from "@/lib/auth/session";
import { holdsProgress } from "@/lib/lessons/pendingProgress";
import { savedLessons } from "@/lib/offline/savedLessons";
import { TabOfflineBanner } from "./TabOfflineBanner";

/**
 * Board 28's "Offline (full screen)", for the one child it is for (design,
 * D50): the banner is the default, and the full screen appears only when the
 * child cannot continue at all - nothing downloaded and nothing in progress.
 *
 * Downloaded is a lesson on this child's shelf (`savedLessons`). In progress is
 * a position this device holds and has not sent (`holdsProgress`). A child with
 * either keeps the tab and the banner over it, because there is something here
 * for them to do.
 *
 * Signed out there is no child to strand: the walkthrough is fixtures, it
 * works offline, and it keeps the banner.
 */
export function strandedOffline(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return savedLessons(userId).length === 0 && !holdsProgress();
}

/**
 * What a tab shows while the device is offline: the banner, or for a child
 * who cannot continue at all, the full screen. Nothing while online.
 *
 * The answer is worked out once per drop, and nothing is drawn until it is,
 * so a stranded child never sees the banner flash up before the screen.
 */
export function OfflineNotice({ online }: { online: boolean }) {
  const [answer, setAnswer] = useState<{ online: boolean; stranded: boolean }>(
    { online: true, stranded: false },
  );
  useEffect(() => {
    // Device storage, read after mount and again on every drop - never during
    // a render the server also made.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnswer({
      online,
      stranded: !online && strandedOffline(getSession()?.userId),
    });
  }, [online]);

  if (online || answer.online !== online) return null;
  return answer.stranded ? <OfflineScreen /> : <TabOfflineBanner />;
}

/**
 * The full screen itself.
 *
 * THE FRAME'S WORDS, LESS WHAT CANNOT BE TRUE HERE. The frame says "Your
 * progress is saved - and your downloaded lessons are still here", under "See
 * saved lessons". This screen only ever shows a child with nothing downloaded,
 * so the second half and the button are the two things it must not say.
 * "Your progress is saved" stays, and is true by construction: nothing is
 * held unsent, so everything they did has reached the server.
 *
 * NO "TRY AGAIN", for the reason the banner gives: reconnecting is the retry,
 * and the screen goes the moment the browser says the connection is back. A
 * button that can only re-ask a question the browser already answered is a
 * tap that does nothing.
 *
 * OVER THE TAB, NOT IN PLACE OF IT. The tab stays mounted underneath, so
 * anything half-written is still there when the screen goes. Modal and not
 * dismissable, the way `AccountPauseHost` holds a screen over a page.
 */
export function OfflineScreen() {
  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby="offline-screen-body"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-nevo-cream px-10 text-center text-nevo-near-black outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 sm:px-12"
        >
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
          <DialogPrimitive.Title className="mt-7 text-xl font-medium sm:mt-8 sm:text-2xl">
            You&apos;re offline
          </DialogPrimitive.Title>
          <p
            id="offline-screen-body"
            className="mt-2 max-w-[440px] text-[15px] leading-[1.55] text-nevo-near-black/60 sm:mt-2.5 sm:text-base"
          >
            No internet connection right now. Your progress is saved.
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
