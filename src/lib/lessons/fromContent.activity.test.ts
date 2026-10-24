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
      // The outcome is the line once done; this one sends no in-progress line.
      outcome: { done: "The slice in salt water is soft; the other is firm." },
    });
  });

  it("is offered in the format group, in the order the server gave", () => {
    expect(
      built({
        availableFormats: ["text", "interactive"],
        interactiveVariant: activity(),
      }).formats,
    ).toEqual(["text", "interactive"]);
    expect(
      built({
        availableModalities: ["interactive", "text"],
        availableFormats: ["interactive", "text"],
        interactiveVariant: activity(),
      }).formats,
    ).toEqual(["interactive", "text"]);
  });

  it("is never what a section opens in with nothing picked (Lydia, 21 Oct)", () => {
    // `modalities` is the list the opening reads: the plan's format is held
    // to it and its first entry is the fallback. The activity stays out of
    // it, so the opening is exactly what it was before the activity mapped.
    const seg = built({
      availableModalities: ["interactive", "text"],
      availableFormats: ["interactive", "text"],
      interactiveVariant: activity(),
    });

    expect(seg.interactive).toBeDefined();
    expect(seg.modalities).toEqual(["text"]);
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

/*
 * SCRUM-273 (backend acc5b27; spec 22 Oct): `inProgress` and `outcome` are
 * the activity's two "what you should see" lines, each copied from the source
 * and each omitted when absent. `pending` is the line while the child works,
 * `done` the line once every step is ticked.
 */
describe("the activity's two lines", () => {
  const WHILE = "Watch the slice in salt water start to bend.";
  const DONE = "The slice in salt water is soft; the other is firm.";

  it("maps `inProgress` to the line while working and `outcome` to the line once done", () => {
    const seg = built({
      interactiveVariant: activity({ inProgress: WHILE, outcome: DONE }),
    });

    expect(seg.interactive?.outcome).toEqual({ pending: WHILE, done: DONE });
  });

  it("carries each line only when it was sent, and writes nothing in its place", () => {
    // Undefined is a line the server omitted, as it does for every absent one.
    const cases: [Record<string, unknown>, unknown][] = [
      [{ inProgress: WHILE, outcome: undefined }, { pending: WHILE }],
      [{ outcome: DONE }, { done: DONE }],
      [{ inProgress: "  ", outcome: DONE }, { done: DONE }],
      [{ inProgress: WHILE, outcome: null }, { pending: WHILE }],
      // Neither: no lines at all, not an empty pair.
      [{ outcome: undefined }, undefined],
      [{ inProgress: null, outcome: "" }, undefined],
    ];
    for (const [over, outcome] of cases) {
      const variant = activity(over) as Record<string, unknown>;
      for (const key of ["inProgress", "outcome"]) {
        if (variant[key] === undefined) delete variant[key];
      }
      const seg = built({ interactiveVariant: variant as never });

      if (outcome === undefined) expect(seg.interactive).not.toHaveProperty("outcome");
      else expect(seg.interactive?.outcome).toEqual(outcome);
    }
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

describe("an activity with a safety sentence carries it (SCRUM-280, SCRUM-288)", () => {
  /*
   * Lydia, 23 Oct: "an activity whose source has a safety sentence MUST NOT
   * RENDER AT ALL if the card can't display it". #853 held such an activity
   * back whole while the card had no designed place for the line. Frame
   * 1a3016b draws it - a FIRST row above the steps - so the activity is
   * offered again, and its line goes with it, word for word.
   */
  const LINE = "Let an adult do the cutting. Do not taste the salt water.";
  const safe = (safety: unknown) =>
    built({
      availableModalities: ["text", "visual", "interactive"],
      availableFormats: ["text", "interactive"],
      interactiveVariant: activity({
        safety,
      }),
    } as never);

  it("is built, with the server's line word for word", () => {
    const seg = safe(LINE);

    expect(seg.interactive?.steps).toHaveLength(3);
    expect(seg.interactive?.safety).toBe(LINE);
  });

  it("is in the format group again, and opens only when picked, like any activity", () => {
    const seg = safe(LINE);

    expect(seg.formats).toContain("interactive");
    expect(seg.formats).toContain("text");
    // Never what a section opens in with nothing picked (Lydia, 21 Oct).
    expect(seg.modalities).toEqual(["text"]);
  });

  it("keeps the line as written, only its outer spaces trimmed", () => {
    const seg = safe(`  ${LINE}\n`);

    expect(seg.interactive?.safety).toBe(LINE);
  });

  it("carries no line - nothing to stand in for one - when the sentence is empty or absent", () => {
    for (const safety of [null, undefined, "", "   "]) {
      const seg = safe(safety);
      expect(seg.interactive?.steps).toHaveLength(3);
      expect(seg.formats).toContain("interactive");
      expect(seg.interactive && "safety" in seg.interactive).toBe(false);
    }
  });
});
