import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaselineCapture, baselineTrials, tapPoint } from "./capture";

/**
 * The trials are the only thing that leaves the device (B9, 5 Oct).
 *
 * The device used to reduce the run to a feature vector - a mean response
 * time, an accuracy and a longest span per activity - and frontend §3 says it
 * computes none of those. `POST /api/baseline/trials` takes one trial per
 * answer and the server does the arithmetic. So these tests are about two
 * things: that nothing reaching the wire is a summary, and that each trial
 * says exactly what happened, including the cases a summary used to get wrong.
 *
 * `.dom.test.ts` because `BaselineCapture` stamps `performance.now()` and
 * reaches for `indexedDB`; neither belongs in the node project.
 */

/*
 * THE TEST OWNS THE CLOCK, START TO FINISH.
 *
 * Mixing one real `performance.now()` reading with mocked ones made a gap
 * come out as `ms` plus however long a loaded worker took between two
 * statements. `mockImplementation` over a counter never reads the real clock,
 * so every stamp is exact. `vitest.setup.ts` restores the real one after
 * every test.
 */
let clock = 0;
const advance = (ms: number) => {
  clock += ms;
};

beforeEach(() => {
  clock = 1_000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});

const pick = (
  capture: BaselineCapture,
  act: string,
  payload: Record<string, unknown>,
) => capture.record("trial_pick", { module: "sentence_dot", act, ...payload });

/** Every field `BaselineTrial` has, and nothing else. */
const CONTRACT_KEYS = [
  "condition",
  "correct",
  "dimension",
  "probeItemId",
  "response",
  "responseTimeMs",
].sort();

/** A whole onboarding run, in miniature: every kind of answer it records. */
function aWholeRun() {
  const c = new BaselineCapture("run-1");
  c.record("run_start", { band: "ss" });
  // Module 1: a dual-task check, then a three-tile recall done right.
  c.record("playback_start", { length: 3, litMs: 660, gapMs: 280 });
  c.record("check_shown", { check: "7 + 5 = 13" });
  advance(1200);
  c.record("check_answer", { check: "7 + 5 = 13", answer: true, correct: false, x: 10, y: 20 });
  c.record("input_start", { length: 3 });
  for (const pos of [0, 1, 2]) {
    advance(400);
    c.record("tap", { cell: 5 - pos, correct: true, posInSeq: pos, length: 3, x: 1.5, y: 2.5 });
  }
  c.record("round_complete", { length: 3 });
  // Module 2.
  c.record("trial_pick", { module: "pattern_flanker", act: "pattern", choice: 0, rtMs: 640, pair: "same", correct: true });
  c.record("trial_pick", { module: "pattern_flanker", act: "flanker", choice: 1, rtMs: 910, congruency: "incongruent", correct: false });
  // Module 3.
  pick(c, "reading", { choice: 2, rtMs: 2100, mode: "sentence", notSure: true });
  pick(c, "dots", { choice: 0, rtMs: 700, a: 9, b: 6, ratio: 1.5, correct: true });
  // Module 4.
  c.record("probe_subject", { subject: "mathematics" });
  c.record("trial_pick", { module: "domain_probe", act: "probe", choice: 1, rtMs: 3300, subject: "mathematics", correct: true });
  c.record("module_end", { module: "domain_probe" });
  return c;
}

