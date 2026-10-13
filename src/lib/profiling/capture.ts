import type { BaselineRunContext, BaselineTrial } from "@/lib/api/baseline";
import { contractAgeBand, type BaselineDimension } from "./bands";

/**
 * Micro-behavioural capture for baseline profiling (SCRUM-104 frontend
 * contract): every interaction is stamped with `performance.now()`, raw streams
 * are held ephemerally (IndexedDB, in-memory fallback), turned into one trial
 * per answer on completion (`baselineTrials`), sent to `/api/baseline/trials`
 * for the server to reduce (B9), and the raw stream is purged. The device
 * computes no mean, accuracy or span. What a trial has no field for - tap
 * coordinates above all - never leaves the device, and goes with the purge.
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

  /** Purge the raw stream everywhere (once its trials have been taken). */
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
 * NOTE: these stay on the device. `BaselineTrial` has no field for a point,
 * and backend ruled on 1 Oct that raw touch stays on the device (B14): a tap's
 * coordinates are a finer record of a child than anything the server keeps.
 * `baselineTrials` reads none of them, and the capture is purged once its
 * trials are taken.
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
 * The condition a trial was run under, where the activity has one.
 *
 * The flanker notes whether a trial was congruent, the reading act whether it
 * was read or heard, the pattern act whether the pair matched, the dot act how
 * close the two counts were. An interference measure without its congruent/incongruent split is not an
 * interference measure, so each trial carries its own.
 */
function conditionOf(p: CaptureEvent): string | null {
  const x = p.payload ?? {};
  if (typeof x.congruency === "string") return x.congruency;
  if (typeof x.pair === "string") return x.pair;
  if (typeof x.ratio === "number") return `ratio_${x.ratio}`;
  if (typeof x.mode === "string") return x.mode;
  return null;
}

/**
 * Which dimension an activity measures, by the `act` its picks record.
 *
 * The onboarding modules name their activities (Module 2's pattern match is
 * processing speed and its flanker attention, Module 3's reading is reading
 * and its dots number sense). The warm-up records `act` as the dimension
 * itself, the six names the recalibrate prompt uses, so those map to
 * themselves. Module 4's probe is not presented (SCRUM-175/176): its bank
 * lived on the device, and nothing can serve one to the onboarding run.
 */
const DIMENSION_OF_ACT: Record<string, BaselineDimension> = {
  pattern: "ps",
  flanker: "attention",
  reading: "reading",
  dots: "ans",
  wmc: "wmc",
  ps: "ps",
  ans: "ans",
  attention: "attention",
  domain: "domain",
};

/**
 * The contract's id shape for `probeItemId`; anything else would 422 the run.
 * A served item is a probe-bank UUID (B79); a device day's `device:*` id is
 * not one, and goes as null.
 */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A response time as the contract takes it: whole milliseconds, 0 to 600000.
 *
 * Outside that range is not a time anyone could have measured on this screen
 * (a tablet left on the task overnight), and sending it would refuse the whole
 * run with a 422. It goes as null - "not timed" - rather than clamped, which
 * would be a number nobody measured.
 */
function ms(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const whole = Math.round(value);
  return whole >= 0 && whole <= 600_000 ? whole : null;
}

const text = (value: unknown): string | null =>
  value === undefined || value === null ? null : String(value).slice(0, 200);

/**
 * The run as `POST /api/baseline/trials` takes it: one `BaselineTrial` per
 * thing the child answered, in the order they answered it (B9, 5 Oct).
 *
 * NOTHING IS REDUCED HERE. This replaced three reducers that sent a mean
 * response time, an accuracy rate and a maximum span per activity. Frontend §3:
 * "You compute nothing. Not a span score, not a reaction time median ... not
 * an accuracy rate." The server does that arithmetic now, and it is the only
 * place a congruency or dot-ratio split can be trusted. Every number below is
 * one reading: a single interval between two `performance.now()` stamps.
 *
 * What each trial is:
 *
 *  - A PICK (`trial_pick`, Modules 2-3 and the warm-up): its dimension, its
 *    condition, the choice, `correct` where the activity held the stimulus
 *    (the device drew the dots, the server never saw them), and `rtMs` as
 *    the trial runner measured it. A served question names its item in
 *    `probeItemId` and sends the option's value; the server marks it and
 *    ignores whatever `correct` says.
 *  - "NOT SURE" is a decline, never a wrong answer: `response: "not_sure"` and
 *    `correct: null`, so it can never enter an accuracy as a miss.
 *  - A TILE RECALL (working memory): ONE trial per completed recall, not one
 *    per tap (B80, 8 Oct). `condition` is the sequence length, `response` the
 *    cells tapped, in the order tapped, and `correct` as the module recorded
 *    it: a recall ends at a wrong tap (false) or at `round_complete` (true).
 *    Its time runs from the grid being handed over (`input_start`) to the
 *    tap that ended it - never across a round, which once swallowed the
 *    between-round beat and the whole next playback into a "gap". A recall
 *    still open when the stream ends was never completed, and sends nothing.
 *  - A DUAL-TASK CHECK (`check_answer`, SS): `condition: "dual_check"`, timed
 *    from the check appearing.
 *  - A MOTOR SAMPLE (`motor_tap`, the motor-speed step, PR #645): every tap as
 *    taken, its latency as the step measured it, practice taps marked as
 *    such. The median is the server's to take. This is where the step's
 *    samples leave, rather than in a feature of their own.
 *  - A MOTOR TARGET LEFT UNTAPPED (`motor_end` with reason `idle`): the step
 *    ended itself after ten seconds on a painted target. That target is the
 *    one trial the capture records as put in front of the child and not
 *    answered, so it goes as `skipped` (B76, 8 Oct), with no response and no
 *    time. Nothing else is marked skipped: a "Not sure" is an answer, and an
 *    activity the device could not present was never in front of anyone.
 *
 * Not carried, because `BaselineTrial` has no field for them: coordinates
 * (B14, above) and the intervals between the taps inside a recall.
 * The run's band and device go beside the trials, not on them
 * (`baselineRunContext`).
 */
