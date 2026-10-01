/**
 * Micro-behavioural capture for baseline profiling (SCRUM-104 frontend
 * contract): every interaction is stamped with `performance.now()`, raw streams
 * are held ephemerally (IndexedDB, in-memory fallback), reduced to a feature
 * vector on completion, submitted to `/api/baseline/submit`, and the raw data
 * is purged after transmission. Raw streams never leave the device.
 */

export interface CaptureEvent {
  /** e.g. "playback_start", "tap", "check_answer", "module_end". */
  kind: string;
  /** `performance.now()` at the moment of interaction. */
  t: number;
  payload?: Record<string, unknown>;
}

const DB_NAME = "nevo-baseline";
const STORE = "streams";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE))
        req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

/**
 * One capture session spans the whole profiling run. `record` is synchronous
 * (an in-memory push); IndexedDB persistence is batched in the background so
 * timing capture never waits on storage.
 */
export class BaselineCapture {
  private events: CaptureEvent[] = [];
  private db: Promise<IDBDatabase | null> | null = null;
  /** Set by `stop()`; nothing is recorded or written after it. */
  private stopped = false;
  readonly sessionId: string;

  /** Construction is pure (safe in a state initializer); the DB opens lazily. */
  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  private ensureDb() {
    this.db ??= openDb();
    return this.db;
  }

  record(kind: string, payload?: Record<string, unknown>) {
    if (this.stopped) return;
    this.events.push({ kind, t: performance.now(), payload });
  }

  /**
   * Purge, and record nothing more for the rest of this run.
   *
   * WHAT A WITHDRAWN GUARDIAN NEEDS, which `purge()` alone was not. The flows
   * purged once when the withdrawal arrived and carried on: every module after
   * it recorded again, and each module's end wrote the new stream back to
   * IndexedDB, where it sat on a shared tablet until some later run's sweep.
   * The child keeps playing - what they should SEE is design's question - but
   * from this call on, nothing they do is kept, in memory or on disk.
   */
  async stop() {
    this.stopped = true;
    await this.purge();
  }

  /** Snapshot the raw stream into IndexedDB (ephemeral, purged on submit). */
  async persist() {
    if (this.stopped) return;
    const db = await this.ensureDb();
    // A stop can land while the database is opening. Writing after it would
    // put back the key `stop()` has just deleted.
    if (!db || this.stopped) return;
    try {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.put(this.events, this.sessionId);
      /*
       * SWEEP EVERY OTHER RUN'S RECORD WHILE WE ARE HERE.
       *
       * `purge()` deletes only its OWN session, and it is called when a run
       * finishes. A run that was ABANDONED - a child who closed the tab part
       * way through profiling, or whose tablet was taken - never reaches it, so
       * its raw behavioural stream stayed in IndexedDB indefinitely.
       *
       * That is not a tidiness problem. The docblock at the top of this file
       * promises raw streams are held EPHEMERALLY and purged after
       * transmission, and an orphaned record is a child's raw interaction data
       * living on a shared classroom tablet with nothing left that knows it is
       * there or would ever remove it.
       *
       * Only one run is ever in flight, so anything under another key belongs
       * to a run that ended - completed and purged, or abandoned. Sweeping on
       * write keeps the promise self-maintaining rather than depending on a
       * cleanup call some future path forgets to make.
       */
      const keys = store.getAllKeys();
      keys.onsuccess = () => {
        for (const key of keys.result) {
          if (key !== this.sessionId) store.delete(key);
        }
      };
    } catch {
      // Storage is best-effort; the in-memory stream remains authoritative.
    }
  }

  /** Purge the raw stream everywhere (after the feature vector is submitted). */
  async purge() {
    this.events = [];
    const db = await this.ensureDb();
    if (!db) return;
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(this.sessionId);
    } catch {
      // Best-effort.
    }
  }

  /** All events of a kind, in order. */
  ofKind(kind: string): CaptureEvent[] {
    return this.events.filter((e) => e.kind === kind);
  }

  get stream(): readonly CaptureEvent[] {
    return this.events;
  }
}

