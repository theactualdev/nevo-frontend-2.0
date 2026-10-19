/**
 * The consent gate's answer as the device holds it, and what a capture makes
 * of it (19 Oct browser-storage audit).
 *
 * Its own module, beside nothing, so the screens that read it keep the rule
 * when a test stands in for `useConsentGate`.
 */

export interface ConsentGate {
  /** The read answered, and the answer was a withdrawal. */
  withdrawn: boolean;
  /** The read answered. */
  known: boolean;
  /**
   * Settled with no answer: nobody is signed in to ask for, or the read
   * failed. Not a withdrawal - a reason to hold, not to stop.
   */
  unreadable: boolean;
}

/**
 * What a capture does with the gate:
 *  - `allowed`: answered, and not a withdrawal. Only this starts a capture.
 *  - `pending`: still asking. Nothing is captured yet.
 *  - `unknown`: there is no answer to be had. Nothing is captured, and
 *    whatever was is let go of - not knowing is not permission (rule 5).
 *  - `withdrawn`: stopped for good (SCRUM-80).
 */
export type ConsentAnswer = "pending" | "allowed" | "withdrawn" | "unknown";

/**
 * Partial so an older shape - `{ withdrawn, known }` - reads as it was meant:
 * answered, or still asking.
 */
export function consentAnswer(gate: Partial<ConsentGate>): ConsentAnswer {
  if (gate.withdrawn) return "withdrawn";
  if (gate.known) return "allowed";
  if (gate.unreadable) return "unknown";
  return "pending";
}
