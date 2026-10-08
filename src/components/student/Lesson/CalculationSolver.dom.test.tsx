import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CalculationSolver } from "./CalculationSolver";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import type { CalculationVariant } from "@/lib/api/variants";
import type { CalculationSegment } from "@/lib/types";

/**
 * The calculation player, rendered from SCRUM-177's payload (SCRUM-181).
 *
 * Fixtures are the wire's own shape, run through the real adapter. What these
 * hold the screen to: one step at a time, the equation the payload wrote and
 * nothing it did not, a step judged only against what the pipeline stored,
 * each step taking the input it names, and no hint the screen decided on.
 */

afterEach(cleanup);

const step = (over: Record<string, unknown> = {}) => ({
  stepId: "s1",
  stepNumber: 1,
  prompt: "What are the denominators?",
  expectedInput: "selection",
  input: "choice",
  options: [
    { value: "4 and 4", label: "4 and 4" },
    { value: "1 and 2", label: "1 and 2" },
  ],
  answer: "4 and 4",
  targets: [],
  hint: "Look at the bottom number of each fraction.",
  confirmationText: "Both denominators are 4.",
  visualUpdate: "",
  assembles: "1/4 + 2/4 = ?",
  equationState: "1/4 + 2/4 = ?/4",
  unit: null,
  narrationAudio: null,
  ...over,
});

const QUARTERS = {
  type: "co_construction",
  conceptId: "c-1",
  fullEquation: "1/4 + 2/4 = 3/4",
  expression: "1/4 + 2/4",
  answer: "3/4",
  scaffold: {
    kind: "bar",
    parts: 4,
    // B100: the physical row count, one bar for each mark.
    rows: 2,
    marks: [1, 2],
    labels: ["1/4", "2/4"],
  },
  manipulative: { kind: "fraction_bar", parts: 4, rows: 1, labels: [] },
  steps: [
    step(),
    step({
      stepId: "s2",
      prompt: "What do we add together?",
      options: [
        { value: "tops", label: "The numerators: 1 and 2" },
        { value: "bottoms", label: "The denominators: 4 and 4" },
      ],
      answer: "tops",
      confirmationText: "",
      hint: "",
      assembles: "1/4 + 2/4 = ?/4",
      equationState: "1/4 + 2/4 = ?/4",
    }),
    step({
      stepId: "s3",
      prompt: "So what is 1 + 2?",
      expectedInput: "numeric",
      input: "number",
      options: [],
      answer: "3",
      targets: ["3.0"],
      hint: "Just add the two top numbers.",
      assembles: "1 + 2 = ?",
      equationState: "1/4 + 2/4 = 3/4",
    }),
  ],
  completionStatement: "When fractions share a denominator, add the numerators.",
};

const build = (over: Record<string, unknown> = {}): CalculationSegment => {
  const calc = calculationFromVariant({
    ...QUARTERS,
    ...over,
  } as unknown as CalculationVariant);
  if (!calc) throw new Error("the fixture did not build");
  return calc;
};

const show = (calc: CalculationSegment = build(), reading = false) => {
  const props = {
    onSolved: vi.fn(),
    onStepAnswered: vi.fn(),
    onPiecePlaced: vi.fn(),
    onHintOpened: vi.fn(),
  };
  render(
    <CalculationSolver calculation={calc} reading={reading} {...props} />,
  );
  return props;
};

const tap = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));
const pick = (label: string) => {
  tap(label);
  tap("Check my answer");
};
/** One piece off the tray - they are all the same piece. */
const placeOne = () =>
  fireEvent.click(screen.getAllByRole("button", { name: "+ 1/4" })[0]);
const equation = () =>
  document.querySelector('[aria-live="polite"]')?.textContent ?? "";

