"use client";

import { useEffect, useRef, useState } from "react";
import { MODALITY, type Modality } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Opens a beat after the segment settles, so it never competes with the content. */
const OPEN_DELAY_MS = 1500;
/** The accepted beat: card fills navy, then the modality switches (frame 17 §C3). */
const ACCEPT_BEAT_MS = 300;

/** Frame copy - one conversational question, tailored to the offered channel. */
const INVITATION: Record<Modality, string> = {
  [MODALITY.TEXT]: "Want to read this one instead?",
  [MODALITY.VISUAL]: "Want to try this as a diagram?",
  [MODALITY.AUDIO]: "Want to try listening to this one?",
  [MODALITY.INTERACTIVE]: "Want to work through this hands-on?",
};

/**
 * The system's one modality suggestion for a segment (Lesson Player frame 17,
 * SCRUM-94.4/94.5). A calm card below the top bar with the invitation and two
 * **discrete peer buttons** - "Yes, try it" and "Not now" - both 44px tall, 8px
 * apart, neither nested in the other (a nested dismiss let a boundary mis-tap
 * silently reverse the student's meaning). The card itself is not tappable.
 *
 * **No auto-dismiss**: the offer holds until the student acts - a self-dismissing
 * pill is indistinguishable from a declined one in the signal record. Accepting
 * fills the card navy for ~300ms before the modality switches.
 *
 * Renders absolutely inside a relative anchor under the progress line. Mount
 * one per segment (key on the segment id).
 */
export function ModalitySuggestionPill({
  modality,
  onAccept,
  onAcceptStart,
  onDismiss,
  onShown,
}: {
  modality: Modality;
  /** Student took the offer - switch to `modality` (fires after the beat). */
  onAccept: () => void;
  /**
   * Fires the moment "Yes, try it" is tapped - opens the `system_busy`
   * modality_switch window that `onAccept` (the player's switch) closes.
   */
  onAcceptStart?: () => void;
  /** Declined. The offer is spent. */
  onDismiss: () => void;
  /**
   * The card has actually appeared - after its beat, not when it mounted. A
   * child who moves on inside the beat never saw an offer.
   */
  onShown?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const acceptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onShownRef = useRef(onShown);
  useEffect(() => {
    onShownRef.current = onShown;
  }, [onShown]);

  useEffect(() => {
    const show = setTimeout(() => {
      setOpen(true);
      onShownRef.current?.();
    }, OPEN_DELAY_MS);
    return () => {
      clearTimeout(show);
      if (acceptTimer.current) clearTimeout(acceptTimer.current);
    };
  }, []);

  const accept = () => {
    if (accepting) return;
    setAccepting(true);
    onAcceptStart?.();
    acceptTimer.current = setTimeout(onAccept, ACCEPT_BEAT_MS);
  };

  if (!open) return null;

  const buttonBase =
    "flex h-11 flex-1 cursor-pointer items-center justify-center rounded-[10px] px-3.5 text-sm font-medium whitespace-nowrap transition-[filter,opacity] duration-200 active:scale-[0.98]";

  return (
    <div className="pointer-events-none absolute inset-x-0 -top-1 z-10 flex justify-center px-4 sm:top-0.5">
      <div
        role="status"
        className={cn(
          "pointer-events-auto flex w-full max-w-[340px] flex-col items-stretch gap-3.5 rounded-[12px] p-[18px] pb-4 transition-[background-color,box-shadow] duration-300 ease-out motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2 motion-safe:duration-200 motion-safe:ease-out",
          accepting
            ? "bg-nevo-navy shadow-[0_8px_24px_rgba(59,63,110,0.28)]"
            : "bg-nevo-cream-elevated shadow-[0_8px_24px_rgba(0,0,0,0.14)]",
        )}
      >
        <span
          className={cn(
            "text-[15px] leading-[1.45] text-pretty transition-colors duration-300 ease-out",
            accepting ? "text-nevo-cream" : "text-nevo-near-black",
          )}
        >
          {INVITATION[modality]}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={accept}
            disabled={accepting}
            className={cn(
              buttonBase,
              "bg-nevo-navy text-nevo-cream hover:brightness-106",
              accepting && "pointer-events-none opacity-0",
            )}
          >
            Yes, try it
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={accepting}
            className={cn(
              buttonBase,
              "bg-transparent text-nevo-navy shadow-[inset_0_0_0_1.5px_rgba(59,63,110,0.28)]",
              accepting && "pointer-events-none opacity-0",
            )}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
