import { describe, expect, it } from "vitest";
import { lessonFromContent } from "./fromContent";
import type {
  LessonDetailResponse,
  LessonSegment as ContentSegment,
} from "@/lib/api/lessons";

/**
 * SCRUM-268, 21 Oct: the activity card was not reaching the child. It was
 * ours to fix - the payload arrived (Osmosis section 4: "Text, picture,
 * activity") and this adapter dropped it, because the channel was not one it
 * could render and nothing built `segment.interactive`.
 *
 * The activity is read field for field; the question form stays unmapped.
 */

const segment = (over: Partial<ContentSegment> = {}): ContentSegment =>
  ({
    id: "seg-4",
    segmentKey: "s4",
    contentType: "explanatory_text",
    sequenceOrder: 1,
    title: "Osmosis in a potato",
    body: "Water moves from where there is more of it to where there is less.",
    availableModalities: ["text", "interactive"],
    comprehensionCheckpoints: [],
    textVariant: null,
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    needsReview: false,
    reviewReasons: [],
    ...over,
  }) as unknown as ContentSegment;

const lesson = (segments: ContentSegment[]): LessonDetailResponse =>
  ({
    id: "lesson-1",
    title: "Osmosis",
    confirmationSummary: null,
    segments,
  }) as unknown as LessonDetailResponse;

const activity = (over: Record<string, unknown> = {}) =>
  ({
    type: "activity",
    title: "Watch a potato change",
    introduction: "Potatoes are mostly water held in cells.",
    materials: ["Two potato slices", "Salt water", "Plain water"],
    steps: [
      { id: "a1", instruction: "Put one slice in each glass." },
      { id: "a2", instruction: "Wait twenty minutes." },
      { id: "a3", instruction: "Press each slice with a finger." },
    ],
    outcome: "The slice in salt water is soft; the other is firm.",
    ...over,
  }) as never;

const built = (over: Partial<ContentSegment>) =>
  lessonFromContent(lesson([segment(over)]))!.segments[0];

describe("an activity reaches the player", () => {
  it("as its heading, introduction, what is needed, steps and outcome", () => {
    const seg = built({ interactiveVariant: activity() });

    expect(seg.interactive).toEqual({
      heading: "Watch a potato change",
      intro: "Potatoes are mostly water held in cells.",
      needs: ["Two potato slices", "Salt water", "Plain water"],
      steps: [
        "Put one slice in each glass.",
        "Wait twenty minutes.",
        "Press each slice with a finger.",
      ],
      // One line, the result: the contract has no guide line to show first.
      outcome: { done: "The slice in salt water is soft; the other is firm." },
    });
  });

  it("is offered, in the order the server gave", () => {
    expect(built({ interactiveVariant: activity() }).modalities).toEqual([
      "text",
      "interactive",
    ]);
    expect(
      built({
        availableModalities: ["interactive", "text"],
        interactiveVariant: activity(),
      }).modalities,
    ).toEqual(["interactive", "text"]);
  });

  it("reads an activity stored before `introduction` existed", () => {
    const old = activity();
    delete (old as Record<string, unknown>).introduction;

    const seg = built({ interactiveVariant: old });

    expect(seg.interactive).toBeDefined();
    expect(seg.interactive).not.toHaveProperty("intro");
  });

  it("leaves out what is needed when nothing is", () => {
    const seg = built({ interactiveVariant: activity({ materials: [] }) });

    expect(seg.interactive).not.toHaveProperty("needs");
  });

  it("falls back to the section's title for a heading it was not given", () => {
    const seg = built({ interactiveVariant: activity({ title: "  " }) });

    expect(seg.interactive?.heading).toBe("Osmosis in a potato");
  });

  it("draws no card for an outcome with no words", () => {
    const seg = built({ interactiveVariant: activity({ outcome: "" }) });

    expect(seg.interactive).not.toHaveProperty("outcome");
  });
});

describe("what is not an activity the child can do", () => {
  it("the question form, which is left unmapped as it always was", () => {
    const seg = built({
      interactiveVariant: {
        type: "practice_problem",
        prompt: "Which way does water move?",
        expectedInteraction: "tap",
        options: [],
        answerKey: null,
        instructions: null,
      } as never,
    });

    expect(seg.interactive).toBeUndefined();
    expect(seg.modalities).toEqual(["text"]);
  });

  it("an activity with no step to do", () => {
    for (const steps of [[], [{ id: "a1", instruction: "   " }]]) {
      const seg = built({ interactiveVariant: activity({ steps }) });

      expect(seg.interactive).toBeUndefined();
      expect(seg.modalities).toEqual(["text"]);
    }
  });

  it("a claim of interactive with no activity behind it", () => {
    const seg = built({ interactiveVariant: null });

    expect(seg.interactive).toBeUndefined();
    expect(seg.modalities).toEqual(["text"]);
  });

  it("drops a blank step rather than a card to tick with nothing on it", () => {
    const seg = built({
      interactiveVariant: activity({
        steps: [
          { id: "a1", instruction: "Put one slice in each glass." },
          { id: "a2", instruction: "" },
        ],
      }),
    });

    expect(seg.interactive?.steps).toEqual(["Put one slice in each glass."]);
  });
});