describe("one step at a time", () => {
  it("shows only the step being asked, never the steps to come", () => {
    show();

    expect(screen.getByText("What are the denominators?")).toBeInTheDocument();
    expect(screen.queryByText("What do we add together?")).toBeNull();
    expect(screen.queryByText("So what is 1 + 2?")).toBeNull();
  });

  it("assembles the equation from the payload's own strings as the child goes", () => {
    const props = show();
    expect(equation()).toBe("1/4 + 2/4 = ?");

    pick("4 and 4");
    // Confirmed: where step 1 leaves the equation.
    expect(equation()).toBe("1/4 + 2/4 = ?/4");
    expect(screen.getByText("Both denominators are 4.")).toBeInTheDocument();

    tap("Next step");
    pick("The numerators: 1 and 2");
    // Step 3 is asked in its own assembling form, as 17b draws it.
    expect(equation()).toBe("1 + 2 = ?");

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3" } });
    tap("Check my answer");

    // The solution as the payload wrote it - never the screen's own sum.
    expect(equation()).toBe("1/4 + 2/4 = 3/4");
    expect(
      screen.getByText("When fractions share a denominator, add the numerators."),
    ).toBeInTheDocument();
    expect(props.onSolved).toHaveBeenCalledTimes(1);
  });

  it("falls back to the problem's notation, never to the worked equation", () => {
    show(build({ steps: [step({ assembles: "" })] }));

    expect(equation()).toBe("1/4 + 2/4");
  });

  it("shows the solved equation once every step is done, and never before", () => {
    // B101. The last step leaves the equation one way; `fullEquation` is the
    // complete solved one, and it is the screen's last line.
    const calc = build({
      fullEquation: "1/4 + 2/4 = 3/4, so three quarters",
      steps: [
        step({ confirmationText: "" }),
        QUARTERS.steps[2],
      ],
    });
    show(calc);
    const seen = [equation()];

    pick("4 and 4");
    seen.push(equation());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3" } });
    tap("Check my answer");

    expect(seen).not.toContain("1/4 + 2/4 = 3/4, so three quarters");
    expect(equation()).toBe("1/4 + 2/4 = 3/4, so three quarters");
  });

  it("never stands the solved equation in for a missing problem", () => {
    // It used to, on content stored before `expression`: the answer, shown
    // before the first step.
    show(build({ expression: undefined, steps: [step({ assembles: "" })] }));

    expect(equation()).toBe("");
  });
});

describe("judging a step", () => {
  it("names the step it answered", () => {
    const props = show();

    pick("1 and 2");
    pick("4 and 4");

    expect(props.onStepAnswered.mock.calls).toEqual([
      ["s1", false],
      ["s1", true],
    ]);
  });

  it("accepts any form the pipeline stored for a typed step", () => {
    const props = show(build({ steps: [QUARTERS.steps[2]] }));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3.0" } });
    tap("Check my answer");

    expect(props.onStepAnswered).toHaveBeenCalledWith("s3", true);
    expect(props.onSolved).toHaveBeenCalled();
  });

  it("does not work out an answer the pipeline did not store", () => {
    const props = show(build({ steps: [QUARTERS.steps[2]] }));

    // Three, written another way. Equal is not the same as stored.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "6/2" } });
    tap("Check my answer");

    expect(props.onStepAnswered).toHaveBeenCalledWith("s3", false);
    expect(props.onSolved).not.toHaveBeenCalled();
    // A miss keeps the step on screen, and keeps what the child typed.
    expect(screen.getByRole("textbox")).toHaveValue("6/2");
  });
});

describe("the hint", () => {
  it("never appears because the child missed - that is the engine's call", () => {
    const props = show();

    pick("1 and 2");
    tap("Check my answer");
    tap("Check my answer");

    expect(props.onStepAnswered).toHaveBeenCalledTimes(3);
    expect(
      screen.queryByText("Look at the bottom number of each fraction."),
    ).toBeNull();
    expect(props.onHintOpened).not.toHaveBeenCalled();
  });

  it("opens this step's hint when the child asks for it", () => {
    const props = show();

    tap("Need a hint?");

    expect(
      screen.getByText("Look at the bottom number of each fraction."),
    ).toBeInTheDocument();
    expect(props.onHintOpened).toHaveBeenCalledWith("s1");
    expect(screen.queryByRole("button", { name: "Need a hint?" })).toBeNull();
  });

  it("offers no hint on a step that has none", () => {
    show(build({ steps: [QUARTERS.steps[1]] }));

    expect(screen.queryByRole("button", { name: "Need a hint?" })).toBeNull();
  });
});

