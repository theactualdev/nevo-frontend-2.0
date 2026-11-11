"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/shared";
import {
  MARK_WAIT_LINE,
  SEND_AGAIN,
  SLOW_MARK_MS,
  failureOf,
  retryOf,
  type VerdictReply,
} from "@/lib/lessons/verdict";
import { cn } from "@/lib/utils";

/**
 * THE WAIT FOR A MARK, as the child sees it (SCRUM-315; Lydia, 7 and 9 Nov,
 * restated in her 10 Nov rulings).
 *
 * - Held, the pick stays chosen and nothing is said (7 Nov).
 * - Past about two seconds, ONE NEUTRAL LINE ABOUT THE SYSTEM, never about the
 *   answer: "Nevo has your answer and is still working." (`slow`).
 * - "Send again" ONLY ON A REAL FAILURE, never on a timer (`failed`): a send
 *   that failed with nothing on the device to mark it by. The line goes then -
 *   "still working" is not true of a send that failed.
 *
 * `hold` is the caller's own count of the holds it has started - each pick,
 * check or "Send again" a new one - and null while nothing is held. Both
 * states are this hold's, so a new hold starts quiet again.
 */
export function useMarkWait(
  hold: number | null,
  reply: VerdictReply | null,
): { slow: boolean; failed: boolean } {
  const [slowFor, setSlowFor] = useState<number | null>(null);
  const [failedFor, setFailedFor] = useState<number | null>(null);
  useEffect(() => {
    if (hold === null) return;
    const timer = setTimeout(() => setSlowFor(hold), SLOW_MARK_MS);
    return () => clearTimeout(timer);
  }, [hold]);
  useEffect(() => {
    if (hold === null) return;
    const listen = failureOf(reply);
    if (!listen) return;
    return listen(() => setFailedFor(hold));
  }, [hold, reply]);
  return {
    slow: hold !== null && slowFor === hold,
    failed: hold !== null && failedFor === hold,
  };
}

/**
 * The wait's one slot. While a pick is held it is a polite live region, empty
 * and taking no space, so what lands in it later is read out: the line, or
 * "Send again" in its place. Secondary, never the navy primary: sending again
 * is not the way on. `className` places what shows (the default sits below
 * the control above it).
 */
export function MarkWait({
  hold,
  reply,
  onSentAgain,
  className = "mt-4",
}: {
  hold: number | null;
  reply: VerdictReply | null;
  /** After the same answer has gone again: the caller starts a new hold. */
  onSentAgain: () => void;
  className?: string;
}) {
  const { slow, failed } = useMarkWait(hold, reply);
  if (hold === null) return null;
  const retry = retryOf(reply);
  return (
    <div aria-live="polite" data-mark-wait-slot>
      {failed ? (
        retry && (
        <Button
          variant="secondary"
          className={cn("w-full", className)}
          data-send-again
          onClick={() => {
            retry();
            onSentAgain();
          }}
        >
          {SEND_AGAIN}
        </Button>
        )
      ) : slow ? (
        <p
          data-mark-wait
          className={cn(
            "text-center text-[13.5px] leading-[1.5] text-nevo-near-black/70",
            className,
          )}
        >
          {MARK_WAIT_LINE}
        </p>
      ) : null}
    </div>
  );
}