export function baselineTrials(capture: BaselineCapture): BaselineTrial[] {
  const trials: BaselineTrial[] = [];
  /**
   * The recall in progress: when the grid was handed over (null if nothing
   * said), its length, the cells tapped so far and when the last one landed.
   */
  let recall: {
    openedAt: number | null;
    length: number | null;
    cells: string[];
    lastAt: number;
  } | null = null;
  /** One trial for the recall in progress, which `correct` has just ended. */
  const endRecall = (correct: boolean) => {
    if (!recall || recall.cells.length === 0) return;
    trials.push({
      dimension: "wmc",
      condition: recall.length === null ? null : `length_${recall.length}`,
      response: text(recall.cells.join(",")),
      correct,
      responseTimeMs:
        recall.openedAt === null ? null : ms(recall.lastAt - recall.openedAt),
      probeItemId: null,
    });
  };
  let checkShownAt: number | null = null;

  for (const e of capture.stream) {
    const p = e.payload ?? {};
    switch (e.kind) {
      case "input_start":
        recall = {
          openedAt: e.t,
          length: typeof p.length === "number" ? p.length : null,
          cells: [],
          lastAt: e.t,
        };
        break;
      case "round_complete":
        // Every tap of it was right: the module records this at the last.
        endRecall(true);
        recall = null;
        break;
      case "check_shown":
        checkShownAt = e.t;
        break;
      case "check_answer":
        trials.push({
          dimension: "wmc",
          condition: "dual_check",
          response: typeof p.answer === "boolean" ? String(p.answer) : null,
          correct: typeof p.correct === "boolean" ? p.correct : null,
          responseTimeMs:
            checkShownAt === null ? null : ms(e.t - checkShownAt),
          probeItemId: null,
        });
        checkShownAt = null;
        break;
      case "tap": {
        recall ??= { openedAt: null, length: null, cells: [], lastAt: e.t };
        recall.length ??= typeof p.length === "number" ? p.length : null;
        recall.cells.push(String(p.cell));
        recall.lastAt = e.t;
        // A wrong tap ends the recall: the pattern plays again from the top,
        // and the grid is handed over afresh.
        if (p.correct === false) {
          endRecall(false);
          recall = null;
        }
        break;
      }
      case "trial_pick": {
        const act = String(p.act);
        const declined = p.notSure === true;
        trials.push({
          dimension: DIMENSION_OF_ACT[act] ?? act.slice(0, 60),
          condition: conditionOf(e),
          response: declined
            ? "not_sure"
            : text(
                typeof p.chosenOption === "string" ? p.chosenOption : p.choice,
              ),
          correct:
            !declined && typeof p.correct === "boolean" ? p.correct : null,
          responseTimeMs: ms(p.rtMs),
          probeItemId:
            typeof p.itemId === "string" && UUID.test(p.itemId)
              ? p.itemId
              : null,
        });
        break;
      }
      case "motor_tap":
        trials.push({
          dimension: "motor_speed",
          condition: p.practice === true ? "practice" : null,
          response: text(p.cell ?? p.target),
          correct: null,
          responseTimeMs: ms(p.latencyMs),
          probeItemId: null,
        });
        break;
      case "motor_end":
        if (p.reason !== "idle") break;
        trials.push({
          dimension: "motor_speed",
          condition: p.practice === true ? "practice" : null,
          response: null,
          correct: null,
          responseTimeMs: null,
          probeItemId: null,
          skipped: true,
        });
        break;
    }
  }
  return trials;
}

/** `formFactor()`'s three, as the trials request names them: touch or cursor. */
const CONTRACT_FORM_FACTOR: Record<
  string,
  NonNullable<BaselineRunContext["formFactor"]>
> = {
  mobile: "mobile_touch",
  tablet: "tablet_touch",
  desktop: "desktop_cursor",
};

/**
 * What the run was built for and sat on, for `BaselineTrialsRequest` beside
 * its trials (B76, 8 Oct). Read from the capture, so it says only what the
 * run recorded:
 *
 *  - `ageBand`: the band on `run_start` (onboarding) or `warmup_start`. The
 *    warm-up records one only when the roster gave it; with none it runs the
 *    frame's Primary 4-6 version as a default, and that default is not sent
 *    as the child's age band.
 *  - `formFactor`: the device `formFactor()` read when the run started. Its
 *    "desktop" is a pointer that is not coarse, so it is the contract's
 *    cursor, and the other two are touch.
 *  - `motorStepSkipped`: true where `motor_skipped` was recorded (a cursor
 *    device, 08a), false where the step ran to its end. A run with neither,
 *    which is the warm-up, has no motor step and leaves the key out.
 */
export function baselineRunContext(
  capture: BaselineCapture,
): BaselineRunContext {
  const start = (
    capture.ofKind("run_start").at(-1) ?? capture.ofKind("warmup_start").at(-1)
  )?.payload;
  const ageBand = contractAgeBand(start?.band);
  const formFactor =
    typeof start?.formFactor === "string"
      ? CONTRACT_FORM_FACTOR[start.formFactor]
      : undefined;
  const skippedStep = capture.ofKind("motor_skipped").length > 0;
  const ranStep = capture.ofKind("motor_end").length > 0;
  return {
    ...(ageBand ? { ageBand } : {}),
    ...(formFactor ? { formFactor } : {}),
    ...(skippedStep || ranStep ? { motorStepSkipped: skippedStep } : {}),
  };
}