describe("entering a number (D150)", () => {
  const NEGATIVE = () =>
    build({
      steps: [step({ input: "number", expectedInput: "numeric", answer: "-2.5" })],
    });
  const pad = () => screen.queryByRole("group", { name: "On-screen keyboard" });

  it("takes the Nevo pad, with a minus sign and a point, in place of the device's", () => {
    show(NEGATIVE());

    // The device's own keyboard is suppressed: an iPhone's has no minus.
    expect(screen.getByRole("textbox")).toHaveAttribute("inputmode", "none");
    expect(pad()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Minus sign" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Point" })).toBeInTheDocument();
    expect(screen.getByText("Your answer")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Type the number you worked out. You can use a minus sign or a point.",
      ),
    ).toBeInTheDocument();
  });

  it("types a negative decimal on the pad and matches it", () => {
    const props = show(NEGATIVE());

    for (const key of ["Minus sign", "2", "Point", "5"]) tap(key);

    // Drawn with the minus sign, kept as the hyphen the answer is stored with.
    expect(screen.getByRole("textbox")).toHaveValue("\u22122.5");
    tap("Check my answer");
    expect(props.onStepAnswered).toHaveBeenCalledWith("s1", true);
  });

  it("keeps a laptop's own typing", () => {
    const props = show(NEGATIVE());

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "-2.5" } });
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);

    expect(props.onStepAnswered).toHaveBeenCalledWith("s1", true);
  });

  it("keeps the hyphen when a laptop types on after the pad's minus sign", () => {
    const props = show(NEGATIVE());
    tap("Minus sign");
    tap("2");

    // The field now reads "−2"; typing ".5" after it hands back "−2.5".
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "\u22122.5" },
    });
    tap("Check my answer");

    expect(props.onStepAnswered).toHaveBeenCalledWith("s1", true);
  });

  it("deletes at the field, and only once there is something to delete", () => {
    show(NEGATIVE());
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();

    tap("2");
    tap("5");
    tap("Delete");

    expect(screen.getByRole("textbox")).toHaveValue("2");
    // The pad itself has no delete key.
    expect(pad()?.querySelector('[aria-label="Delete"]')).toBeNull();
  });

  it("gives an expression the full keyboard, and no pad", () => {
    show(build({ steps: [step({ input: "number", expectedInput: "text", answer: "3x - 4" })] }));

    expect(screen.getByRole("textbox")).toHaveAttribute("inputmode", "text");
    expect(pad()).toBeNull();
  });
});

describe("building with pieces", () => {
  const BUILD = step({
    stepId: "b1",
    prompt: "Build the total.",
    expectedInput: "drag",
    input: "tap",
    options: [],
    // B102: how many pieces is `tapCount`, never read out of the answer.
    answer: "3/4",
    tapCount: 3,
  });

  it("offers the stored count of pieces and says each one placed", () => {
    const props = show(build({ steps: [BUILD] }));

    expect(screen.getAllByRole("button", { name: "+ 1/4" })).toHaveLength(3);
    placeOne();

    expect(props.onPiecePlaced).toHaveBeenCalledWith("b1");
    expect(screen.getAllByRole("button", { name: "+ 1/4" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "That's the total" })).toBeNull();
  });

  it("finishes once the bar holds the stored count", () => {
    const props = show(build({ steps: [BUILD] }));

    for (let i = 0; i < 3; i++) placeOne();
    tap("That's the total");

    expect(props.onPiecePlaced).toHaveBeenCalledTimes(3);
    expect(props.onStepAnswered).toHaveBeenCalledWith("b1", true);
    expect(props.onSolved).toHaveBeenCalled();
  });
});

describe("the drawing", () => {
  it("draws the payload's bars with the values it was given", () => {
    show();

    expect(screen.getByText("Picture it")).toBeInTheDocument();
    expect(screen.getByText("1/4")).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
    const rows = document.querySelectorAll("[aria-hidden].flex.flex-1");
    expect(rows).toHaveLength(2);
    const filled = [...rows].map(
      (r) => r.querySelectorAll(".bg-nevo-violet").length,
    );
    expect(filled).toEqual([1, 2]);
    // Four cells a row: `parts`, as given.
    expect(rows[0].children).toHaveLength(4);
  });

  it("draws nothing when the payload carries no drawing", () => {
    show(build({ scaffold: null }));

    expect(screen.queryByText("Picture it")).toBeNull();
    // The notation stays: it never depended on the drawing.
    expect(equation()).toBe("1/4 + 2/4 = ?");
  });

  it("adds no result row the payload did not write - its count would be the screen's sum", () => {
    show(build({ steps: [QUARTERS.steps[2]] }));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3" } });
    tap("Check my answer");

    expect(document.querySelectorAll("[aria-hidden].flex.flex-1")).toHaveLength(2);
    expect(screen.queryByText("3/4")).toBeNull();
  });
});

