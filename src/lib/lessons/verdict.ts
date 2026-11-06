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
 * quietly: no new words, no spinner (rule 7). Lydia is asked whether that
 * moment is drawn; if it is, it slots in where the pick is held.
 */
export type Verdict = boolean | null;

/** What an answer handler gives back: a mark now, or one on its way. */
export type VerdictReply = Verdict | Promise<Verdict>;

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

/** The server's mark on a stored row, or the package's where it carries none. */
export function verdictOf(
  stored: { correct?: boolean | null } | null | undefined,
  packageMark: () => boolean,
): Verdict {
  if (!stored || stored.correct === undefined) return packageMark();
  return stored.correct;
}
