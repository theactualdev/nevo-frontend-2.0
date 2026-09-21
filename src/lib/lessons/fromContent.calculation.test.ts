import { describe, expect, it } from "vitest";
import { lessonFromContent } from "./fromContent";
import type {
  LessonDetailResponse,
  LessonSegment as ContentSegment,
} from "@/lib/api/lessons";

/**
 * The co-construction solver, against real generated content.
 *
 * Nothing mapped `calculationVariant` until 16 Sep, so the player's
 * `segment.calculationVariant && segment.calculation` was false for every
 * lesson that had ever existed and the solver rendered as plain text. These
 * tests are written from the backend's own worked example, because the way to
 * get this wrong is specific and was called out when the fields landed:
 * mapping the VARIANT's answer onto every step renders "5" for all three steps
 * of `5x - 4 = 2x + 11`, where only the last one is right.
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
    hint: "Take 2x off each side.",
    confirmationText: "That is it.",
    visualUpdate: "left side changes",
    equationState: "3x - 4 = 11",
    answer: "3x - 4",
    options: [],
    unit: null,
    narrationAudio: null,
    ...over,
  }) as unknown as never;

/** The real JSS3 maths variant, as backend described it. */
const algebra = (over: Record<string, unknown> = {}) =>
  ({
    type: "linear_equation",
    fullEquation: "5x - 4 = 2x + 11",
    answer: "5",
    completionStatement: "You solved for x.",
    scaffoldImage: null,
    steps: [
      step(),
      step({
        stepId: "st-2",
        stepNumber: 2,
        prompt: "Add 4 to both sides. What is on the left?",
        answer: "3x",
        equationState: "3x = 15",
      }),
      step({
        stepId: "st-3",
        stepNumber: 3,
        prompt: "Divide both sides by 3. What is x?",
        expectedInput: "numeric",
        answer: 5,
        equationState: "x = 5",
      }),
    ],
    ...over,
  }) as unknown as never;

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

const calcOf = (seg: ContentSegment) => {
  const built = lessonFromContent(lesson(seg));
  if (!built) throw new Error("the adapter refused the whole lesson");
  const first = built.segments[0];
  if (!first) throw new Error("the adapter dropped the segment entirely");
  return first;
};

describe("a generated calculation", () => {
  it("gives every step ITS OWN answer, not the whole problem's", () => {
    const built = calcOf(segment({ calculationVariant: algebra() }));

    // The defect this exists to stop: "5" on all three.
    expect(built.calculation?.steps.map((s) => ("answer" in s ? s.answer : null)))
      .toEqual(["3x - 4", "3x", "5"]);
    // And the whole problem's answer is kept where it belongs.
    expect(built.calculation?.problem.answer).toBe("5");
  });

  it("keeps a numeric answer and a string answer both readable", () => {
    // Step 3's answer arrives as the NUMBER 5 and steps 1-2 as strings. A
    // fraction must survive the trip too.
    const built = calcOf(
      segment({
        calculationVariant: algebra({
          steps: [step({ answer: "3/4" }), step({ stepId: "st-2", expectedInput: "numeric", answer: 5 })],
        }),
      }),
    );

    const answers = built.calculation?.steps.map((s) =>
      "answer" in s ? s.answer : null,
    );
    expect(answers).toEqual(["3/4", "5"]);
  });

  it("opens the Interactive channel, which is what makes the solver reachable", () => {
    const built = calcOf(segment({ calculationVariant: algebra() }));

    expect(built.modalities).toContain("interactive");
    // Both halves, because the player gates on both.
    expect(built.calculationVariant).toBe("linear_equation");
    expect(built.calculation).toBeDefined();
  });

  it("carries the equation's opening state as well as each step's", () => {
    const built = calcOf(segment({ calculationVariant: algebra() }));

    expect(built.calculation?.equationStates).toEqual([
      "5x - 4 = 2x + 11",
      "3x - 4 = 11",
      "3x = 15",
      "x = 5",
    ]);
  });

  it("draws no scaffold, because generated content carries none", () => {
    const built = calcOf(segment({ calculationVariant: algebra() }));

    // `{kind, parts, rows}` is the authored fraction variant's shape and has
    // no counterpart on the wire. Bars built from numbers that mean something
    // else would be a picture of the child's problem that nobody authored.
    expect(built.calculation?.scaffold).toBeUndefined();
  });
});