/**
 * Where a tap landed, for the raw stream: viewport x and y, unrounded.
 *
 * Frontend §3 lists tap coordinates among what onboarding captures, and §2 says
 * why precision matters - tap scatter is part of how the engine reads
 * frustration and anxiety, and rounded coordinates are noise it cannot undo.
 * Every baseline tap recorded a cell or a choice index and nothing about where
 * the finger was.
 *
 * A keyboard activation is a click with no pointer (`detail` 0, and 0,0 for
 * the position), so it records no point rather than a false one at the corner.
 *
 * NOTE: the raw stream still never leaves the device - only the reduced vector
 * does, and no reducer reads these. They are here so the stream is complete
 * when it does travel (the server-side reduction, SCRUM-175).
 */
export function tapPoint(e?: {
  clientX: number;
  clientY: number;
  detail: number;
}): { x: number; y: number } | Record<string, never> {
  if (!e || e.detail === 0) return {};
  return { x: e.clientX, y: e.clientY };
}

/**
 * Reduce the Module 1 stream to its feature-vector slice. Raw taps stay on
 * device; only these aggregates are transmitted.
 * TODO(api): reconcile field names with the ratified baseline contract.
 */
/**
 * Reduce a trial-based module's stream (Modules 2-4): counts, mean response
 * time and - where the activity knows its own answer - accuracy, from
 * `trial_pick` events carrying `{module, act, rtMs, correct?}`.
 *
 * Accuracy was absent entirely: the vector carried how FAST a child answered
 * and never whether they were right. `accuracy` is null rather than 0 where
 * nothing was scored, so "not measured" and "got none right" stay
 * distinguishable - the domain probe is deliberately the former, being a
 * prior-knowledge sweep with no key.
 *
 * `scored` travels with it because the reading and probe activities offer "Not
 * sure", which is an honest non-answer and is deliberately NOT marked wrong.
 * Excluding it silently would let a child who answered one of three and
 * shrugged at the rest arrive as 100%. The engine needs the denominator to
 * tell that from three out of three, so it is sent rather than inferred.
 */
interface TrialStats {
  trials: number;
  /** Trials that carried an answer key - the accuracy denominator. */
  scored: number;
  /** Declined rather than answered; never counted wrong. */
  notSure: number;
  meanRtMs: number | null;
  accuracy: number | null;
}

function statsOf(picks: CaptureEvent[]): TrialStats {
  const rts = picks
    .map((p) => Number(p.payload?.rtMs))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 60_000);
  const scored = picks.filter((p) => typeof p.payload?.correct === "boolean");
  return {
    trials: picks.length,
    scored: scored.length,
    notSure: picks.filter((p) => p.payload?.notSure === true).length,
    meanRtMs: rts.length
      ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length)
      : null,
    // Null means the activity carries no answer key, not zero right.
    accuracy: scored.length
      ? scored.filter((p) => p.payload?.correct === true).length /
        scored.length
      : null,
  };
}

/**
 * The condition a trial was run under, where the activity has one.
 *
 * THESE WERE RECORDED AND THEN THROWN AWAY. The flanker notes whether a trial
 * was congruent, the reading act whether it was read or heard, the pattern act
 * whether the pair matched, the dot act how close the two counts were, the
 * probe which subject it asked about - and the reducer averaged all of it
 * together per act. An interference measure without its congruent/incongruent
 * split is not an interference measure. Kept as a breakdown; the act totals
 * are unchanged.
 */
function conditionOf(p: CaptureEvent): string | null {
  const x = p.payload ?? {};
  if (typeof x.congruency === "string") return x.congruency;
  if (typeof x.pair === "string") return x.pair;
  if (typeof x.ratio === "number") return `ratio_${x.ratio}`;
  if (typeof x.mode === "string") return x.mode;
  if (typeof x.subject === "string") return x.subject;
  return null;
}

