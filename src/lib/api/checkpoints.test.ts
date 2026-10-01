import { describe, expect, it } from "vitest";
import {
  isMarkable,
  markCheckpoint,
  toQuickCheck,
  type ComprehensionCheckpoint,
} from "./checkpoints";

/**
 * The marking rules decide what a child is TOLD about their own work, which
 * makes them the highest-consequence logic in the codebase.
 *
 * The defect this guards against already shipped once: a child who answered
 * every question wrong was shown the success check, "You're getting the hang
 * of this", and the two concepts they had just failed ticked as mastered.
 *
 * The rule that must never erode: `answerKey: null` means WE CANNOT MARK THIS.
 * It is not "nothing matched". Lessons parsed before the contract existed
 * carry no recoverable key, and collapsing the two would tell a child they
 * were wrong against no answer at all.
 */

const base = {
  id: "c1",
  conceptId: null,
  conceptName: null,
  prompt: "Which fraction is equivalent to 1/2?",
  explanation: null,
  position: "after_segment",
} as const;

const checkpoint = (over: Partial<ComprehensionCheckpoint> = {}) =>
  ({
    ...base,
    answerType: "single_choice",
    options: [],
    answerKey: null,
    ...over,
  }) as ComprehensionCheckpoint;

describe("markCheckpoint - the unmarkable case", () => {
  it("returns unmarkable, never incorrect, when there is no answer key", () => {
    // The whole point. A child answering a legacy checkpoint must not be told
    // they were wrong against nothing.
    expect(markCheckpoint(checkpoint({ answerKey: null }), "2/4")).toBe(
      "unmarkable",
    );
  });

  it("is still unmarkable when the child answered nothing", () => {
    expect(markCheckpoint(checkpoint({ answerKey: null }), null)).toBe(
      "unmarkable",
    );
  });

  it("reports markability directly", () => {
    expect(isMarkable(checkpoint({ answerKey: null }))).toBe(false);
    expect(isMarkable(checkpoint({ answerKey: "2/4" }))).toBe(true);
  });
});

describe("markCheckpoint - single answers", () => {
  it("accepts an exact match", () => {
    expect(markCheckpoint(checkpoint({ answerKey: "2/4" }), "2/4")).toBe(
      "correct",
    );
  });

  it("forgives surrounding whitespace and case", () => {
    // A child typing " 2/4 " has not got it wrong.
    expect(markCheckpoint(checkpoint({ answerKey: "2/4" }), "  2/4 ")).toBe(
      "correct",
    );
  });

  it("marks a genuine miss incorrect", () => {
    expect(markCheckpoint(checkpoint({ answerKey: "2/4" }), "2/3")).toBe(
      "incorrect",
    );
  });

  it("treats no response as incorrect when a key exists", () => {
    // Distinct from unmarkable: we know the answer, they did not give one.
    expect(markCheckpoint(checkpoint({ answerKey: "2/4" }), null)).toBe(
      "incorrect",
    );
  });
});

describe("markCheckpoint - typed answers", () => {
  it("compares numerically rather than as text", () => {
    const numeric = checkpoint({ answerType: "numeric", answerKey: 4 });
    expect(markCheckpoint(numeric, "4")).toBe("correct");
    // "4.0" is the same number, and a child who typed it was not wrong.
    expect(markCheckpoint(numeric, "4.0")).toBe("correct");
    expect(markCheckpoint(numeric, "four")).toBe("incorrect");
  });

  it("accepts a boolean written either way", () => {
    const bool = checkpoint({ answerType: "boolean", answerKey: true });
    expect(markCheckpoint(bool, "true")).toBe("correct");
    expect(markCheckpoint(bool, true)).toBe("correct");
    expect(markCheckpoint(bool, false)).toBe("incorrect");
  });
});

describe("markCheckpoint - multiple choice compares as a set", () => {
  const multi = checkpoint({
    answerType: "multiple_choice",
    answerKey: ["a", "b"],
  });

  it("ignores the order the child selected in", () => {
    expect(markCheckpoint(multi, ["b", "a"])).toBe("correct");
  });

  it("marks a partial selection incorrect, not correct-so-far", () => {
    expect(markCheckpoint(multi, ["a"])).toBe("incorrect");
  });

  it("marks an over-selection incorrect", () => {
    expect(markCheckpoint(multi, ["a", "b", "c"])).toBe("incorrect");
  });

  it("does not let one value satisfy two slots", () => {
    expect(markCheckpoint(multi, ["a", "a"])).toBe("incorrect");
  });
});

describe("toQuickCheck refuses anything it cannot honestly draw", () => {
  const options = [
    { value: "2/4", label: "2/4" },
    { value: "2/3", label: "2/3" },
  ];

  it("refuses a checkpoint with no answer key", () => {
    // The player GATES on a quick check - a child cannot advance until they
    // pass. An unmarkable one would be a locked door with no key.
    expect(toQuickCheck(checkpoint({ answerKey: null, options }))).toBeNull();
  });

  it("refuses multiple choice, which the sheet cannot express", () => {
    expect(
      toQuickCheck(
        checkpoint({
          answerType: "multiple_choice",
          answerKey: ["2/4"],
          options,
        }),
      ),
    ).toBeNull();
  });

  it("refuses a key that is not among the options", () => {
    // Otherwise it presents a question with no right answer to pick.
    expect(
      toQuickCheck(checkpoint({ answerKey: "9/9", options })),
    ).toBeNull();
  });

  it("refuses fewer than two options", () => {
    expect(
      toQuickCheck(checkpoint({ answerKey: "2/4", options: [options[0]] })),
    ).toBeNull();
  });

  it("builds a quick check when it can, using the contract's explanation", () => {
    const q = toQuickCheck(
      checkpoint({
        answerKey: "2/4",
        options,
        explanation: "Doubling both gives 2/4.",
      }),
    );
    expect(q).not.toBeNull();
    expect(q!.correctId).toBe("2/4");
    expect(q!.options).toHaveLength(2);
    expect(q!.correctNote).toBe("Doubling both gives 2/4.");
    // The recovery note is the Lesson Check frame's own words, as far as a
    // field carries them - and no promise to come back that nothing keeps.
    expect(q!.recoveryNote).toBe("Not quite. Let's look again.");
  });
});