describe("a calculation this app cannot honestly mark", () => {
  it("refuses the WHOLE variant when one step has no answer", () => {
    // Lessons parsed before the 0057 migration carry no step answers at all.
    const built = calcOf(
      segment({
        calculationVariant: algebra({
          steps: [step(), step({ stepId: "st-2", answer: null })],
        }),
      }),
    );

    // Half a solve walks a child into a locked door two steps in.
    expect(built.calculation).toBeUndefined();
    expect(built.calculationVariant).toBeUndefined();
    expect(built.modalities).not.toContain("interactive");
    // And the segment is still a lesson.
    expect(built.text?.body.default).toContain("letters");
  });

  it("refuses a selection step with fewer than two options", () => {
    const built = calcOf(
      segment({
        calculationVariant: algebra({
          steps: [
            step({
              expectedInput: "selection",
              answer: "a",
              options: [{ value: "a", label: "Only one" }],
            }),
          ],
        }),
      }),
    );

    expect(built.calculation).toBeUndefined();
  });

  it("refuses a selection whose answer matches none of its own options", () => {
    const built = calcOf(
      segment({
        calculationVariant: algebra({
          steps: [
            step({
              expectedInput: "selection",
              answer: "z",
              options: [
                { value: "a", label: "First" },
                { value: "b", label: "Second" },
              ],
            }),
          ],
        }),
      }),
    );

    expect(built.calculation).toBeUndefined();
  });

  it("refuses a drag step rather than turning it into multiple choice", () => {
    // Drag is a manipulative - the child builds the answer. Rendering it as
    // "pick one" is a different task and a different signal.
    const built = calcOf(
      segment({
        calculationVariant: algebra({
          steps: [
            step({
              expectedInput: "drag",
              answer: "a",
              options: [
                { value: "a", label: "First" },
                { value: "b", label: "Second" },
              ],
            }),
          ],
        }),
      }),
    );

    expect(built.calculation).toBeUndefined();
  });

  it("builds a selection step when it can be marked", () => {
    const built = calcOf(
      segment({
        calculationVariant: algebra({
          steps: [
            step({
              expectedInput: "selection",
              answer: "b",
              options: [
                { value: "a", label: "Take 2x off" },
                { value: "b", label: "Add 4" },
              ],
            }),
          ],
        }),
      }),
    );

    const first = built.calculation?.steps[0];
    expect(first).toMatchObject({
      choices: ["Take 2x off", "Add 4"],
      correct: 1,
    });
  });
});

