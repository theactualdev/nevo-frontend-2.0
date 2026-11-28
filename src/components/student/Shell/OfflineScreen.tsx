"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog as DialogPrimitive } from "radix-ui";
import { CombinedMark } from "@/components/shared/BrandMarks";
import { getSession } from "@/lib/auth/session";
import { holdsProgress } from "@/lib/lessons/pendingProgress";
import { canOpenOffline, savedLessons } from "@/lib/offline/savedLessons";
import { TabOfflineBanner } from "./TabOfflineBanner";
import {
  OFFLINE_ILLUSTRATION,
  OFFLINE_MARK_SRC,
  keepOfflineArt,
  offlineArt,
} from "./offlineArt";

/**
 * Board 28's "Offline (full screen)", for the one child it is for (design,
 * D50): the banner is the default, and the full screen appears only when the
 * child cannot continue at all - nothing downloaded and nothing in progress.
 *
 * Downloaded is a lesson on this child's shelf (`savedLessons`) that can still
 * open offline (`canOpenOffline`, safety v2): an expired copy, or one the
 * server has not vouched for, is nothing to do. In progress is
 * a position this device holds and has not sent (`holdsProgress`). A child with
 * either keeps the tab and the banner over it, because there is something here
 * for them to do.
 *
 * Signed out there is no child to strand: the walkthrough is fixtures, it
 * works offline, and it keeps the banner.
 */
export function strandedOffline(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return !savedLessons(userId).some(canOpenOffline) && !holdsProgress();
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
    // While there is a connection, take the full screen's pictures off it.
    if (online) keepOfflineArt();
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
 *
 * "Your progress is saved" came out too (D136, 8 Oct: "nothing claims a save
 * that has not been confirmed"). It stood on `holdsProgress()` being false,
 * which says only that no lesson POSITION waits on this device - not that a
 * held answer, a signal in the outbox or a write that failed outright ever
 * reached the server. That is an inference, not a confirmation.
 *
 * TRY AGAIN, THE FRAME'S (Lydia, 19 Nov, L5): "In the connectivity
 * conditions these children are actually in, the connection commonly returns
 * within seconds. A bare takeover leaves a child with no option but to kill
 * the app, which also loses their place." The screen still goes by itself the
 * moment the browser says the connection is back; Try again does not re-ask
 * the browser, which already answered - it asks the network, with a request
 * of its own (`reachable`). If that answers, the connection is back whatever
 * the browser said, and the screen goes as it would have. If not, nothing
 * changes and nothing is said: the screen already says it. The frame's
 * ghost button, alone, since "See saved lessons" is not on this screen.
 *
 * ITS PRESSED AND TRYING STATES ARE THE FRAME'S (28, 20 Nov drawing batch;
 * Lydia, 25 Nov, L5). Pressed, a 10% navy fill at 500. While the network is
 * asked, a ring and "Trying again", at full strength - it dimmed to 60% and
 * kept saying "Try again", which reads as a button that has given up. See
 * `TryAgainLabel`.
 *
 * OVER THE TAB, NOT IN PLACE OF IT. The tab stays mounted underneath, so
 * anything half-written is still there when the screen goes. Modal and not
 * dismissable, the way `AccountPauseHost` holds a screen over a page.
 *
 * ITS PICTURES ARE THE COPIES KEPT WHILE ONLINE (`offlineArt`). Fetched when
 * the screen appeared, they were the two things on it that needed the
 * connection it was there to say was gone.
 */
export function OfflineScreen() {
  const art = offlineArt();
  const [trying, setTrying] = useState(false);
  const alive = useRef(true);
  const screenRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const tryAgain = () => {
    if (trying) return;
    setTrying(true);
    void reachable().then((up) => {
      if (!alive.current) return;
      setTrying(false);
      // The shell's own `online` listener takes the screen away, and runs
      // everything a returning connection runs (held progress, the shelf).
      if (up) window.dispatchEvent(new Event("online"));
    });
  };
  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        {/*
          THE SCREEN TAKES FOCUS, NOT TRY AGAIN (on-screen QA, 24 Nov). The
          dialog's own default moved focus to its first control as the screen
          came up, and the console's focus ring went round Try again - so the
          frame's borderless ghost opened looking like an outlined button,
          with nothing the child had done to put it there. The screen is what
          arrived, as it was before the button existed: a screen reader reads
          its title and line, and Tab still reaches Try again, ring and all.
        */}
        <DialogPrimitive.Content
          ref={screenRef}
          data-nevo-console="student"
          aria-describedby="offline-screen-body"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            screenRef.current?.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto bg-nevo-cream px-10 text-center text-nevo-near-black outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 sm:px-12"
        >
          <CombinedMark
            src={art.mark ?? OFFLINE_MARK_SRC}
            className="mb-8 sm:mb-10"
          />
          <Image
            src={art.illustration ?? OFFLINE_ILLUSTRATION.src}
            alt=""
            width={OFFLINE_ILLUSTRATION.width}
            height={OFFLINE_ILLUSTRATION.height}
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
            No internet connection right now.
          </p>
          <button
            type="button"
            onClick={tryAgain}
            disabled={trying}
            aria-busy={trying}
            className={cn(
              "mt-8 flex h-12 w-full max-w-[290px] cursor-pointer items-center justify-center gap-2.5 rounded-[10px] text-[15px] text-nevo-navy transition-transform disabled:cursor-default sm:mt-9 sm:w-[340px] sm:max-w-none",
              TRY_AGAIN_PRESSED,
            )}
          >
            <TryAgainLabel trying={trying} />
          </button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Frame 28's pressed Try again (20 Nov drawing batch): a 10% navy fill at
 * 500, as well as the press's own 0.98.
 */
export const TRY_AGAIN_PRESSED =
  "active:scale-[0.98] active:bg-nevo-navy/10 active:font-medium";

/**
 * Frame 28's Try again, and its trying state (20 Nov drawing batch; Lydia,
 * 25 Nov, L5): a 17px ring and "Trying again", 10 apart, at full strength.
 * The ring turns only where motion is allowed; drawn, it already says the
 * read is out. One label for every Try again the frame's offline screen
 * draws, so they cannot drift apart.
 */
export function TryAgainLabel({ trying }: { trying: boolean }) {
  if (!trying) return <>Try again</>;
  return (
    <>
      <span
        aria-hidden
        data-trying-ring
        className="inline-block size-[17px] shrink-0 rounded-full border-2 border-nevo-navy/22 border-t-nevo-navy motion-safe:animate-spin"
      />
      Trying again
    </>
  );
}

/** How long Try again waits for the network before it counts as no answer. */
export const REACH_TIMEOUT_MS = 8000;

/**
 * Whether the network answers at all: a request of our own for a small file
 * this site serves, never from a cache. ANY response is an answer - the point
 * is that something came back, not what. No response, or none in time, is
 * offline still.
 */
export async function reachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REACH_TIMEOUT_MS);
  try {
    await fetch(`/og-card.png?reach=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
