import { baselineApi, type BaselineTrial } from "@/lib/api/baseline";
import { consentsApi, processingWithdrawn } from "@/lib/api/consents";
import { getSession } from "@/lib/auth/session";

/**
 * The baseline a child has already sat, waiting for the account it belongs to.
 *
 * The baseline's write is Bearer (`POST /api/baseline/trials` since B9; it was
 * `/submit`). The profiling run is phase 0 of the onboarding sequence and the
 * account is not created until phase 2, so the submit used to go out with NO
 * TOKEN, 401, and be given up on at once - a 4xx is deliberately not retried -
 * while `.finally()`
 * purged the raw capture and a `submitted` ref blocked any second attempt.
 * Several minutes of a SEND learner's attention, in the run that happens once,
 * silently destroyed. Only SSO children were spared, because their session is
 * stored before they reach the sequence.
 *
 * WORSE ON A SHARED TABLET. `/student/onboarding` is a pre-auth route and the
 * guard lets a signed-in child straight through, so where the last child did
 * not sign out their token was still in localStorage. The submit then
 * SUCCEEDED - and wrote this child's cognitive assessment to the previous
 * child's account, under a screen reading "All set. Nevo is ready for you."
 *
 * So the run no longer submits. It parks its trials here, and they are sent
 * once an account exists AND that account is provably this child's ("the
 * baseline before a session - park it on the device and send it once the PIN
 * step creates the session", backend, B64).
 *
 * WHAT IS PARKED IS THE TRIALS, NOT A REDUCED VECTOR (B9, 5 Oct). The device
 * used to reduce the run to means, accuracies and spans and hold those. It
 * now holds one `BaselineTrial` per answer and the server reduces them. The
 * rest of the raw capture - coordinates above all - still never leaves the
 * device and is still purged as soon as the trials are taken.
 */

const KEY = "nevo.baseline.pending";

/**
 * How long a parked baseline is worth sending. A child who abandons onboarding
 * and returns weeks later is not the same measurement.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface PendingBaseline {
  sessionId: string;
  trials: BaselineTrial[];
  capturedAt: number;
  /**
   * WHOSE MEASUREMENTS THESE ARE, when that is knowable at the moment they are
   * parked.
   *
   * The warm-up is sat by a child who is already signed in, so their id is
   * recorded and nothing else may ever send these trials. The onboarding run is
   * phase 0, before any account exists, so there is no id to record: `null`
   * means "belongs to the account the run that captured it goes on to create",
   * and `sessionId` is what ties it to that run.
   */
  ownerUserId: string | null;
}

export function holdBaseline(
  sessionId: string,
  trials: BaselineTrial[],
  ownerUserId: string | null = null,
): void {
  // Nothing answered is nothing to send; the contract takes one trial or more.
  if (trials.length === 0) return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        sessionId,
        trials,
        capturedAt: Date.now(),
        ownerUserId,
      }),
    );
  } catch {
    // Private mode, or storage full. Nothing else to do: the run is over and
    // the child is moving on. Losing it here is the old behaviour, not a
    // regression - and it is now the only way to lose it.
  }
}

export function readPendingBaseline(): PendingBaseline | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PendingBaseline>;
    if (!v?.sessionId) return null;
    /*
     * A VECTOR PARKED BEFORE B9 IS DROPPED, NOT SENT. It holds what the
     * device reduced - means, accuracies, spans - and `/trials` cannot take
     * it, nor should anything: a measure of a child decided on the child's
     * own tablet is what B9 removed. Its trials were never kept, so there is
     * nothing to recover it into.
     */
    if (!Array.isArray(v.trials) || v.trials.length === 0) {
      clearPendingBaseline();
      return null;
    }
    if (typeof v.capturedAt !== "number") return null;
    if (Date.now() - v.capturedAt > MAX_AGE_MS) {
      clearPendingBaseline();
      return null;
    }
    // A record written before `ownerUserId` existed reads as an onboarding
    // run's, which is the safe reading: it then has to prove its run.
    return { ...(v as PendingBaseline), ownerUserId: v.ownerUserId ?? null };
  } catch {
    return null;
  }
}

export function clearPendingBaseline(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Send a parked baseline, but only to the child who sat it.
 *
 * `expectedUserId` is the id the account-creation call just returned, and the
 * stored session must match it.
 *
 * THAT CHECK ALONE USED TO BE THE WHOLE GUARD, and it stopped proving anything
 * the moment `acceptJoin` began storing a session (16 Sep). It was only ever
 * safe by accident: an invite-link child had no token, so a vector could not
 * be sent at all, and a token left behind by the previous child did not match
 * the new account. Give the new account a session of its own - which is the
 * fix this guard shipped beside - and `session.userId === expectedUserId`
 * becomes true by construction, for ANY parked vector, including one the
 * previous child left behind when their warm-up submit failed.
 *
 * So the parked run now has to prove whose it is, and there are two cases:
 *
 *  - Parked by a signed-in child (the daily warm-up): `ownerUserId` is their
 *    id and only that child may send it.
 *  - Parked before an account existed (the onboarding run): there is no id to
 *    check, so the caller passes the `sessionId` of the run it just completed
 *    and the trials must be that run's. An earlier run's leftovers are refused.
 *
 * A caller that passes no `runSessionId` can therefore only ever flush an
 * owned run, never an anonymous one. That is the conservative direction.
 *
 * Left parked on failure too. A submit that did not land is not a reason to
 * throw away the only copy - that was the original defect.
 */
export async function flushPendingBaseline(
  expectedUserId: string | null | undefined,
  runSessionId?: string | null,
): Promise<boolean> {
  const pending = readPendingBaseline();
  if (!pending) return false;

  const session = getSession();
  if (!session?.token || !expectedUserId || session.userId !== expectedUserId) {
    return false;
  }

  const ownedByThisChild =
    pending.ownerUserId != null && pending.ownerUserId === expectedUserId;
  const parkedByThisRun =
    pending.ownerUserId == null &&
    Boolean(runSessionId) &&
    pending.sessionId === runSessionId;
  if (!ownedByThisChild && !parkedByThisRun) return false;

  /*
   * A WITHDRAWN GUARDIAN STOPS THIS, and this is the last place it can be
   * stopped.
   *
   * Withdrawal is the one consent answer the frontend is entitled to act on,
   * and until now nothing in the baseline path asked: the run measured, the
   * vector parked, and the flush sent it. `LearningNotice` said so in a
   * comment - "NOT HANDLED HERE: withdrawal" - and no other caller picked it
   * up. The capture surfaces now gate themselves, but a vector parked BEFORE
   * a withdrawal would still be sitting here afterwards, so the send has to
   * ask too.
   *
   * REFUSED AND DISCARDED, not refused and kept. Keeping it would leave a
   * child's cognitive measurements on the device after the moment we were
   * told to stop processing them, which is the thing withdrawal asks us not
   * to do.
   *
   * A FAILED READ IS NOT A WITHDRAWAL. Same ruling as `useConsentGate`: a bad
   * minute at the backend or a child on 3G must not silently stop delivering
   * measurements for a guardian who did consent. Only an answer that says
   * withdrawn stops anything.
   */
  if (await processingWithdrawnNow()) {
    clearPendingBaseline();
    return false;
  }

  const ok = await baselineApi.submitTrials(pending.sessionId, pending.trials);
  if (ok) clearPendingBaseline();
  return ok;
}

async function processingWithdrawnNow(): Promise<boolean> {
  try {
    return processingWithdrawn(await consentsApi.myConsentGate());
  } catch {
    return false;
  }
}
