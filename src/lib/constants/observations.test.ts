import { describe, expect, it } from "vitest";
import type { ObservationPattern } from "@/lib/api/classes";
import { OBSERVATION_COPY, observationCount } from "./observations";

/**
 * These strings are the only place the five roster patterns are phrased, and
 * they sit on a SENCo's screen about one named child. The tests are a Zero-Tag
 * guard, not a snapshot: they fail on the vocabulary that turns an observation
 * into a characterisation, so a later well-meaning edit cannot slide back.
 */

const PATTERNS: ObservationPattern[] = [
  "completed_lessons",
  "revisited_content",
  "steadier_pace",
  "tried_another_format",
  "no_recent_pattern",
];

/** Words that convert "this happened" into "this is what they are like". */
const TRAIT_VOCABULARY =
  /\b(struggl\w*|weak\w*|poor|slow learner|difficulty|difficulties|deficit|impair\w*|disorder|diagnos\w*|behind|below average|lazy|unmotivated|inattentive|distract\w*|prefers (?:audio|visual)|learning style|visual learner|auditory learner)\b/i;

describe("the five observation phrasings", () => {
  it("covers every member of the closed enum", () => {
    for (const p of PATTERNS) {
      expect(OBSERVATION_COPY[p], p).toBeDefined();
      expect(OBSERVATION_COPY[p].title.length).toBeGreaterThan(0);
    }
    expect(Object.keys(OBSERVATION_COPY).sort()).toEqual([...PATTERNS].sort());
  });

  it("never describes the child rather than the event", () => {
    for (const p of PATTERNS) {
      const text = `${OBSERVATION_COPY[p].title} ${OBSERVATION_COPY[p].body("Amara")}`;
      expect(text, p).not.toMatch(TRAIT_VOCABULARY);
    }
  });

  it("dates nothing, because the route declares no window", () => {
    for (const p of PATTERNS) {
      const text = `${OBSERVATION_COPY[p].title} ${OBSERVATION_COPY[p].body("Amara")}`;
      expect(text, p).not.toMatch(
        /this week|last week|30 days|this month|recently/i,
      );
    }
  });

  it("names no modality for a format switch", () => {
    // The response says a switch happened, never in which direction.
    const text = OBSERVATION_COPY.tried_another_format.body("Amara");
    expect(text).not.toMatch(
      /\b(audio|video|visual|text|reading|listening)\b/i,
    );
  });

  it("frames revisiting as the product working, not a memory problem", () => {
    const text = OBSERVATION_COPY.revisited_content.body("Amara");
    expect(text).toMatch(/built to be re-entered/);
  });

  it("does not let an absent pattern read as idleness", () => {
    const text = OBSERVATION_COPY.no_recent_pattern.body("Amara");
    expect(text).toMatch(/ordinary reading/);
    expect(text).not.toMatch(/\b(nothing done|no work|inactive)\b/i);
  });
});

describe("observationCount", () => {
  it("says nothing when the count was not given", () => {
    // Required is `pattern` alone; count is integer|null. Absent is not zero.
    expect(observationCount("completed_lessons", undefined)).toBeNull();
    expect(observationCount("completed_lessons", null)).toBeNull();
  });

  it("reads naturally at one and above", () => {
    expect(observationCount("completed_lessons", 1)).toBe("1 lesson");
    expect(observationCount("completed_lessons", 4)).toBe("4 lessons");
  });

  it("renders a zero it was actually given", () => {
    expect(observationCount("completed_lessons", 0)).toBe("0 lessons");
  });

  it("refuses to count how often a child went back over something", () => {
    /*
     * Design's ruling, and the sharpest one they made. The sentence for
     * `revisited_content` is carefully built to stop "revisited" reading as
     * "struggles with retention" - and a number beside it undoes that work
     * regardless of how the sentence is phrased. "Went back over something ·
     * 7 times" is a finding about a child.
     */
    expect(observationCount("revisited_content", 7)).toBeNull();
  });

  it("counts nothing but finished lessons", () => {
    // The other three tell a teacher nothing they can act on, so the count
    // appears exactly once, where it is unambiguous and is good news.
    expect(observationCount("steadier_pace", 3)).toBeNull();
    expect(observationCount("tried_another_format", 3)).toBeNull();
    expect(observationCount("no_recent_pattern", 3)).toBeNull();
  });
});

describe("no observation guesses a child's pronoun", () => {
  it("never says he or she about a named learner", () => {
    /*
     * Design's copy arrived reading "the lessons she starts" and "material she
     * had already covered", written around the example child. Nevo stores no
     * pronoun for anybody, so shipping that would have been wrong for some
     * children on a SEND record that names them - the one screen where being
     * wrong about a child matters most. Singular they throughout.
     */
    for (const copy of Object.values(OBSERVATION_COPY)) {
      expect(copy.body("Amara")).not.toMatch(/\b(he|she|him|her|his|hers)\b/i);
    }
  });
});
