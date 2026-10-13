const STORAGE_KEY = "nevo.warmup.done";

/**
 * Whether this child has already done today's warm-up on this device.
 *
 * **THE WARM-UP WAS RE-SITTABLE ANY NUMBER OF TIMES A DAY**, and the cost was
 * not a cosmetic one: every run reduces to a feature vector and submits it, so
 * a child who opened it four times sent four measurements of the same
 * dimension on the same day. The engine recalibrates on those. Design ruled
 * the done state on 23 Sep - *"yes, one exists, and it says nothing about
 * performance. It closes and moves the child into the day's lesson"* - and the
 * screen already had one; what it did not have was a memory that it happened.
 *
 * ## The account can say "done"; only this device can't say "not done"
 *
 * **The wire says it as of 1 Oct (B10).** `BaselinePromptResponse` carries
 * `doneToday`, held against the account, so a second tablet sees a warm-up
 * done on the first - which this memory, being one device's, never could.
 * See `warmUpDoneFor`: done when the account says so OR this device saw it
 * finish today. The memory also covers the wait - the prompt still on its way
 * (so Home's card does not offer a warm-up for a moment and then take it
 * back), a read that failed, or a deployment without the field.
 *
 * ## Why it is keyed per CHILD
 *
 * A classroom tablet remembers up to six of them. A flag on the device alone
 * would tell the second child of the morning that they had already done a
 * warm-up they have never seen.
 *
 * ## What it is NOT
 *
 * Not a claim about a child, not a measurement, and never sent anywhere. It is
 * a note that an activity happened, in the same family as the device roster
 * and the remembered rotate-prompt escape. Nothing here reaches the engine,
 * and nothing here is a fact about how the child did - which is the line the
 * done state itself is careful about too.
 */

/** Local calendar day, which is the day a child means by "today". */
function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

type DoneMap = Record<string, string>;

function read(): DoneMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as DoneMap) : {};
  } catch {
    // Private mode, blocked storage, corrupt value. The warm-up simply offers
    // itself again, which is the behaviour this whole module improves on -
    // never a child locked out of one.
    return {};
  }
}

/** Whether `userId` has already completed today's warm-up on this device. */
export function warmUpDoneToday(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined") return false;
  return read()[userId] === today();
}

/**
 * Whether today's warm-up is behind this child: done when the account says
 * so, or when THIS device saw them finish it today.
 *
 * EITHER, NOT "THE ACCOUNT WINS". The account's "done" is what fixes the
 * second tablet (B10). But its "not done" cannot overrule a run this tablet
 * watched finish: on five days of six the warm-up runs a device task and
 * answers no served question, and whether that submit sets `doneToday` is
 * unconfirmed (asked of backend, 1 Oct). Trusting the account's "no" would
 * offer the same child a second run - and a second measurement - on the very
 * tablet they finished on, which is the bug this module exists to stop.
 */
export function warmUpDoneFor(
  doneToday: boolean | undefined,
  userId: string | null | undefined,
): boolean {
  return doneToday === true || warmUpDoneToday(userId);
}

/**
 * Remember that they have.
 *
 * Writes only this child's entry and keeps the others, because the tablet is
 * shared. Old days are pruned on the way past: a stale date is the same as no
 * entry, and a roster of six children would otherwise accumulate for ever.
 */
export function markWarmUpDone(userId: string | null | undefined): void {
  if (!userId || typeof window === "undefined") return;
  try {
    const now = today();
    const kept: DoneMap = {};
    for (const [id, day] of Object.entries(read())) {
      if (day === now) kept[id] = day;
    }
    kept[userId] = now;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // The run still counted and was still submitted; it just is not
    // remembered, so the warm-up offers itself again. That is the old
    // behaviour, which is a worse day rather than a broken one.
  }
}
