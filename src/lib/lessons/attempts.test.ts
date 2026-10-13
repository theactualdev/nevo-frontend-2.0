import { describe, expect, it } from "vitest";
import { answerFor } from "./attempts";

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
