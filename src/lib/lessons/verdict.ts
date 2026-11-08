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
 * server's. A hold long enough to look broken offers a retry and nothing
 * else (`LONG_HOLD_MS`, `HoldRetry`).
 */
export type Verdict = boolean | null;

/**
 * A mark on its way that can be asked for again: `retry` sends the same
 * answer once more (the same attempt id, so the server keeps one), and the
 * reply settles on whichever answer lands first.
 */
export type PendingVerdict = Promise<Verdict> & { retry?: () => void };

/** What an answer handler gives back: a mark now, or one on its way. */
export type VerdictReply = Verdict | PendingVerdict;

/**
 * HOW LONG A HELD PICK WAITS BEFORE IT OFFERS A RETRY (SCRUM-315, Lydia, 7
 * Nov: "one extra state for a hold long enough to look broken: a retry and
 * nothing else"). PROVISIONAL: 8 seconds, chosen here and named for her to
 * change. A reply normally lands in well under a second; the outage of 6 Nov
 * failed reads after about 10.7 seconds, so a hold of 8 has already outlasted
 * any reply that was coming soon.
 */
export const LONG_HOLD_MS = 8_000;

/** The retry a reply on its way offers, or null where there is none. */
export function retryOf(reply: VerdictReply | null | undefined): (() => void) | null {
  if (!(reply instanceof Promise)) return null;
  return typeof reply.retry === "function" ? reply.retry : null;
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