describe("baselineTrials - nothing on the wire is a summary", () => {
  it("is one trial per answer, in the order they were given", () => {
    const trials = baselineTrials(aWholeRun());

    // One check, three taps, five picks.
    expect(trials).toHaveLength(9);
    expect(trials.map((t) => t.dimension)).toEqual([
      "wmc",
      "wmc",
      "wmc",
      "wmc",
      "ps",
      "attention",
      "reading",
      "ans",
      "domain",
    ]);
  });

  it("carries the contract's fields and no others - no mean, no accuracy, no span", () => {
    /*
     * The bug this guards against is the device deciding a measure of a
     * child. The reducers sent `meanRtMs`, `accuracy`, `maxSpan`,
     * `meanRecallGapMs`, `dualAccuracy`; a trial has no field any of those
     * could ride in, and nothing else is let on.
     */
    const trials = baselineTrials(aWholeRun());

    for (const trial of trials) {
      expect(Object.keys(trial).sort()).toEqual(CONTRACT_KEYS);
    }
    expect(JSON.stringify(trials)).not.toMatch(
      /mean|accuracy|span|scored|roundsCompleted|retries|median/i,
    );
  });

  it("sends each response time as measured, never averaged", () => {
    // Two quick wrong answers. A mean of 390 is what used to go; now each
    // answer carries its own time and its own verdict.
    const c = new BaselineCapture("s2");
    pick(c, "reading", { choice: 0, rtMs: 400, mode: "sentence", correct: false });
    pick(c, "reading", { choice: 1, rtMs: 380, mode: "sentence", correct: false });

    expect(baselineTrials(c)).toEqual([
      { dimension: "reading", condition: "sentence", response: "0", correct: false, responseTimeMs: 400, probeItemId: null },
      { dimension: "reading", condition: "sentence", response: "1", correct: false, responseTimeMs: 380, probeItemId: null },
    ]);
  });

  it("does not carry where the finger landed (B14)", () => {
    expect(JSON.stringify(baselineTrials(aWholeRun()))).not.toMatch(/"x"|"y"/);
  });

  it("does not invent the band, which a trial has no field for", () => {
    // It travelled on the vector; it is an open ask now, not a guess.
    expect(JSON.stringify(baselineTrials(aWholeRun()))).not.toMatch(/"ss"/);
  });

  it("is nothing at all for a run that recorded no answers", () => {
    const c = new BaselineCapture("empty");
    c.record("run_start", { band: "p46" });

    expect(baselineTrials(c)).toEqual([]);
  });
});

describe("baselineTrials - a pick", () => {
  it("names the condition each trial ran under", () => {
    const [, , , , pattern, flanker, reading, dots, probe] = baselineTrials(
      aWholeRun(),
    );

    expect(pattern.condition).toBe("same");
    expect(flanker.condition).toBe("incongruent");
    expect(reading.condition).toBe("sentence");
    expect(dots.condition).toBe("ratio_1.5");
    expect(probe.condition).toBe("mathematics");
  });

  it("sends 'Not sure' as a decline, never as a wrong answer", () => {
    const c = new BaselineCapture("s4");
    pick(c, "reading", { choice: 2, rtMs: 2000, mode: "sentence", notSure: true });

    expect(baselineTrials(c)[0]).toMatchObject({
      response: "not_sure",
      correct: null,
    });
  });

  it("says nothing about right or wrong where the activity held no key", () => {
    const c = new BaselineCapture("s3");
    c.record("trial_pick", { module: "warmup", act: "domain", choice: "56", rtMs: 2000 });

    expect(baselineTrials(c)[0].correct).toBeNull();
  });

  it("names a served item for the server to mark, with the option's value", () => {
    const item = "6f1c2b0e-8a7d-4e57-9b8e-2c4d5f6a7b8c";
    const c = new BaselineCapture("w1");
    c.record("trial_pick", {
      module: "warmup",
      act: "domain",
      choice: "56",
      rtMs: 1800,
      itemId: item,
      chosenOption: "opt-b",
    });

    expect(baselineTrials(c)[0]).toEqual({
      dimension: "domain",
      condition: null,
      response: "opt-b",
      correct: null,
      responseTimeMs: 1800,
      probeItemId: item,
    });
  });

  it("does not put an id the contract would refuse in probeItemId", () => {
    // `probeItemId` is `format: uuid`; one bad id 422s the whole run.
    const c = new BaselineCapture("w2");
    c.record("trial_pick", { module: "warmup", act: "domain", choice: "56", rtMs: 1800, itemId: "item-7", chosenOption: "opt-b" });

    expect(baselineTrials(c)[0].probeItemId).toBeNull();
  });

  it("sends no time it could not have measured, rather than a clamped one", () => {
    // Over the contract's 600000 the whole run would be refused; under zero
    // is not a time. Neither is rounded into a number nobody measured.
    const c = new BaselineCapture("w3");
    pick(c, "dots", { choice: 0, rtMs: 900_000, correct: true });
    pick(c, "dots", { choice: 0, rtMs: null, beforeOpen: true });
    pick(c, "dots", { choice: 0, rtMs: 640.6, correct: true });

    expect(baselineTrials(c).map((t) => t.responseTimeMs)).toEqual([
      null,
      null,
      641,
    ]);
  });
});

