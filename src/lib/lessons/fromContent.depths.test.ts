import { describe, expect, it } from "vitest";
import { lessonFromContent } from "./fromContent";
import { adaptSegmentsFor } from "./adaptation";
import type {
  LessonDetailResponse,
  LessonSegment as ContentSegment,
} from "@/lib/api/lessons";

/**
 * The half of Simplify that did not exist until 22 Sep.
 *
 * `simplify`, `slower` and `expand` have been reaching this client as engine
 * instructions since the enum landed, and the player has known what to do with
 * them since #514 - but a parsed lesson had one body and no reshapes, so
 * `simplify` correctly did nothing. `depthVariants` is the text, written at
 * parse time and keyed by the engine's own action names.
 *
 * The rule this file defends is the one the whole density system already
 * holds: **an offered reshape that re-renders identical prose is the player
 * telling a child it adapted when it did not.** So a blank rewrite and a
 * rewrite equal to the source are both "no rewrite", in BOTH directions - what
 * the player offers, and what we tell the engine it may ask for.
 */

const BASE = "The number on top of a fraction is the numerator.";
const SHORTER = "The top number is the numerator.";
const LONGER = `${BASE} It tells you how many parts you have.`;

const segment = (depthVariants: unknown = null): ContentSegment =>
  ({
    id: "seg-1",
    segmentKey: "s1",
    contentType: "explanatory_text",
    sequenceOrder: 1,
    title: "Numerators",
    body: BASE,
    availableModalities: ["text"],
    comprehensionCheckpoints: [],
    textVariant: null,
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    depthVariants,
    needsReview: false,
    reviewReasons: [],
  }) as unknown as ContentSegment;

const lesson = (s: ContentSegment): LessonDetailResponse =>
  ({
    id: "lesson-1",
    title: "Fractions Lesson 3",
    confirmationSummary: null,
    segments: [s],
  }) as unknown as LessonDetailResponse;

/**
 * `lessonFromContent` returns null for a lesson with nothing a child could
 * open - the nothing-state, not an error. Every segment here has text, so a
 * null is this helper's own bug rather than a case under test.
 */
const bodyOf = (s: ContentSegment) => {
  const out = lessonFromContent(lesson(s));
  if (!out) throw new Error("fixture produced no openable lesson");
  return out.segments[0].text!.body;
};

describe("what a child can be shown", () => {
  it("carries a simpler rewrite as the Simplify body", () => {
    const out = bodyOf(segment({ simplified: { body: SHORTER }, expanded: null }));

    expect(out.default).toBe(BASE);
    expect(out.simplify).toBe(SHORTER);
  });

  it("carries a longer rewrite as the Expand body", () => {
    // Design deferred Expand because "it needs text that does not exist".
    // It exists now.
    const out = bodyOf(segment({ simplified: null, expanded: { body: LONGER } }));

    expect(out.expand).toBe(LONGER);
  });

  it("carries both when both were written", () => {
    const out = bodyOf(
      segment({ simplified: { body: SHORTER }, expanded: { body: LONGER } }),
    );

    expect(out.simplify).toBe(SHORTER);
    expect(out.expand).toBe(LONGER);
  });
});

describe("what is not a rewrite", () => {
  it("offers nothing when the segment has no depth variants at all", () => {
    // A lesson parsed before the field existed. Absent means fall back.
    const out = bodyOf(segment(null));

    expect("simplify" in out).toBe(false);
    expect("expand" in out).toBe(false);
  });

  it("omits the key rather than carrying an empty body", () => {
    /*
     * `body` defaults to `""` on the wire, so an empty rewrite is a field that
     * exists and says nothing. The key's ABSENCE is what the player tests, so
     * carrying `""` would offer a chip that blanks the screen.
     */
    const out = bodyOf(
      segment({ simplified: { body: "" }, expanded: { body: "   " } }),
    );

    expect("simplify" in out).toBe(false);
    expect("expand" in out).toBe(false);
  });

  it("omits a rewrite identical to the source", () => {
    // The rule the density system already holds: a toggle that re-renders the
    // same prose is the player claiming an adaptation that did not happen.
    const out = bodyOf(segment({ simplified: { body: BASE }, expanded: null }));

    expect("simplify" in out).toBe(false);
  });
});

describe("what the engine is told it may ask for", () => {
  it("names both depths when the segment has both", () => {
    const [sent] = adaptSegmentsFor([
      segment({ simplified: { body: SHORTER }, expanded: { body: LONGER } }),
    ]);

    expect(sent.availableDepths).toEqual(["simplified", "expanded"]);
  });

  it("names only the one that exists", () => {
    const [sent] = adaptSegmentsFor([
      segment({ simplified: { body: SHORTER }, expanded: null }),
    ]);

    expect(sent.availableDepths).toEqual(["simplified"]);
  });

  it("sends an empty list rather than nothing when there are none", () => {
    /*
     * THE DISTINCTION IS BACKEND'S OWN: "omitting the field and sending [] are
     * different answers - omitted means 'I didn't say'". We have read the
     * segment, so `[]` is a positive claim that it has neither rewrite, and
     * the engine can stop instructing one.
     */
    const [sent] = adaptSegmentsFor([segment(null)]);

    expect(sent.availableDepths).toEqual([]);
  });

  it("agrees with what the player would offer, on the same segment", () => {
    /*
     * The two halves must not drift. If this side claimed a depth the player
     * omits, the engine would confidently instruct a change a child cannot
     * see - which is the exact failure both emptiness rules exist to stop.
     */
    const s = segment({ simplified: { body: BASE }, expanded: { body: LONGER } });
    const [sent] = adaptSegmentsFor([s]);
    const out = bodyOf(s);

    expect(sent.availableDepths).toEqual(["expanded"]);
    expect("simplify" in out).toBe(false);
    expect(out.expand).toBe(LONGER);
  });
});
