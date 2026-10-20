import {
  baselineApi,
  type BaselineRunContext,
  type BaselineTrial,
} from "@/lib/api/baseline";
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

/**
 * ONE PARKED RUN PER OWNER, AND AN OWNERLESS RUN UNDER ITS OWN RUN ID (19 Oct
 * browser-storage audit).
 *
 * There was one slot for the whole device. A run parked there replaced
 * whatever was waiting: a new child's finished pre-account run overwrote the
 * last child's parked warm-up, and that child's trials were simply gone. Each
 * owner has their own now, and a run with no owner yet - the onboarding run,
 * before its account exists - is parked under its own run id, so no child's
 * parked run ever replaces another's. Who may send each is unchanged: its
 * owner, or the run that parked it, proving it with that id.
 */
const PREFIX = "nevo.baseline.pending.";
/** The single slot before 19 Oct, moved onto its shelf the first time it is read. */
const LEGACY_KEY = "nevo.baseline.pending";
const ownerKey = (userId: string) => `${PREFIX}${userId}`;
const runKey = (sessionId: string) => `${PREFIX}run.${sessionId}`;
const keyFor = (p: Pick<PendingBaseline, "ownerUserId" | "sessionId">) =>
  p.ownerUserId ? ownerKey(p.ownerUserId) : runKey(p.sessionId);

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
  /**
   * The run's band, device and motor-step skip (B76, 8 Oct), parked with the
   * trials so they leave together. A record parked before then has none, and
   * goes without: not told, rather than guessed at delivery.
   */
  context: BaselineRunContext;
}

function write(pending: PendingBaseline): void {
  try {
    window.localStorage.setItem(keyFor(pending), JSON.stringify(pending));
  } catch {
    // Private mode, or storage full. Nothing else to do: the run is over and
    // the child is moving on. Losing it here is the old behaviour, not a
    // regression - and it is now the only way to lose it.
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * A stored value as a parked run, or null when it is not one that may still
 * be sent: unreadable, a pre-B9 vector, or older than a week.
 */
function parse(raw: string | null): PendingBaseline | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PendingBaseline>;
    if (!v?.sessionId) return null;
    /*
     * A VECTOR PARKED BEFORE B9 IS DROPPED, NOT SENT. It holds what the
     * device reduced - means, accuracies, spans - and `/trials` cannot take
     * it, nor should anything: a measure of a child decided on the child's
     * own tablet is what B9 removed. Its trials were never kept, so there is
     * nothing to recover it into.
     */
    if (!Array.isArray(v.trials) || v.trials.length === 0) return null;
    if (typeof v.capturedAt !== "number") return null;
    if (Date.now() - v.capturedAt > MAX_AGE_MS) return null;
    // A record written before `ownerUserId` existed reads as an onboarding
    // run's, which is the safe reading: it then has to prove its run.
    return {
      ...(v as PendingBaseline),
      ownerUserId: v.ownerUserId ?? null,
      context: v.context && typeof v.context === "object" ? v.context : {},
    };
  } catch {
    return null;
  }
}

/** The old single slot, onto its owner's shelf or its run's - once. */
function migrateLegacy(): void {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (raw === null) return;
    window.localStorage.removeItem(LEGACY_KEY);
    const pending = parse(raw);
    // Nothing newer on that shelf is replaced by an older slot.
    if (pending && !window.localStorage.getItem(keyFor(pending))) {
      write(pending);
    }
  } catch {
    // Unreadable storage holds nothing to move.
  }
}

/**
 * Every run parked on this device that may still be sent. What may not - a
 * week old, a pre-B9 vector, unreadable - is deleted as it is found.
 */
function allParked(): { key: string; pending: PendingBaseline }[] {
  if (typeof window === "undefined") return [];
  migrateLegacy();
  const found: { key: string; pending: PendingBaseline }[] = [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    for (const key of keys) {
      const pending = parse(window.localStorage.getItem(key));
      if (pending) found.push({ key, pending });
      else remove(key);
    }
  } catch {
    // Unreadable storage: nothing parked that can be read.
  }
  return found;
}

export function holdBaseline(
  sessionId: string,
  trials: BaselineTrial[],
  ownerUserId: string | null = null,
  context: BaselineRunContext = {},
): void {
  // Nothing answered is nothing to send; the contract takes one trial or more.
  if (trials.length === 0) return;
  write({ sessionId, trials, capturedAt: Date.now(), ownerUserId, context });
}