describe("baselineTrials - tile memory", () => {
  /** A tap at `posInSeq`, stamped wherever the test clock now stands. */
  const tap = (c: BaselineCapture, posInSeq: number, correct = true) =>
    c.record("tap", { cell: posInSeq, correct, posInSeq, length: 3 });

  it("times each tap from the one before it in the same recall", () => {
    const c = new BaselineCapture("g1");
    c.record("input_start", { length: 3 });
    advance(500);
    tap(c, 0);
    advance(300);
    tap(c, 1);
    advance(320);
    tap(c, 2);

    expect(baselineTrials(c).map((t) => t.responseTimeMs)).toEqual([
      500, 300, 320,
    ]);
    expect(baselineTrials(c)[0]).toMatchObject({
      dimension: "wmc",
      condition: "length_3",
      response: "0",
      correct: true,
    });
  });

  it("never times the pause between rounds as recall", () => {
    // The old pairing counted the four seconds between rounds - the beat, the
    // playback lead, the next sequence lighting up - as a child's recall.
    const c = new BaselineCapture("g2");
    c.record("input_start", { length: 3 });
    advance(450);
    tap(c, 0);
    advance(300);
    tap(c, 1);
    c.record("round_complete", { length: 3 });
    advance(4000);
    c.record("input_start", { length: 3 });
    advance(600);
    tap(c, 0);

    expect(baselineTrials(c).map((t) => t.responseTimeMs)).toEqual([
      450, 300, 600,
    ]);
  });

  it("starts the recall again after a wrong tap, with the pattern replayed", () => {
    const c = new BaselineCapture("g3");
    c.record("input_start", { length: 3 });
    advance(500);
    tap(c, 0);
    advance(700);
    tap(c, 1, false);
    advance(3000);
    c.record("input_start", { length: 3 });
    advance(400);
    tap(c, 0);

    const trials = baselineTrials(c);
    expect(trials.map((t) => t.correct)).toEqual([true, false, true]);
    expect(trials.map((t) => t.responseTimeMs)).toEqual([500, 700, 400]);
  });

  it("leaves a tap untimed when nothing says when its recall began", () => {
    const c = new BaselineCapture("g4");
    tap(c, 0);

    expect(baselineTrials(c)[0].responseTimeMs).toBeNull();
  });

  it("sends the SS dual task's checks, timed from the check appearing", () => {
    const c = new BaselineCapture("g5");
    c.record("check_shown", { check: "9 - 4 = 5" });
    advance(1500);
    c.record("check_answer", { check: "9 - 4 = 5", answer: true, correct: true });

    expect(baselineTrials(c)).toEqual([
      {
        dimension: "wmc",
        condition: "dual_check",
        response: "true",
        correct: true,
        responseTimeMs: 1500,
        probeItemId: null,
      },
    ]);
  });
});

describe("baselineTrials - the motor-speed step's samples (PR #645)", () => {
  it("carries every tap as taken, practice marked, and no median", () => {
    // Nothing records these on this branch yet; the step lands with #645, and
    // its samples leave as trials rather than as a feature of their own.
    const c = new BaselineCapture("m1");
    c.record("motor_tap", { target: 0, cell: 4, latencyMs: 812, practice: true, formFactor: "tablet" });
    c.record("motor_tap", { target: 2, cell: 7, latencyMs: 455, practice: false, formFactor: "tablet" });

    expect(baselineTrials(c)).toEqual([
      { dimension: "motor_speed", condition: "practice", response: "4", correct: null, responseTimeMs: 812, probeItemId: null },
      { dimension: "motor_speed", condition: null, response: "7", correct: null, responseTimeMs: 455, probeItemId: null },
    ]);
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
