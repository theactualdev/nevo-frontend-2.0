"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * What a section shows when its OWN read did not answer.
 *
 * The admin console's screens each hold several independent reads, and the
 * habit that produced this file is `.catch(() => setThing([]))` - a failure
 * collapsed into the empty value, which the render below then states as fact.
 * PR #218 fixed one instance on the SENCo profile; the same shape was still
 * live in four more places, each turning a broken GET into a signed claim:
 *
 *   - "No guardian on the record" for a child whose parent list 500'd, on a
 *     screen written to be shown TO a parent
 *   - a healthy SSO sync, because `history?.failedRuns ?? 0` coalesces a
 *     failed read straight into the healthy branch
 *   - "There aren't enough lessons yet to show a trend" - a claim about how
 *     much a school has taught, produced by a read that did not answer
 *   - "You're all caught up" and "That's everything" in notifications
 *
 * The wording has to say the absence is UNKNOWN rather than established,
 * because the sections around it state real absences in almost the same shape.
 * An admin cannot tell the two apart unless we do.
 */
export function ReadFailed({
  /** What could not be read, in the admin's words: "this student's guardians". */
  what,
  /**
   * A sentence ruled for one place, said in place of the general one - the
   * staff import's (Lydia, 25 Nov, L64). The retry is the same.
   */
  line,
  onRetry,
  className,
}: (
  | { what: string; line?: never }
  | { line: string; what?: never }
) & {
  onRetry: () => void;
  className?: string;
}) {
  /*
   * WHICH "TRY AGAIN" IS THIS ONE. A sheet can hold this beside its own
   * failed save, and then a screen reader met two buttons both called "Try
   * again" with nothing to tell them apart. The button keeps its words and is
   * described by the sentence above it - no new words are invented.
   */
  const messageId = useId();
  return (
    <div className={cn("text-sm text-nevo-near-black/62", className)}>
      <p id={messageId} className="m-0">
        {line ?? (
          <>
            We couldn&rsquo;t read {what}{" "}just now, so there&rsquo;s nothing to show
            here yet &ndash; this is not a record that it&rsquo;s empty.
          </>
        )}
      </p>
      <button
        type="button"
        onClick={onRetry}
        aria-describedby={messageId}
        className="mt-2.5 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
      >
        Try again
      </button>
    </div>
  );
}