describe("what each answered step does to the drawing (B107)", () => {
  /**
   * 17b's choreography as the payload names it: step 1's answer rings both
   * bars, step 2's turns them navy, and step 3's fills the result row the
   * scaffold carries as its third mark.
   */
  const CHOREOGRAPHED = () =>
    build({
      scaffold: {
        kind: "bar",
        parts: 4,
        rows: 3,
        marks: [1, 2, 3],
        labels: ["1/4", "2/4", "3/4"],
      },
      steps: [
        step({
          highlights: [{ target: "1/4" }, { target: "2/4", role: "active" }],
        }),
        step({
          ...QUARTERS.steps[1],
          highlights: [
            { target: "1/4", role: "source" },
            { target: "2/4", role: "source" },
          ],
        }),
        step({
          ...QUARTERS.steps[2],
          highlights: [
            { target: "1/4", role: "source" },
            { target: "2/4", role: "source" },
            { target: "3/4", role: "result" },
          ],
        }),
      ],
    });
  const bars = () => [
    ...document.querySelectorAll<HTMLElement>("[aria-hidden].flex.flex-1"),
  ];
  const ringed = () =>
    bars().map((b) => b.querySelectorAll(".outline-nevo-violet").length > 0);
  const navy = () => bars().map((b) => b.querySelectorAll(".bg-nevo-navy").length);

  it("draws nothing of a step's highlights while it is still being asked", () => {
    show(CHOREOGRAPHED());

    expect(ringed()).toEqual([false, false]);
    expect(navy()).toEqual([0, 0]);
  });

  it("rings what the answered step's active highlights name", () => {
    show(CHOREOGRAPHED());

    pick("4 and 4");
    expect(ringed()).toEqual([true, true]);

    // Still ringed while the next step is asked: step 1 is the last answered.
    tap("Next step");
    expect(ringed()).toEqual([true, true]);
  });

  it("turns what a source highlight names navy, and the ring goes", () => {
    show(CHOREOGRAPHED());
    pick("4 and 4");
    tap("Next step");

    pick("The numerators: 1 and 2");

    expect(ringed()).toEqual([false, false]);
    expect(navy()).toEqual([1, 2]);
  });

  it("keeps the result back until the step that names it is answered", () => {
    show(CHOREOGRAPHED());
    pick("4 and 4");
    tap("Next step");
    pick("The numerators: 1 and 2");

    // On the last step, the answer is not on screen yet.
    expect(screen.queryByText("3/4")).toBeNull();
    expect(bars()).toHaveLength(2);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3" } });
    tap("Check my answer");

    expect(screen.getByText("3/4")).toHaveClass("text-nevo-navy");
    expect(bars()).toHaveLength(3);
    expect(navy()).toEqual([1, 2, 3]);
  });

  it("names nothing that is not one of the drawing's own labels", () => {
    show(
      build({
        steps: [
          step({
            confirmationText: "",
            highlights: [{ target: "denominators" }, { target: "1/4 " }],
          }),
          QUARTERS.steps[2],
        ],
      }),
    );

    pick("4 and 4");

    // "1/4 " is trimmed to a label; "denominators" names nothing drawn.
    expect(ringed()).toEqual([true, false]);
  });

  it("turns nothing navy just because the solve finished", () => {
    // 17b's complete state is navy because step 2 made it so; a payload with
    // no highlights says nothing changed, and nothing does.
    show(build({ steps: [QUARTERS.steps[2]] }));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3" } });
    tap("Check my answer");

    expect(navy()).toEqual([0, 0]);
    expect(ringed()).toEqual([false, false]);
  });
});