describe("the manipulative a drag step is built on", () => {
  /**
   * §4: *"Backend supplies structure: kind, parts, rows. You render the
   * manipulative. Do not substitute a static scaffold image, because the
   * interaction is the mechanism."*
   *
   * The wire had no such structure until 21 Sep, so `drag` steps were refused
   * and the whole variant dropped to text - which meant §4's *"the one place
   * modalities layer rather than switch"* could not happen on any generated
   * lesson. `CalculationVariant.manipulative` is that structure.
   *
   * ONLY `fraction_bar` is drawn. The wire names five kinds and design has
   * drawn one of them; inventing the other four would be inventing four
   * interactions, and a wrong interaction is a different task rather than a
   * lesser version of the right one.
   */
  const fractionVariant = (over: Record<string, unknown> = {}) =>
    ({
      type: "fraction_add_like",
      fullEquation: "1/4 + 2/4",
      answer: "3/4",
      completionStatement: "You built three quarters.",
      scaffoldImage: null,
      manipulative: { kind: "fraction_bar", parts: 4, rows: 1, labels: [] },
      steps: [
        step({
          stepId: "d-1",
          stepNumber: 1,
          prompt: "Build the total.",
          expectedInput: "drag",
          answer: "3/4",
          equationState: "1/4 + 2/4 = ?",
        }),
      ],
      ...over,
    }) as unknown as never;

  const built = (variant: unknown) =>
    lessonFromContent(
      {
        id: "l-1",
        title: "Adding quarters",
        segments: [
          segment({
            contentType: "calculation",
            availableModalities: ["text", "interactive"],
            calculationVariant: variant as never,
          }),
        ],
      } as unknown as LessonDetailResponse,
      [],
    );

  const calcOf = (variant: unknown) => {
    const lesson = built(variant);
    if (!lesson) throw new Error("no lesson");
    return lesson.segments[0].calculation;
  };

  it("keeps the drag step instead of dropping the whole variant", () => {
    const calc = calcOf(fractionVariant());

    expect(calc?.steps).toHaveLength(1);
  });

  it("carries the parts and the target the tray needs", () => {
    const calc = calcOf(fractionVariant());

    expect(calc?.manipulative).toEqual({
      kind: "fraction_bar",
      parts: 4,
      target: 3,
    });
  });

  it("offers the kinesthetic layer only when there is one to offer", () => {
    // Compared against a variant that still BUILDS - a numeric-only one - so
    // the difference measured is the layer rather than the whole calculation
    // disappearing underneath it.
    const withIt = calcOf(fractionVariant());
    const without = calcOf(
      fractionVariant({
        manipulative: null,
        steps: [
          step({ stepId: "n-1", expectedInput: "numeric", answer: 3 }),
        ],
      }),
    );

    expect(withIt?.modalities).toContain("kinesthetic");
    expect(without?.steps).toHaveLength(1);
    expect(without?.modalities).not.toContain("kinesthetic");
  });

  it("reads a bare count as well as a fraction", () => {
    // "3" and "3/4" both mean three pieces of a four-part bar.
    const calc = calcOf(
      fractionVariant({
        steps: [
          step({
            stepId: "d-1",
            expectedInput: "drag",
            answer: "3",
          }),
        ],
      }),
    );

    expect(calc?.manipulative?.target).toBe(3);
  });

  it("draws none of the four kinds nobody has designed", () => {
    /*
     * A kind we cannot draw leaves the drag step with nothing to build on, so
     * it is refused - and a calculation missing a step is not a calculation,
     * which drops the whole variant to text. That cascade is the pre-existing
     * all-or-nothing rule and it is the honest outcome: better a lesson that
     * reads than one with an invented interaction in the middle of it.
     */
    for (const kind of ["number_line", "array", "place_value", "counters"]) {
      expect(
        calcOf(
          fractionVariant({
            manipulative: { kind, parts: 4, rows: 1, labels: [] },
          }),
        ),
        kind,
      ).toBeUndefined();
    }
  });

  it("refuses a target the bar cannot hold", () => {
    /*
     * Rule 3: the frontend computes no quantity of its own. An answer that is
     * not a whole number of pieces this bar can hold is not something to clamp
     * into one - there is nothing to build, so nothing is offered.
     */
    for (const answer of ["9/4", "0", "-1", "three", "3.5"]) {
      expect(
        calcOf(
          fractionVariant({
            steps: [step({ stepId: "d-1", expectedInput: "drag", answer })],
          }),
        ),
        answer,
      ).toBeUndefined();
    }
  });

  it("refuses a bar with no parts to divide", () => {
    expect(
      calcOf(
        fractionVariant({
          manipulative: { kind: "fraction_bar", parts: 0, rows: 1, labels: [] },
        }),
      ),
    ).toBeUndefined();
  });

  it("still refuses a drag step that nobody can be right about", () => {
    // Same rule numeric and text steps follow: a step with no answer cannot be
    // marked, so it is not drawn.
    expect(
      calcOf(
        fractionVariant({
          steps: [step({ stepId: "d-1", expectedInput: "drag", answer: null })],
        }),
      ),
    ).toBeUndefined();
  });
});
