import { describe, expect, it } from "vitest";
import {
  MAX_RUN,
  runsHold,
  wordConflictTrials,
  type WordConflictTrial,
} from "./wordConflict";

/**
 * Lydia's trial list, 27 Oct: "Eight practice trials with feedback, then
 * thirty-two scored trials. Half congruent, half incongruent. LEFT and RIGHT
 * balanced inside each half, so eight of each of the four combinations.
 * Order randomised with no more than three of the same correct response in a
 * row."
 */

/** A seeded generator, so a failing order can be replayed. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const count = (
  trials: WordConflictTrial[],
  pick: (t: WordConflictTrial) => boolean,
) => trials.filter(pick).length;

describe("the Word Conflict trial list", () => {
  it("is eight practice trials, then thirty-two scored", () => {
    const trials = wordConflictTrials(seeded(1));

    expect(trials).toHaveLength(40);
    expect(trials.slice(0, 8).every((t) => t.practice)).toBe(true);
    expect(trials.slice(8).every((t) => !t.practice)).toBe(true);
  });

  it("scores eight of each of the four combinations", () => {
    const scored = wordConflictTrials(seeded(2)).filter((t) => !t.practice);

    for (const condition of ["congruent", "incongruent"] as const)
      for (const word of ["left", "right"] as const)
        expect(
          count(scored, (t) => t.condition === condition && t.word === word),
        ).toBe(8);
  });

  it("points the arrow with the word when congruent, against it when not", () => {
    for (const t of wordConflictTrials(seeded(3)))
      expect(t.arrow === t.word).toBe(t.condition === "congruent");
  });

  it("says RIGHT as often as LEFT in the practice too", () => {
    const practice = wordConflictTrials(seeded(4)).filter((t) => t.practice);

    expect(count(practice, (t) => t.word === "left")).toBe(4);
    expect(count(practice, (t) => t.condition === "congruent")).toBe(4);
  });

  it("never asks the same answer more than three times in a row, across many runs", () => {
    for (let seed = 0; seed < 300; seed++) {
      const trials = wordConflictTrials(seeded(seed));
      expect(runsHold(trials), `seed ${seed}`).toBe(true);
    }
    expect(MAX_RUN).toBe(3);
  });

  it("orders each run afresh", () => {
    const words = (seed: number) =>
      wordConflictTrials(seeded(seed))
        .map((t) => t.word[0])
        .join("");

    expect(words(5)).not.toBe(words(6));
  });
});

describe("runsHold", () => {
  const t = (word: "left" | "right"): WordConflictTrial => ({
    word,
    arrow: word,
    condition: "congruent",
    practice: false,
  });

  it("allows three in a row and refuses four", () => {
    expect(runsHold((["left", "left", "left", "right"] as const).map(t))).toBe(true);
    expect(runsHold((["right", "right", "right", "right"] as const).map(t))).toBe(false);
  });
});
