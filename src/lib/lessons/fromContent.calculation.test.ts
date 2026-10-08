import { describe, expect, it } from "vitest";
import { calculationFromVariant, lessonFromContent } from "./fromContent";
import { ADD_FIFTHS, ADDING_FRACTIONS } from "@/lib/mocks/adding-fractions";
import type {
  LessonDetailResponse,
  LessonSegment as ContentSegment,
} from "@/lib/api/lessons";
import type { CalculationVariant } from "@/lib/api/variants";

/**
 * The co-construction solver's content, from SCRUM-177's payload.
 *
 * Every fixture here is shaped exactly like the deployed `CalculationVariant`
 * and `CalculationStep` (spec, 7 Oct): `input`, `targets` and `assembles` on
 * each step, `expression`, `conceptId` and `scaffold` on the variant. Nobody
 * can sign in to check a generated lesson actually carries them, so these are
 * the spec's shape and nothing more - backend is asked to confirm.
 *
 * The defects these exist to stop are specific: the variant's answer spread
 * across every step ("5" for all three steps of `5x - 4 = 2x + 11`), a number
 * read out of a fraction, and a drawing made from numbers that mean something
 * else.
 */

const segment = (over: Partial<ContentSegment> = {}): ContentSegment =>
  ({
    id: "seg-1",
    segmentKey: "s1",
    contentType: "calculation",
    sequenceOrder: 1,
    title: "Solving linear equations",
    body: "We move the letters to one side.",
    availableModalities: ["text"],
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

const step = (over: Record<string, unknown> = {}) =>
  ({
    stepId: "st-1",
    stepNumber: 1,
    prompt: "Subtract 2x from both sides. What is on the left?",
    expectedInput: "text",
    input: "number",
    hint: "Take 2x off each side.",
    confirmationText: "That is it.",
    visualUpdate: "left side changes",
    assembles: "? = 11",
    equationState: "3x - 4 = 11",
    answer: "3x - 4",
    targets: [],
    options: [],
    unit: null,
    narrationAudio: null,
    ...over,
  }) as unknown as never;

/** The JSS3 maths variant backend described, in SCRUM-177's shape. */
const algebra = (over: Record<string, unknown> = {}) =>
  ({
    type: "co_construction",
    conceptId: null,
    fullEquation: "5x - 4 = 2x + 11",
    expression: "5x - 4 = 2x + 11",
    answer: "5",
    completionStatement: "You solved for x.",
    scaffold: null,
    manipulative: null,
    steps: [
      step(),
      step({
        stepId: "st-2",
        stepNumber: 2,
        prompt: "Add 4 to both sides. What is on the left?",
        answer: "3x",
        assembles: "? = 15",
        equationState: "3x = 15",
      }),
      step({
        stepId: "st-3",
        stepNumber: 3,
        prompt: "Divide both sides by 3. What is x?",
        expectedInput: "numeric",
        answer: 5,
        assembles: "x = ?",
        equationState: "x = 5",
      }),
    ],
    ...over,
  }) as unknown as CalculationVariant;

const lesson = (seg: ContentSegment): LessonDetailResponse =>
  ({
    id: "l-1",
    title: "Solving Linear Equations",
    status: "completed",
    sourceType: "pdf",
    segmentCount: 1,
    reviewSegmentCount: 0,
    createdAt: "2026-09-16T09:00:00Z",
    confirmationSummary: null,
    segments: [seg],
    modules: [],
  }) as unknown as LessonDetailResponse;

const segmentOf = (variant: CalculationVariant) => {
  const built = lessonFromContent(
    lesson(segment({ calculationVariant: variant })),
  );
  if (!built) throw new Error("the adapter refused the whole lesson");
  return built.segments[0];
};

const calcOf = (variant: CalculationVariant) =>
  segmentOf(variant).calculation;

describe("a calculation from the payload", () => {
  it("gives every step ITS OWN stored answers, never the whole problem's", () => {
    const calc = calcOf(algebra());

    // The defect this exists to stop: "5" on all three.
    expect(
      calc?.steps.map((s) => (s.input === "number" ? s.accepted : null)),
    ).toEqual([["3x - 4"], ["3x"], ["5"]]);
  });

  it("stores every acceptable form the pipeline wrote, answer first", () => {
    const calc = calcOf(
      algebra({ steps: [step({ answer: "x + 1", targets: ["1 + x", 1.5] })] }),
    );

    expect(calc?.steps[0]).toMatchObject({ accepted: ["x + 1", "1 + x", "1.5"] });
  });

  it("opens the Interactive channel, tagged as the payload tags it", () => {
    const built = segmentOf(algebra());

    expect(built.modalities).toContain("interactive");
    // Both halves, because the player gates on both.
    expect(built.calculationVariant).toBe("co_construction");
    expect(built.calculation).toBeDefined();
  });

  it("carries each step's assembling equation and where it leaves it", () => {
    const calc = calcOf(algebra());

    expect(calc?.expression).toBe("5x - 4 = 2x + 11");
    expect(calc?.steps.map((s) => [s.assembles, s.equationState])).toEqual([
      ["? = 11", "3x - 4 = 11"],
      ["? = 15", "3x = 15"],
      ["x = ?", "x = 5"],
    ]);
  });

  it("gives an expression the device keyboard and a number the Nevo pad", () => {
    const calc = calcOf(algebra());

    expect(
      calc?.steps.map((s) => (s.input === "number" ? s.entry : null)),
    ).toEqual(["text", "text", "numeric"]);
  });

  it("carries the concept and a step's narration where the payload has them", () => {
    const calc = calcOf(
      algebra({
        conceptId: "c-1",
        steps: [
          step({
            narrationAudio: {
              audioUrl: "https://cdn.example/s1.mp3",
              storagePath: "audio/s1.mp3",
            },
          }),
        ],
      }),
    );

    expect(calc?.conceptId).toBe("c-1");
    expect(calc?.steps[0].narration).toEqual({
      src: "https://cdn.example/s1.mp3",
      storagePath: "audio/s1.mp3",
    });
  });

  it("builds a choice whose stored answer is one of its options", () => {
    const calc = calcOf(
      algebra({
        steps: [
          step({
            input: "choice",
            expectedInput: "selection",
            answer: "b",
            options: [
              { value: "a", label: "Take 2x off" },
              { value: "b", label: "Add 4" },
            ],
          }),
        ],
      }),
    );

    expect(calc?.steps[0]).toMatchObject({
      input: "choice",
      options: [
        { value: "a", label: "Take 2x off" },
        { value: "b", label: "Add 4" },
      ],
      accepted: ["b"],
      confirm: "That is it.",
    });
  });

  it("builds a choice whose right option is named by a target, not the answer", () => {
    const calc = calcOf(
      algebra({
        steps: [
          step({
            input: "choice",
            answer: null,
            targets: ["b"],
            options: [
              { value: "a", label: "First" },
              { value: "b", label: "Second" },
            ],
          }),
        ],
      }),
    );

    expect(calc?.steps[0]).toMatchObject({ input: "choice", accepted: ["b"] });
  });

  it("builds the signed-out walkthrough's calculation through this same path", () => {
    const calc = ADDING_FRACTIONS.segments.find((s) => s.calculation)?.calculation;

    expect(calc).toEqual(calculationFromVariant(ADD_FIFTHS));
    expect(calc?.steps.map((s) => s.input)).toEqual(["choice", "choice", "number"]);
    expect(calc?.scaffold?.kind).toBe("bar");
    // Its result row is written down and revealed by its last step.
    expect(calc?.steps[2].highlights).toContainEqual({
      target: "3/5",
      role: "result",
    });
  });

  it("carries the solved equation apart from the problem, never in its place", () => {
    // B101: `fullEquation` is the complete solved equation, for the end.
    expect(calcOf(algebra({ fullEquation: "x = 5" }))).toMatchObject({
      expression: "5x - 4 = 2x + 11",
      fullEquation: "x = 5",
    });
    // A problem with no notation shows none - not the answer.
    expect(
      calcOf(algebra({ expression: undefined, fullEquation: "x = 5" })),
    ).toMatchObject({ expression: "", fullEquation: "x = 5" });
  });

  it("carries each step's highlights, a role left out reading as active", () => {
    const calc = calcOf(
      algebra({
        steps: [
          step({
            highlights: [
              { target: " 3x " },
              { target: "11", role: "source" },
              { target: "x = 5", role: "result" },
            ],
          }),
        ],
      }),
    );

    expect(calc?.steps[0].highlights).toEqual([
      { target: "3x", role: "active" },
      { target: "11", role: "source" },
      { target: "x = 5", role: "result" },
    ]);
  });

  it("drops a highlight that names nothing or plays a role the spec does not name", () => {
    const calc = calcOf(
      algebra({
        steps: [
          step({
            highlights: [{ target: "  " }, { target: "3x", role: "glow" }],
          }),
          step({ stepId: "st-2", highlights: undefined }),
        ],
      }),
    );

    expect(calc?.steps.map((s) => s.highlights)).toEqual([[], []]);
  });
});

describe("a calculation this app cannot honestly draw or mark", () => {
  it("refuses a step that names no input, rather than guessing one", () => {
    // Content stored before SCRUM-177 has `expectedInput` and no `input`.
    // What kind of answer it is does not say what the child does to give it.
    const built = segmentOf(algebra({ steps: [step({ input: undefined })] }));

    expect(built.calculation).toBeUndefined();
    expect(built.modalities).not.toContain("interactive");
  });

  it("refuses the WHOLE variant when one step has nothing stored", () => {
    const built = segmentOf(
      algebra({
        steps: [step(), step({ stepId: "st-2", answer: null, targets: [] })],
      }),
    );

    // Half a solve walks a child into a locked door two steps in.
    expect(built.calculation).toBeUndefined();
    expect(built.calculationVariant).toBeUndefined();
    expect(built.modalities).not.toContain("interactive");
    // And the segment is still a lesson.
    expect(built.text?.body.default).toContain("letters");
  });

  it("refuses a choice with fewer than two options", () => {
    expect(
      calcOf(
        algebra({
          steps: [
            step({
              input: "choice",
              answer: "a",
              options: [{ value: "a", label: "Only one" }],
            }),
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it("refuses a choice whose stored answers name none of its options", () => {
    expect(
      calcOf(
        algebra({
          steps: [
            step({
              input: "choice",
              answer: "z",
              targets: ["y"],
              options: [
                { value: "a", label: "First" },
                { value: "b", label: "Second" },
              ],
            }),
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it("refuses an empty variant", () => {
    expect(calcOf(algebra({ steps: [] }))).toBeUndefined();
  });
});

describe("a tap step and what it builds on", () => {
  /**
   * §4: *"Backend supplies structure: kind, parts, rows. You render the
   * manipulative. Do not substitute a static scaffold image, because the
   * interaction is the mechanism."* Only `fraction_bar` has a frame (17b).
   */
  const quarters = (over: Record<string, unknown> = {}) =>
    algebra({
      expression: "1/4 + 2/4",
      manipulative: { kind: "fraction_bar", parts: 4, rows: 1, labels: [] },
      steps: [
        step({
          stepId: "d-1",
          prompt: "Build the total.",
          expectedInput: "drag",
          input: "tap",
          answer: "3/4",
          tapCount: 3,
          assembles: "1/4 + 2/4 = ?",
          equationState: "1/4 + 2/4 = 3/4",
        }),
      ],
      ...over,
    });

  it("builds the step's tapCount of pieces on the bar", () => {
    const calc = calcOf(quarters());

    expect(calc?.manipulative).toEqual({ kind: "fraction_bar", parts: 4 });
    expect(calc?.steps[0]).toMatchObject({ input: "tap", target: 3 });
  });

  it("takes the count from tapCount, never from the answer", () => {
    // B102. The answer says what the total is, not how many taps build it.
    const calc = calcOf(
      quarters({
        steps: [step({ input: "tap", answer: "2", targets: [2], tapCount: 3 })],
      }),
    );

    expect(calc?.steps[0]).toMatchObject({ input: "tap", target: 3 });
  });

  it("refuses a tap step with no tapCount, whatever its answer says", () => {
    /*
     * Rule 3, and B102. A count read out of "3" or "3/4" would be this app
     * deciding how many pieces the answer means.
     */
    for (const answer of ["3", "3/4"]) {
      expect(
        calcOf(quarters({ steps: [step({ input: "tap", answer })] })),
        answer,
      ).toBeUndefined();
    }
  });

  it("refuses a count the bar cannot hold, rather than clamping it", () => {
    for (const tapCount of [5, 0, -1, 3.5, null, "3"]) {
      expect(
        calcOf(quarters({ steps: [step({ input: "tap", tapCount })] })),
        String(tapCount),
      ).toBeUndefined();
    }
  });

  it("refuses a tap step with nothing to build on", () => {
    expect(calcOf(quarters({ manipulative: null }))).toBeUndefined();
  });

  it("draws none of the four manipulative kinds nobody has designed", () => {
    for (const kind of ["number_line", "array", "place_value", "counters"]) {
      expect(
        calcOf(quarters({ manipulative: { kind, parts: 4, rows: 1 } })),
        kind,
      ).toBeUndefined();
    }
  });

  it("refuses a bar with no parts to divide", () => {
    expect(
      calcOf(quarters({ manipulative: { kind: "fraction_bar", parts: 0 } })),
    ).toBeUndefined();
  });
});

describe("the scaffold drawing", () => {
  const drawn = (scaffold: unknown) => calcOf(algebra({ scaffold }))?.scaffold;

  it("draws a bar for each physical row, a mark to each (B100)", () => {
    expect(
      drawn({
        kind: "bar",
        parts: 5,
        rows: 2,
        marks: [3, 1],
        labels: ["3/5", "1/5"],
      }),
    ).toEqual({
      kind: "bar",
      parts: 5,
      quantities: [
        { count: 3, label: "3/5" },
        { count: 1, label: "1/5" },
      ],
    });
  });

  it("does not lay two quantities on one bar, which no frame draws", () => {
    /*
     * SCRUM-177's own example, `rows: 1` beside two marks. `rows` is the
     * physical row count (B100), so this is one bar holding 3 and 1 - and
     * drawing them as two bars is what #697 did by not reading `rows`.
     */
    expect(
      drawn({ kind: "bar", parts: 5, rows: 1, marks: [3, 1], labels: ["3/5", "1/5"] }),
    ).toBeUndefined();
    // Left out, `rows` is 1, as the spec defaults it.
    expect(drawn({ kind: "bar", parts: 5, marks: [3, 1] })).toBeUndefined();
    expect(drawn({ kind: "bar", parts: 5, rows: 3, marks: [3, 1] })).toBeUndefined();
  });

  it("draws dots and a line on one row only, as 37c does", () => {
    expect(drawn({ kind: "dots", parts: 1, rows: 2, marks: [3, 4] })).toBeUndefined();
    expect(
      drawn({ kind: "number_line", parts: 4, rows: 2, marks: [3] }),
    ).toBeUndefined();
  });

  it("draws nothing when the payload carries no scaffold", () => {
    // Absence is the instruction. Nothing is inferred from the notation.
    expect(drawn(null)).toBeUndefined();
    expect(drawn(undefined)).toBeUndefined();
  });

  it("reads grouped dots and a number line the same way", () => {
    expect(drawn({ kind: "dots", parts: 1, marks: [3, 4] })).toEqual({
      kind: "dots",
      quantities: [{ count: 3 }, { count: 4 }],
    });
    expect(
      drawn({ kind: "number_line", parts: 4, marks: ["3"], labels: ["3"] }),
    ).toEqual({ kind: "number_line", parts: 4, points: [{ count: 3, label: "3" }] });
  });

  it("draws no kind that has no frame", () => {
    for (const kind of ["array", "place_value"]) {
      expect(drawn({ kind, parts: 4, rows: 3, marks: [2] }), kind).toBeUndefined();
    }
  });

  it("draws nothing it would have to reinterpret", () => {
    const cases = {
      "a fractional mark": { kind: "bar", parts: 4, marks: [2.5] },
      "more than the bar holds": { kind: "bar", parts: 4, marks: [7] },
      "a mark that is not a count": { kind: "bar", parts: 4, marks: ["3/4"] },
      // B100 lets labels pair with parts, but a line of four parts has five
      // ticks, and nothing says which tick a label belongs to.
      "labels that do not pair with the marks": {
        kind: "number_line",
        parts: 4,
        marks: [3],
        labels: ["0", "1", "2", "3", "4"],
      },
      "labels paired with a bar's cells, which no frame labels": {
        kind: "bar",
        parts: 4,
        marks: [3],
        labels: ["1", "2", "3", "4"],
      },
      "no marks at all": { kind: "bar", parts: 4, marks: [] },
    };
    for (const [why, scaffold] of Object.entries(cases)) {
      expect(drawn(scaffold), why).toBeUndefined();
    }
  });

  it("keeps the calculation when only its drawing is refused", () => {
    // The steps are the mechanism; the drawing is beside them.
    const calc = calcOf(
      algebra({ scaffold: { kind: "bar", parts: 4, marks: [9] } }),
    );

    expect(calc?.steps).toHaveLength(3);
    expect(calc?.scaffold).toBeUndefined();
  });
});
