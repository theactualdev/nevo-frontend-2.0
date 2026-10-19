import { describe, expect, it } from "vitest";
import { answerFor, calculationAttemptFor } from "./attempts";

/**
 * One answer, as `POST /attempts` takes it (D36: answers already given are
 * kept). The server marks it against the checkpoint's key, so the one thing
 * this must never do is send the wrong TYPE - a right `2` sent as `"2"` is a
 * right answer marked wrong.
 */

const SEGMENT = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";

describe("an attempt", () => {
  it("sends the option's own value, not its stringified id", () => {
    const body = answerFor({
      questionId: "cp-1",
      source: "assessment",
      choice: { id: "2", label: "Two", value: 2 },
    });

    expect(body?.answer).toBe(2);
    expect(body?.answer).not.toBe("2");
  });

  it("keeps a boolean a boolean", () => {
    const body = answerFor({
      questionId: "cp-1",
      source: "checkpoint",
      choice: { id: "false", label: "False", value: false },
    });

    expect(body?.answer).toBe(false);
  });

  it("names the question and where it was asked, and leaves the session to the sender", () => {
    expect(
      answerFor({
        questionId: "cp-9",
        segmentId: SEGMENT,
        source: "checkpoint",
        choice: { id: "a", label: "A", value: "a" },
      }),
    ).toEqual({
      // The write names it problemId since 8 Oct; questionId is refused.
      problemId: "cp-9",
      segmentId: SEGMENT,
      source: "checkpoint",
      answer: "a",
    });
  });

  it("sends no verdict and no key", () => {
    const body = answerFor({
      questionId: "cp-1",
      source: "assessment",
      choice: { id: "a", label: "A", value: "a" },
    });

    expect(Object.keys(body ?? {})).not.toContain("correct");
    expect(Object.keys(body ?? {})).not.toContain("answerKey");
  });

  it("is nothing for a question with no checkpoint behind it", () => {
    expect(
      answerFor({
        questionId: undefined,
        source: "assessment",
        choice: { id: "a", label: "A", value: "a" },
      }),
    ).toBeNull();
  });

  it("is nothing for an option with no value, the authored demo's", () => {
    expect(
      answerFor({
        questionId: "cp-1",
        source: "checkpoint",
        choice: { id: "co2", label: "Carbon dioxide" },
      }),
    ).toBeNull();
  });

  it("leaves out a segment id the contract would refuse", () => {
    // `segmentId` is `format: uuid`. A fixture id would 422 the whole write
    // over a field that is optional.
    const body = answerFor({
      questionId: "cp-1",
      segmentId: "seg-1",
      source: "checkpoint",
      choice: { id: "a", label: "A", value: "a" },
    });

    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty("segmentId");
  });
});

/*
 * Lydia, 17 Oct: "send the response time with each quick-check answer. Today
 * the check measures it and drops it." The server will not let a missing or
 * implausibly short time raise mastery - two instant right taps are not
 * learned - so the time measured has to reach it, and none is ever made up.
 */
