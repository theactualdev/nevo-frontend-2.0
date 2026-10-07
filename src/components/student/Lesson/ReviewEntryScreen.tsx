"use client";

import { useContext, useEffect } from "react";
import { Button } from "@/components/shared";
import { LessonContext } from "@/context/LessonContext";
import { LeaveButton } from "./LeaveButton";

/**
 * Review session entry (37d, Intelligence Layer). Spaced retrieval, timed to
 * reinforce memory just as it starts to fade - not homework, not repetition.
 * A calm landing that names the lesson and why it's back, then hands over to
 * the ordinary player (the session itself reuses it wholesale).
 *
 * THE RECENCY LINE DEFAULTED TO "You worked on this two weeks ago" - a specific
 * claim about the child, hardcoded, and never overridden by any caller. Every
 * child was told two weeks whatever the truth was. It is now derived from the
 * progress row when there is one, and when there is not it says nothing about
 * timing rather than picking a number.
 *
 * ASK NEVO IS DOCKED HERE (design D108, 6 Oct: "docked and reachable from
 * anywhere in the student app"). This is a landing, not lesson content - the
 * review has not begun - so IA 31's rule for the player does not reach it.
 * Like the completion screen, it says so while it is up; "Begin review"
 * unmounts it, and the drawer goes as the review starts.
 */

/** "two weeks ago", "yesterday" - only ever from a real timestamp. */
function agoPhrase(iso: string): string | null {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return null;
  if (days === 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks === 1) return "a week ago";
  if (days < 60) return `${weeks} weeks ago`;
  return "a while back";
}

export function ReviewEntryScreen({
  lessonTitle,
  lastWorkedAt = null,
  onBegin,
  onLeave,
}: {
  lessonTitle: string;
  /** When they last worked on it. Null means we do not know, and say so. */
  lastWorkedAt?: string | null;
  onBegin: () => void;
  /**
   * D36: the review entry had no way out but in. Leaving here is not
   * starting, so nothing is recorded against the concept - the review stays
   * due rather than counting as missed.
   */
  onLeave?: () => void;
}) {
  // A tolerant read, as on the completion screen: rendered with no provider,
  // there is no drawer to allow.
  const allowAskNevo = useContext(LessonContext)?.setAskNevoAllowed;
  useEffect(() => {
    if (!allowAskNevo) return;
    allowAskNevo(true);
    return () => allowAskNevo(false);
  }, [allowAskNevo]);

  const ago = lastWorkedAt ? agoPhrase(lastWorkedAt) : null;
  const note = ago
    ? `You worked on this ${ago}. Let's see what's stuck.`
    : "This one's come back around. Let's see what's stuck.";
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
      {onLeave && (
        <div className="absolute inset-x-0 top-0 flex px-3.5 pt-2.5">
          <LeaveButton onLeave={onLeave} />
        </div>
      )}
      <span className="flex h-7 items-center rounded-[20px] bg-nevo-violet px-3 text-[11px] font-bold tracking-[0.16em] text-nevo-cream">
        REVIEW SESSION
      </span>
      <h1 className="mt-6 text-2xl font-bold tracking-[-0.01em] text-nevo-navy sm:text-[28px] lg:text-[30px]">
        {lessonTitle}
      </h1>
      <p className="mt-2 max-w-[340px] text-[15px] leading-[1.55] text-nevo-near-black sm:text-base">
        {note}
      </p>
      <Button className="mt-8 w-auto px-8" onClick={onBegin}>
        Begin review
      </Button>
    </div>
  );
}