export function reduceTrialModule(capture: BaselineCapture, module: string) {
  const picks = capture
    .ofKind("trial_pick")
    .filter((e) => e.payload?.module === module);
  const byAct: Record<
    string,
    TrialStats & { conditions?: Record<string, TrialStats> }
  > = {};
  for (const act of new Set(picks.map((p) => String(p.payload?.act)))) {
    const inAct = picks.filter((p) => p.payload?.act === act);
    const conditions: Record<string, TrialStats> = {};
    for (const key of new Set(inAct.map(conditionOf))) {
      if (key === null) continue;
      conditions[key] = statsOf(inAct.filter((p) => conditionOf(p) === key));
    }
    byAct[act] = {
      ...statsOf(inAct),
      ...(Object.keys(conditions).length ? { conditions } : {}),
    };
  }
  return { module, acts: byAct };
}

/**
 * What the run was calibrated to, which the engine could not otherwise know.
 *
 * The age band travelled only on `baseline_module_start` - a client-only event
 * the signal filter drops - and the subject the child chose for the probe
 * travelled nowhere. So the engine received a child's timings and accuracies
 * with no idea which band's items produced them. Sent as its own feature, and
 * as the band and subject only: nothing about the child that the run did not
 * already use.
 */
export function reduceRunContext(capture: BaselineCapture) {
  const start = capture.ofKind("run_start").at(-1);
  const probe = capture.ofKind("probe_subject").at(-1);
  const band = start?.payload?.band;
  const subject = probe?.payload?.subject;
  return {
    module: "run",
    band: typeof band === "string" ? band : null,
    probeSubject: typeof subject === "string" ? subject : null,
  };
}

export function reduceGridSpan(capture: BaselineCapture) {
  const taps = capture.ofKind("tap");
  const correct = taps.filter((t) => t.payload?.correct === true);

  /*
   * ONLY GAPS WITHIN ONE RECALL.
   *
   * This paired every correct tap with the one before it, across round
   * boundaries included - so the "gap" between the last tap of one round and
   * the first of the next swallowed the between-round beat, the playback lead
   * and the whole next sequence lighting up. Several seconds, against a real
   * within-round gap of a few hundred milliseconds, and the 30s ceiling waved
   * it through. Over a typical four-round run that is three such gaps inflating
   * a mean of eighteen.
   *
   * `posInSeq` counts up within a recall and resets to 0 on the next, so a pair
   * is genuine exactly when it advanced by one.
   */
  const gaps: number[] = [];
  for (let i = 1; i < correct.length; i++) {
    const pos = Number(correct[i].payload?.posInSeq);
    const prev = Number(correct[i - 1].payload?.posInSeq);
    if (pos !== prev + 1) continue;
    const gap = correct[i].t - correct[i - 1].t;
    if (gap > 0 && gap < 30_000) gaps.push(gap);
  }

  const spans = capture
    .ofKind("round_complete")
    .map((e) => Number(e.payload?.length ?? 0));

  /*
   * The SS band's dual task, which reached the vector in no form at all - this
   * function did not read `check_answer`, and the event carried no `correct` to
   * read. A child who taps True at every check is not carrying the load the
   * dual task exists to impose, and was indistinguishable from one who was.
   * Null for every other band, which runs no checks.
   */
  const checks = capture.ofKind("check_answer");
  const checksRight = checks.filter((e) => e.payload?.correct === true).length;

  return {
    module: "grid_span",
    maxSpan: spans.length ? Math.max(...spans) : 0,
    roundsCompleted: spans.length,
    retries: taps.filter((t) => t.payload?.correct === false).length,
    meanRecallGapMs: gaps.length
      ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
      : null,
    dualChecks: checks.length,
    dualAccuracy: checks.length ? checksRight / checks.length : null,
  };
}
