import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BaselineCapture,
  reduceGridSpan,
  reduceRunContext,
  reduceTrialModule,
  tapPoint,
} from "./capture";

/**
 * The feature vector is the only thing that leaves the device, so it is the
 * only thing that can be wrong in a way nobody sees.
 *
 * It carried response times and nothing else: a child who tapped True three
 * times in 800ms produced a better-looking reading vector than one who read
 * carefully and got all three right. `correct` now travels with the pick, and
 * these tests are about the two ways summarising it goes wrong - treating "not
 * measured" as zero, and hiding the denominator.
 *
 * `.dom.test.ts` because `BaselineCapture` stamps `performance.now()` and
 * reaches for `indexedDB`; neither belongs in the node project.
 */

const pick = (
  capture: BaselineCapture,
  act: string,
  payload: Record<string, unknown>,
) => capture.record("trial_pick", { module: "sentence_dot", act, ...payload });

const readingOf = (capture: BaselineCapture) =>
  reduceTrialModule(capture, "sentence_dot").acts.reading;

describe("reduceTrialModule", () => {
  it("scores a child who got them all right", () => {
    const c = new BaselineCapture("s1");
    pick(c, "reading", { rtMs: 3000, correct: true });
    pick(c, "reading", { rtMs: 3200, correct: true });

    expect(readingOf(c)).toMatchObject({ trials: 2, scored: 2, accuracy: 1 });
  });

  it("scores a child who guessed fast and got them wrong", () => {
    // The exact shape that used to look BEST: two very quick answers, both
    // wrong. Speed alone reported this as the strongest reader in the cohort.
    const c = new BaselineCapture("s2");
    pick(c, "reading", { rtMs: 400, correct: false });
    pick(c, "reading", { rtMs: 380, correct: false });

    const reading = readingOf(c);
    expect(reading.accuracy).toBe(0);
    expect(reading.meanRtMs).toBe(390);
  });

  it("does not read an absent answer key as zero right", () => {
    // The domain probe is a prior-knowledge sweep with no key at all. Null and
    // 0 mean opposite things to whatever consumes this.
    const c = new BaselineCapture("s3");
    c.record("trial_pick", {
      module: "domain_probe",
      act: "probe",
      rtMs: 2000,
    });

    const probe = reduceTrialModule(c, "domain_probe").acts.probe;
    expect(probe.accuracy).toBeNull();
    expect(probe.scored).toBe(0);
  });

  it("does not let 'Not sure' inflate an accuracy", () => {
    // "Not sure" is offered deliberately and is never marked wrong. But if it
    // simply vanishes, a child who answered one of three and shrugged at the
    // other two arrives as a flawless reader. The denominator is what tells
    // that apart, so it is sent rather than left to be inferred.
    const c = new BaselineCapture("s4");
    pick(c, "reading", { rtMs: 3000, correct: true });
    pick(c, "reading", { rtMs: 2000, notSure: true });
    pick(c, "reading", { rtMs: 2100, notSure: true });

    expect(readingOf(c)).toMatchObject({
      trials: 3,
      scored: 1,
      notSure: 2,
      accuracy: 1,
    });
  });

  it("keeps the two activities of a module apart", () => {
    // Reading and dots share a module and measure different things; averaging
    // them would report a number describing neither.
    const c = new BaselineCapture("s5");
    pick(c, "reading", { rtMs: 3000, correct: true });
    pick(c, "dots", { rtMs: 700, correct: false });

    const acts = reduceTrialModule(c, "sentence_dot").acts;
    expect(acts.reading.accuracy).toBe(1);
    expect(acts.dots.accuracy).toBe(0);
  });
});

/**
 * Grid Span's two quiet errors.
 *
 * `meanRecallGapMs` paired every correct tap with the one before it, across
 * round boundaries included - so the pause between rounds, the playback lead
 * and the whole next sequence lighting up all counted as a child's recall
 * speed. And the SS dual task reached the vector in no form at all: this
 * function never read `check_answer`, and the event carried no `correct` to
 * read.
 */

/** A correct tap at `posInSeq`, stamped at wherever the test clock now stands. */
function tapAt(capture: BaselineCapture, posInSeq: number) {
  capture.record("tap", { cell: posInSeq, correct: true, posInSeq, length: 3 });
}

/*
 * THE TEST OWNS THE CLOCK, START TO FINISH.
 *
 * `advance` used to read the REAL `performance.now()` and anchor a mock at
 * `real + ms`. But the first `tapAt` had already stamped itself from the real
 * clock too - so the first gap came out as `ms` PLUS however long the worker
 * actually took to get between those two statements. Idle, that is a fraction
 * of a millisecond and rounds away. On a loaded machine it does not: this test
 * failed once in a full-suite run where six other files were timing out, and
 * passed on every run in isolation, which is the signature of exactly this.
 *
 * Mixing one real reading with mocked ones is the defect. `mockImplementation`
 * over a counter never reads the real clock at all, so every stamp is exact and
 * nothing the rest of the suite does can reach it.
 *
 * `vitest.setup.ts` calls `vi.restoreAllMocks()` after every test, which puts
 * the real `performance.now` back.
 */
