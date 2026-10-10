import { describe, expect, it } from "vitest";
import { lessonFromContent } from "./fromContent";
import type {
  LessonDetailResponse,
  LessonSegment as ContentSegment,
} from "@/lib/api/lessons";

/**
 * What the text channel carries beside the body: SCRUM-224's key points, key
 * terms and equation callouts, and SCRUM-234's reading chunks.
 *
 * `keyPoints` were never removed from the wire. This adapter dropped them, so
 * design's D24 boxes - "The boxes stay. They are key points" - had nothing to
 * draw on any live lesson. Each is carried only when it came, and only what
 * has words in it (rule 5): an empty box is a claim about nothing.
 */

const BODY =
  "Plants make their own food. They use sunlight to do it. Oxygen is what they give out.";

const segment = (over: Record<string, unknown> = {}): ContentSegment =>
  ({
    id: "seg-1",
    segmentKey: "s1",
    contentType: "explanatory_text",
    sequenceOrder: 1,
    title: "Photosynthesis",
    body: BODY,
    availableModalities: ["text"],
    comprehensionCheckpoints: [],
    textVariant: null,
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    depthVariants: null,
    needsReview: false,
    reviewReasons: [],
    ...over,
  }) as unknown as ContentSegment;

const textOf = (over: Record<string, unknown>) => {
  const lesson = lessonFromContent({
    id: "lesson-1",
    title: "Plants",
    segments: [segment(over)],
  } as unknown as LessonDetailResponse);
  return lesson!.segments[0].text!;
};

const variant = (over: Record<string, unknown>) => ({
  textVariant: { body: BODY, keyPoints: [], ...over },
});

describe("the text variant's boxes (SCRUM-224)", () => {
  it("carries the key points through", () => {
    const text = textOf(
      variant({ keyPoints: ["Plants feed themselves.", "Light is the fuel."] }),
    );

    expect(text.keyPoints).toEqual([
      "Plants feed themselves.",
      "Light is the fuel.",
    ]);
  });

  it("carries each key term with its definition, which the child can open", () => {
    // Design, 9 Oct: "A definition appears in place when the child taps the
    // term." A blank definition is no definition, and the chip opens nothing.
    const text = textOf(
      variant({
        keyTerms: [
          { term: "chlorophyll", definition: "The green colour in a leaf." },
          { term: " glucose ", definition: "  " },
        ],
      }),
    );

    expect(text.keyTerms).toEqual([
      { term: "chlorophyll", definition: "The green colour in a leaf." },
      { term: "glucose" },
    ]);
  });

  it("carries each equation, with its label only where it has one", () => {
    const words = "Carbon dioxide + Water → Glucose + Oxygen";
    const symbols = "6CO2 + 6H2O → C6H12O6 + 6O2";
    const text = textOf(
      variant({
        equationCallouts: [
          { equation: words, label: "Word equation" },
          { equation: symbols, label: null },
        ],
      }),
    );

    expect(text.equations).toEqual([
      { equation: words, label: "Word equation" },
      { equation: symbols },
    ]);
  });

  it("carries nothing where nothing came", () => {
    // No variant, and a variant whose lists are empty or blank, are the same
    // nothing: no key, so the segment draws no box.
    for (const over of [
      {},
      variant({}),
      variant({ keyPoints: ["  "], keyTerms: [{ term: " ", definition: "x" }] }),
      variant({ equationCallouts: [{ equation: "", label: "Word equation" }] }),
    ]) {
      const text = textOf(over);
      expect(text).not.toHaveProperty("keyPoints");
      expect(text).not.toHaveProperty("keyTerms");
      expect(text).not.toHaveProperty("equations");
    }
  });
});

describe("the server's reading chunks (SCRUM-234)", () => {
  const chunk = (id: string, sequenceOrder: number, text: string) => ({
    id,
    sequenceOrder,
    text,
    startOffset: BODY.indexOf(text),
    endOffset: BODY.indexOf(text) + text.length,
  });
  const FIRST = chunk("c1", 1, "Plants make their own food.");
  const REST = "They use sunlight to do it. Oxygen is what they give out.";
  const SECOND = chunk("c2", 2, REST);

  it("carries them in their order, by id and text", () => {
    const text = textOf({ readingChunks: [SECOND, FIRST] });

    expect(text.readingChunks).toEqual([
      { id: "c1", text: "Plants make their own food." },
      { id: "c2", text: REST },
    ]);
  });

  it("reads none and none sent as one body", () => {
    expect(textOf({})).not.toHaveProperty("readingChunks");
    expect(textOf({ readingChunks: [] })).not.toHaveProperty("readingChunks");
  });

  it("refuses chunks that are not the body's words, and keeps the body", () => {
    // Drawn in place of the body, a set that dropped a sentence would put a
    // lesson on screen that is not the approved one.
    const text = textOf({ readingChunks: [FIRST] });

    expect(text).not.toHaveProperty("readingChunks");
    expect(text.body.default).toBe(BODY);
  });

  it("refuses a set with a chunk that has no id to report it by", () => {
    const text = textOf({ readingChunks: [FIRST, { ...SECOND, id: "" }] });

    expect(text).not.toHaveProperty("readingChunks");
  });
});