/** Which parked run: an owner's, a run's, or - with neither - the newest. */
export interface ParkedRun {
  owner?: string | null;
  run?: string;
}

const matches = (p: PendingBaseline, which: ParkedRun) =>
  (which.owner === undefined || p.ownerUserId === which.owner) &&
  (which.run === undefined || p.sessionId === which.run);

export function readPendingBaseline(
  which: ParkedRun = {},
): PendingBaseline | null {
  return (
    allParked()
      .map(({ pending }) => pending)
      .filter((p) => matches(p, which))
      .sort((a, b) => b.capturedAt - a.capturedAt)[0] ?? null
  );
}

/** Forget the parked runs `which` names - every one, when it names none. */
export function clearPendingBaseline(which: ParkedRun = {}): void {
  if (which.owner === undefined && which.run === undefined) remove(LEGACY_KEY);
  for (const { key, pending } of allParked()) {
    if (matches(pending, which)) remove(key);
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
/** Each owner's flush under way, so the next waits for it (19 Oct). */
const flushing = new Map<string, Promise<boolean>>();

/**
 * ONE FLUSH AT A TIME FOR EACH CHILD (19 Oct browser-storage audit).
 *
 * After a sign-in at the door, two flushes started together - the shell's
 * and the landing screen's - read the same parked run, and both sent it:
 * two consent reads and the same trials twice, under one run id. A flush now
 * waits for any already under way for the same child, and then finds what
 * that one delivered gone.
 */
export function flushPendingBaseline(
  expectedUserId: string | null | undefined,
  runSessionId?: string | null,
): Promise<boolean> {
  if (!expectedUserId) return Promise.resolve(false);
  const before = flushing.get(expectedUserId) ?? Promise.resolve(false);
  const next = () => flushOnce(expectedUserId, runSessionId);
  const run = before.then(next, next);
  flushing.set(expectedUserId, run);
  const done = () => {
    if (flushing.get(expectedUserId) === run) flushing.delete(expectedUserId);
  };
  run.then(done, done);
  return run;
}

async function flushOnce(
  expectedUserId: string,
  runSessionId?: string | null,
): Promise<boolean> {
  const session = getSession();
  if (!session?.token || !expectedUserId || session.userId !== expectedUserId) {
    return false;
  }
  // This child's own, and the ownerless run this caller proves is theirs.
  const mine = allParked().filter(
    ({ pending: p }) =>
      p.ownerUserId === expectedUserId ||
      (p.ownerUserId == null &&
        Boolean(runSessionId) &&
        p.sessionId === runSessionId),
  );
  if (mine.length === 0) return false;

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
    for (const { key } of mine) remove(key);
    return false;
  }

  let all = true;
  for (const found of mine) {
    /*
     * STILL THEIRS, NOW (19 Oct browser-storage audit). The session was
     * checked above, and then this waited on the network: a 401 elsewhere in
     * that time cleared it, and the run went up with no Authorization at all.
     * Asked again before every send, and every retry asks too
     * (`submitTrials`). Not theirs any more: nothing more is sent, and what
     * is parked stays for its owner.
     */
    const now = getSession();
    if (!now?.token || now.userId !== expectedUserId) return false;
    /*
     * AN OWNERLESS RUN BECOMES ITS OWNER'S as its own run proves it (19 Oct),
     * before it is sent: if this send fails, the next flush on any student
     * screen can still deliver it, with no run id to prove anything with.
     */
    let { key, pending } = found;
    if (pending.ownerUserId == null) {
      remove(key);
      pending = { ...pending, ownerUserId: expectedUserId };
      write(pending);
      key = keyFor(pending);
    }
    const ok = await baselineApi.submitTrials(
      pending.sessionId,
      pending.trials,
      pending.context,
    );
    if (!ok) {
      all = false;
      continue;
    }
    // Forget the run that went - not a newer one parked under the same key
    // while it was on its way.
    const stored = parse(window.localStorage.getItem(key));
    if (
      stored?.sessionId === pending.sessionId &&
      stored.capturedAt === pending.capturedAt
    ) {
      remove(key);
    }
  }
  return all;
}

async function processingWithdrawnNow(): Promise<boolean> {
  try {
    return processingWithdrawn(await consentsApi.myConsentGate());
  } catch {
    return false;
  }
}