describe("an attempt's timing", () => {
  const pick = { id: "a", label: "A", value: "a" };

  it("carries the response time the check measured", () => {
    const body = answerFor({
      questionId: "cp-1",
      source: "checkpoint",
      choice: pick,
      responseTimeMs: 2400,
    });

    expect(body).toMatchObject({ responseTimeMs: 2400 });
  });

  it("carries a 0, which is a measurement, not an absence", () => {
    const body = answerFor({
      questionId: "cp-1",
      source: "assessment",
      choice: pick,
      responseTimeMs: 0,
    });

    expect(body).toMatchObject({ responseTimeMs: 0 });
  });

  it("leaves it out when nothing was measured", () => {
    const body = answerFor({
      questionId: "cp-1",
      source: "checkpoint",
      choice: pick,
    });

    expect(body).not.toHaveProperty("responseTimeMs");
  });

  it.each([
    ["not a number at all", Number.NaN],
    ["negative", -5],
    ["over the contract's hour", 3_600_001],
  ])("leaves out a time the contract would refuse: %s", (_, ms) => {
    // The whole answer would be refused over an optional field.
    const body = answerFor({
      questionId: "cp-1",
      source: "checkpoint",
      choice: pick,
      responseTimeMs: ms,
    });

    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty("responseTimeMs");
  });

  it("says a hint was on screen only where the player knows one was (B28)", () => {
    const hinted = answerFor({
      questionId: "cp-1",
      source: "checkpoint",
      choice: pick,
      hinted: true,
    });
    const plain = answerFor({
      questionId: "cp-1",
      source: "checkpoint",
      choice: pick,
    });

    expect(hinted).toMatchObject({ hintCount: 1 });
    // Not a 0: the server's own default, and nothing was observed.
    expect(plain).not.toHaveProperty("hintCount");
  });
});

/*
 * Lydia, 17 Oct: "Answer two things wrong deliberately, let the support rise
 * on its own." The engine reads its error streak from marked answers alone,
 * so a calculation step has to be written for a calculation got wrong to
 * count - as `source: "calculation"`, on its segment.
 */
describe("a calculation answer", () => {
  it("names the step, its segment and the source, and sends what was given", () => {
    expect(
      calculationAttemptFor({
        segmentId: SEGMENT,
        problemId: "s2",
        answer: "5",
        responseTimeMs: 3_000.4,
      }),
    ).toEqual({
      problemId: "s2",
      segmentId: SEGMENT,
      source: "calculation",
      answer: "5",
      responseTimeMs: 3_000,
    });
  });

  it("keeps a number a number", () => {
    const body = calculationAttemptFor({
      segmentId: SEGMENT,
      problemId: "b1",
      answer: 3,
    });

    expect(body?.answer).toBe(3);
  });

  it("is nothing without the segment the server needs it on", () => {
    // `segmentId` is required for a calculation and `format: uuid`: a
    // fixture's segment would have the whole answer refused.
    expect(
      calculationAttemptFor({ segmentId: "calc-1", problemId: "s1", answer: "a" }),
    ).toBeNull();
  });

  it("is nothing with no problem or nothing given", () => {
    expect(
      calculationAttemptFor({ segmentId: SEGMENT, problemId: undefined, answer: "a" }),
    ).toBeNull();
    for (const answer of [undefined, ""]) {
      expect(
        calculationAttemptFor({ segmentId: SEGMENT, problemId: "s1", answer }),
        String(answer),
      ).toBeNull();
    }
  });

  it("says a hint was on screen only where the solver saw one", () => {
    const hinted = calculationAttemptFor({
      segmentId: SEGMENT,
      problemId: "s1",
      answer: "a",
      hinted: true,
    });
    const plain = calculationAttemptFor({
      segmentId: SEGMENT,
      problemId: "s1",
      answer: "a",
    });

    expect(hinted).toMatchObject({ hintCount: 1 });
    expect(plain).not.toHaveProperty("hintCount");
  });

  it.each([
    ["not a number at all", Number.NaN],
    ["negative", -5],
    ["over the contract's hour", 3_600_001],
  ])("leaves out a time the contract would refuse: %s", (_, ms) => {
    const body = calculationAttemptFor({
      segmentId: SEGMENT,
      problemId: "s1",
      answer: "a",
      responseTimeMs: ms,
    });

    expect(body).not.toBeNull();
    expect(body).not.toHaveProperty("responseTimeMs");
  });

  it("sends no verdict and no key", () => {
    const body = calculationAttemptFor({
      segmentId: SEGMENT,
      problemId: "s1",
      answer: "a",
    });

    expect(Object.keys(body ?? {})).not.toContain("correct");
    expect(Object.keys(body ?? {})).not.toContain("answerKey");
  });
});
