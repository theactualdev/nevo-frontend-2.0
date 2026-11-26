"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BREAK_TYPES } from "@/lib/constants/breakTypes";

/** Opens a beat after the segment settles, as the pill it replaced did. */
const OPEN_DELAY_MS = 1500;

interface CardCopy {
  title: string;
  body: string;
  take: string;
  later: string;
}

/*
 * 17d S5's three cards (Nevo Lesson Player Frame, `boCopy`): a short pause,
 * straight back to the same place; a proper break; and stopping for today.
 * The first two verbatim. The third's body is Lydia's (25 Nov, L60), not the
 * frame's "We'll pick it up next time, right where you are - nothing is
 * lost", which is the claim D88 ruled out: what is kept is the last point
 * that was saved.
 */
const PAUSE: CardCopy = {
  title: "Want to pause for a moment?",
  body: "A slow breath, then straight back to where you are.",
  take: "Take a short pause",
  later: "Not just now",
};
const BREAK: CardCopy = {
  title: "This might be a good moment for a break.",
  body: "Step away and come back when you're ready. Your place is kept for you.",
  take: "Take a break",
  later: "Not just now",
};
const STOP_FOR_TODAY: CardCopy = {
  title: "It's okay to stop here for today.",
  body: "Your last saved point is kept, and this lesson will be here when you come back.",
  take: "Stop for today",
  later: "Stay a little longer",
};

/**
 * WHICH CARD, BY THE BREAK'S WEIGHT (Lydia, 26 Oct: "micro and consolidation
 * in place, movement and full take the screen"). For movement and
 * consolidation the body is her 7 Nov line for that kind, which says what the
 * break is; the frame's bodies describe a breath and a step away. A kind this
 * player does not know draws nothing (rule 5).
 */
export function breakCardCopy(kind: string | null | undefined): CardCopy | null {
  switch (kind) {
    case BREAK_TYPES.MICRO:
      return PAUSE;
    case BREAK_TYPES.CONSOLIDATION:
      return { ...PAUSE, body: "Let's go back over what you just did." };
    case BREAK_TYPES.MOVEMENT:
      return { ...BREAK, body: "Stand up and stretch for a moment." };
    case BREAK_TYPES.FULL:
      return BREAK;
    case BREAK_TYPES.STOP_FOR_DAY:
      return STOP_FOR_TODAY;
    default:
      return null;
  }
}

/**
 * The system's break OFFER (B.7) as 17d S5 draws it, in place of frame 38's
 * pill (Lydia, 25 Oct, SCRUM-282 - "the break card replacing the pill"; built
 * on her 19 Nov L2: "The new break numbers change when the card fires, not
 * what it looks like"): a calm card along the foot of the lesson, its title
 * and line, the way to take the break, and the way to carry on.
 *
 * PERSISTENT. It never goes by itself: "it stays until it is taken or the
 * child leaves" (17d S5; SCRUM-282: "its offer does not disappear on a
 * timer"). "Not just now" is an answer, and spends it, as "Not now" did.
 *
 * NEVER A SCRIM: the lesson stays visible behind it. It sits over the foot of
 * the player, as the frame puts it (`position:absolute;left:0;right:0;
 * bottom:0`, full width at every size), so the arrows are under it until the
 * child answers.
 */
export function BreakOfferCard({
  kind,
  onAccept,
  onDismiss,
  onShown,
}: {
  /** The kind the server offered (`breakType`). */
  kind?: string | null;
  onAccept: () => void;
  onDismiss: () => void;
  /** The card has actually appeared, after its beat. */
  onShown?: () => void;
}) {
  const copy = breakCardCopy(kind);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const onShownRef = useRef(onShown);
  useEffect(() => {
    onShownRef.current = onShown;
  }, [onShown]);

  useEffect(() => {
    if (!copy) return;
    const t = setTimeout(() => {
      setOpen(true);
      onShownRef.current?.();
    }, OPEN_DELAY_MS);
    return () => clearTimeout(t);
  }, [copy]);

  if (!copy || !open) return null;

  return (
    <section
      role="status"
      aria-labelledby={titleId}
      className="fixed inset-x-0 bottom-0 z-[7] mx-auto w-full max-w-[1440px] rounded-t-[16px] bg-nevo-cream-elevated px-[22px] pt-[22px] pb-6 shadow-[0_-8px_32px_rgba(0,0,0,0.16)] motion-safe:animate-nevo-rise"
    >
      <p
        id={titleId}
        className="text-[17px] font-semibold tracking-[-0.01em] text-nevo-near-black"
      >
        {copy.title}
      </p>
      <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/70">
        {copy.body}
      </p>
      <button
        type="button"
        onClick={onAccept}
        className="mt-[18px] h-[52px] w-full cursor-pointer rounded-[10px] bg-nevo-navy text-base font-medium text-nevo-cream transition-transform active:scale-[0.98]"
      >
        {copy.take}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-1.5 h-[46px] w-full cursor-pointer rounded-[10px] text-[15px] font-medium text-nevo-navy transition-transform active:scale-[0.98]"
      >
        {copy.later}
      </button>
    </section>
  );
}