let clock = 0;
const advance = (ms: number) => {
  clock += ms;
};

describe("reduceGridSpan", () => {
  beforeEach(() => {
    clock = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
  });

  it("does not time the pause between rounds as recall speed", () => {
    // Two taps 300ms apart inside one recall, then a four-second wait while the
    // next sequence plays, then two more 300ms apart. The old pairing counted
    // that four seconds and reported a mean around 1.2 seconds.
    const c = new BaselineCapture("g1");
    tapAt(c, 0);
    advance(300);
    tapAt(c, 1);
    advance(4000);
    tapAt(c, 0); // a new round - posInSeq restarts
    advance(300);
    tapAt(c, 1);

    expect(reduceGridSpan(c).meanRecallGapMs).toBe(300);
  });

  it("reports how the SS dual task actually went", () => {
    const c = new BaselineCapture("g2");
    c.record("check_answer", {
      check: "7 + 5 = 13",
      answer: true,
      correct: false,
    });
    c.record("check_answer", {
      check: "9 - 4 = 5",
      answer: true,
      correct: true,
    });

    expect(reduceGridSpan(c)).toMatchObject({
      dualChecks: 2,
      dualAccuracy: 0.5,
    });
  });

  it("says nothing about a dual task that never ran", () => {
    // Every band but SS. Null, not zero - they were not asked and did not fail.
    const c = new BaselineCapture("g3");
    tapAt(c, 0);

    expect(reduceGridSpan(c).dualAccuracy).toBeNull();
  });
});

describe("what the vector keeps that it used to average away", () => {
  const flank = (c: BaselineCapture, payload: Record<string, unknown>) =>
    c.record("trial_pick", {
      module: "pattern_flanker",
      act: "flanker",
      ...payload,
    });

  it("splits the flanker by congruency, which is the measure", () => {
    const c = new BaselineCapture("f1");
    flank(c, { congruency: "congruent", rtMs: 500, correct: true });
    flank(c, { congruency: "incongruent", rtMs: 900, correct: false });

    const flanker = reduceTrialModule(c, "pattern_flanker").acts.flanker;

    expect(flanker.conditions?.congruent).toMatchObject({
      trials: 1,
      accuracy: 1,
      meanRtMs: 500,
    });
    expect(flanker.conditions?.incongruent).toMatchObject({
      trials: 1,
      accuracy: 0,
      meanRtMs: 900,
    });
    // The act totals are unchanged by the breakdown.
    expect(flanker).toMatchObject({ trials: 2, accuracy: 0.5 });
  });

  it("adds no breakdown to an act that has no condition", () => {
    const c = new BaselineCapture("f2");
    pick(c, "reading", { rtMs: 3000, correct: true });

    expect(readingOf(c)).not.toHaveProperty("conditions");
  });
});

describe("reduceRunContext", () => {
  it("tells the engine which band and subject produced the numbers", () => {
    const c = new BaselineCapture("r1");
    c.record("run_start", { band: "jss" });
    c.record("probe_subject", { subject: "mathematics" });

    expect(reduceRunContext(c)).toEqual({
      module: "run",
      band: "jss",
      probeSubject: "mathematics",
    });
  });

  it("says null rather than guessing when the run never recorded one", () => {
    expect(reduceRunContext(new BaselineCapture("r2"))).toEqual({
      module: "run",
      band: null,
      probeSubject: null,
    });
  });
});

describe("BaselineCapture.stop — a withdrawn guardian", () => {
  /*
   * The flows purged once when the withdrawal arrived and carried on: every
   * module after it recorded again and wrote its stream back to IndexedDB at
   * its end. A purge empties; a stop has to keep it empty.
   */
  it("empties what was recorded before it", async () => {
    const c = new BaselineCapture("w1");
    c.record("tap", { cell: 3 });

    await c.stop();

    expect(c.stream).toHaveLength(0);
  });

  it("records nothing the child does afterwards", async () => {
    const c = new BaselineCapture("w2");
    await c.stop();

    c.record("trial_pick", { module: "pattern_flanker", rtMs: 400 });
    c.record("module_end", { module: "pattern_flanker" });

    expect(c.stream).toHaveLength(0);
  });

  it("is not what a plain purge does, which keeps recording", async () => {
    // The distinction this exists for: purge alone is the old behaviour.
    const c = new BaselineCapture("w3");
    await c.purge();

    c.record("tap", { cell: 1 });

    expect(c.stream).toHaveLength(1);
  });
});

describe("tapPoint — where the finger landed", () => {
  it("keeps the coordinates exactly, unrounded", () => {
    // Rounded coordinates are noise the engine cannot undo (frontend §2).
    expect(tapPoint({ clientX: 120.5, clientY: 44.25, detail: 1 })).toEqual({
      x: 120.5,
      y: 44.25,
    });
  });

  it("records no point for a keyboard press, rather than a false 0,0", () => {
    expect(tapPoint({ clientX: 0, clientY: 0, detail: 0 })).toEqual({});
  });

  it("records nothing when there was no event", () => {
    expect(tapPoint(undefined)).toEqual({});
  });
});
