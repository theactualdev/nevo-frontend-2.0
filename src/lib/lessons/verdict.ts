/**
 * TEST 9: THE SERVER MARKS (Lydia, 5 Nov; the hub, 6 Nov).
 *
 * Online, an answer is marked by the server, and the screen moves on its
 * mark, never the device's. `POST /api/v1/lessons/{id}/attempts` already
 * answers with it: `correct` on the stored row.
 *
 * A VERDICT IS THREE THINGS, NOT TWO:
 *  - `true`: the server marked it right.
 *  - `false`: the server marked it wrong.
 *  - `null`: the server could not mark it ("NULL MEANS UNMARKABLE, never
 *    wrong" - `api/checkpoints.ts`). Nothing is said about it either way, it
 *    counts for nothing, and it does not hold the child.
 *
 * OFFLINE THE PACKAGE STILL MARKS, for now: no sitting yet, no connection, a
 * mock lesson, or a write the server refused leaves no reply to wait for, so
 * the lesson's own key decides, as it did before (until Teslim's
 * offline-marked flag and re-verify on sync).
 *
 * A component handed a verdict SYNCHRONOUSLY applies it at once - there was
 * nothing to wait for. A promise is waited for with the child's pick held
 * quietly (SCRUM-315, Lydia, 7 Nov): the pick visibly chosen, the control
 * still pressable, no spinner, no progress and no verdict before the
 * server's. A wait past about two seconds says one neutral line about the
 * system, and only a send that really failed offers to send it again
 * (`SLOW_MARK_MS`, `MarkWait`; Lydia, 9 Nov, restated 10 Nov).
 */
export type Verdict = boolean | null;

/**
 * A mark on its way that can be asked for again: `retry` sends the same
 * answer once more (the same attempt id, so the server keeps one), and the
 * reply settles on whichever answer lands first.
 *
 * `onFailure` hears a send of it that REALLY FAILED - no connection, or the
 * server erring or not answering in time - with nothing on the device to mark
 * it by, so the reply is still unsettled and only sending it again can settle
 * it. A listener added while such a failure stands hears it at once. Gives
 * back the way to stop listening.
 */
export type PendingVerdict = Promise<Verdict> & {
  retry?: () => void;
  onFailure?: (listener: () => void) => () => void;
};

/** What an answer handler gives back: a mark now, or one on its way. */
export type VerdictReply = Verdict | PendingVerdict;

/**
 * HOW LONG A HELD PICK WAITS BEFORE THE NEUTRAL LINE (Lydia, 9 Nov: "If a
 * wait longer than about two seconds is still possible after his fix, bring
 * it back to me and we will add one neutral line about the system rather
 * than a state on the child's answer"). It was: replies ran 2.3 to 8.6 s on
 * 9 Nov, and her 10 Nov rulings restate the line. It says nothing about the
 * answer, and it offers nothing - the retry is not on a timer any more.
 */
export const SLOW_MARK_MS = 2_000;

/** Her words for it (9 Nov, restated 10 Nov). */
export const MARK_WAIT_LINE = "Nevo has your answer and is still working.";

/** Her word for sending it again, shown on a real failure only. */
export const SEND_AGAIN = "Send again";

/** The retry a reply on its way offers, or null where there is none. */
export function retryOf(reply: VerdictReply | null | undefined): (() => void) | null {
  if (!(reply instanceof Promise)) return null;
  return typeof reply.retry === "function" ? reply.retry : null;
}

/** How to hear a reply's real failures, or null where it reports none. */
export function failureOf(
  reply: VerdictReply | null | undefined,
): ((listener: () => void) => () => void) | null {
  if (!(reply instanceof Promise)) return null;
  return typeof reply.onFailure === "function" ? reply.onFailure : null;
}

/**
 * Wait for a reply's verdict, however it came. A synchronous one is applied
 * in the same tick (`then` is never called for it), so a mark the device
 * already had is not deferred behind a microtask.
 */
export function onVerdict(
  reply: VerdictReply,
  apply: (verdict: Verdict) => void,
): void {
  if (reply instanceof Promise) {
    void reply.then(apply, () => apply(null));
    return;
  }
  apply(reply);
}

/**
 * The package's mark on a pick: whether it is the option the lesson's key
 * names, or NULL WHERE THE LESSON CARRIES NO KEY. Online the server holds the
 * keys back (Teslim's 41c2f83: `answerKey`, `acceptedAnswers`, `answer` and
 * `explanation` are stripped from every online student lesson), so a check
 * read online has none, and with no reply to go on the device has nothing to
 * mark it against. Never wrong, then - unmarkable, which holds no one.
 */
export function keyMark(
  picked: string | null | undefined,
  correctId: string | undefined,
): Verdict {
  if (correctId === undefined) return null;
  return picked === correctId;
}

/** The server's mark on a stored row, or the package's where it carries none. */
export function verdictOf(
  stored: { correct?: boolean | null } | null | undefined,
  packageMark: () => Verdict,
): Verdict {
  if (!stored || stored.correct === undefined) return packageMark();
  return stored.correct;
}