describe("the narration layer", () => {
  /*
   * jsdom implements no playback, so `play` is stubbed and the element's own
   * events stand in for the browser's - as in `SpokenPrompt`'s tests.
   */
  const play = vi.fn();
  beforeEach(() => {
    play.mockReset().mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const clip = (n: number) => ({
    audioUrl: `https://cdn.example/step-${n}.mp3`,
    storagePath: null,
  });
  const narrated = () =>
    build({
      steps: [
        // No confirmation, so a right pick moves straight to the next step.
        step({ narrationAudio: clip(1), confirmationText: "" }),
        step({
          stepId: "s2",
          prompt: "What do we add together?",
          confirmationText: "",
          narrationAudio: clip(2),
        }),
        step({ stepId: "s3", prompt: "So what is 1 + 2?", narrationAudio: null }),
      ],
    });
  const audio = () => document.querySelector("audio");
  const listen = (props: Record<string, unknown>) =>
    render(
      <CalculationSolver
        calculation={narrated()}
        onSolved={vi.fn()}
        {...props}
      />,
    );

  it("plays this step's own recording, and only when asked", () => {
    listen({});

    expect(audio()?.getAttribute("src")).toBe("https://cdn.example/step-1.mp3");
    // Sound nobody asked for is not this layer's to start.
    expect(audio()?.autoplay).toBe(false);
    expect(screen.getByText("Read this step aloud")).toBeInTheDocument();

    tap("Play narration");
    expect(play).toHaveBeenCalled();
  });

  it("reads each next step as it arrives once the child is listening", () => {
    listen({});
    fireEvent.play(audio()!);

    pick("4 and 4");

    expect(audio()?.getAttribute("src")).toBe("https://cdn.example/step-2.mp3");
    expect(audio()?.autoplay).toBe(true);
  });

  it("draws no bar for a step with no recording", () => {
    listen({});
    pick("4 and 4");
    pick("4 and 4");

    expect(screen.getByText("So what is 1 + 2?")).toBeInTheDocument();
    expect(audio()).toBeNull();
    expect(screen.queryByRole("button", { name: "Play narration" })).toBeNull();
  });

  it("says narration started once, a restart is a replay, and the wait is the system's", () => {
    const onNarrationPlayed = vi.fn();
    const onReplay = vi.fn();
    const onAudioBusy = vi.fn();
    listen({ onNarrationPlayed, onReplay, onAudioBusy });

    fireEvent.play(audio()!);
    fireEvent.ended(audio()!);
    tap("Play narration");
    fireEvent.play(audio()!);

    expect(onNarrationPlayed).toHaveBeenCalledTimes(1);
    expect(onReplay).toHaveBeenCalledTimes(1);
    expect(onAudioBusy.mock.calls).toEqual([["start"], ["end"], ["start"]]);
  });
});

describe("reading support (D30)", () => {
  /** `READING_BODY` and `READING_HEADING`, as the checks carry them. */
  const BODY = ["text-[18px]", "leading-[2]", "tracking-[0.02em]"];
  const HEADING = "tracking-[0.01em]";
  const notation = () => document.querySelector('[aria-live="polite"] > div');
  const DONE_WITH_UNIT = build({
    steps: [
      step({
        input: "number",
        expectedInput: "numeric",
        options: [],
        answer: "3",
        unit: "quarters",
      }),
    ],
  });

  it("reaches every line the child reads, with the accommodation on", () => {
    show(build(), true);

    expect(screen.getByText("What are the denominators?")).toHaveClass(HEADING);
    // The notation keeps its size and takes the heading's spacing only.
    expect(notation()).toHaveClass(HEADING);
    expect(notation()).not.toHaveClass("leading-[2]");
    expect(screen.getByRole("button", { name: "4 and 4" })).toHaveClass(...BODY);
    expect(screen.getByText("1/4")).toHaveClass(...BODY);

    tap("Need a hint?");
    expect(
      screen.getByText("Look at the bottom number of each fraction."),
    ).toHaveClass(...BODY);

    pick("4 and 4");
    expect(screen.getByText("Both denominators are 4.")).toHaveClass(...BODY);
    // The confirmed pick, in its card.
    expect(screen.getByText("4 and 4")).toHaveClass(...BODY);
  });

  it("reaches the unit and the completion line, and not the field itself", () => {
    show(DONE_WITH_UNIT, true);

    expect(screen.getByText("quarters")).toHaveClass(...BODY);
    expect(
      screen.getByText(
        "Type the number you worked out. You can use a minus sign or a point.",
      ),
    ).toHaveClass(...BODY);
    expect(screen.getByRole("textbox")).not.toHaveClass("leading-[2]");

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3" } });
    tap("Check my answer");

    expect(
      screen.getByText("When fractions share a denominator, add the numerators."),
    ).toHaveClass(...BODY);
  });

  it("reaches the labels of grouped dots and a number line", () => {
    show(
      build({
        scaffold: { kind: "dots", parts: 1, marks: [3, 4], labels: ["three", "four"] },
      }),
      true,
    );
    expect(screen.getByText("three")).toHaveClass(...BODY);
    cleanup();

    show(
      build({
        scaffold: { kind: "number_line", parts: 4, marks: [3], labels: ["three"] },
      }),
      true,
    );
    expect(screen.getByText("three")).toHaveClass(...BODY);
  });

  it("changes nothing with the accommodation off", () => {
    show(DONE_WITH_UNIT, false);
    tap("Need a hint?");
    expect(screen.getByText("quarters")).not.toHaveClass("leading-[2]");
    cleanup();

    show(build(), false);
    tap("Need a hint?");
    const read = [
      screen.getByText("What are the denominators?"),
      notation(),
      screen.getByRole("button", { name: "4 and 4" }),
      screen.getByText("1/4"),
      screen.getByText("Look at the bottom number of each fraction."),
    ];
    for (const el of read) {
      expect(el).not.toHaveClass("leading-[2]");
      expect(el).not.toHaveClass(HEADING);
    }
    pick("4 and 4");
    expect(screen.getByText("Both denominators are 4.")).not.toHaveClass("leading-[2]");
  });
});
