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
  // Backend, 9 Oct: rendered once the step is accepted.
  assembles: "1/4 + 2/4 = ?/4",
  equationState: "1/4 + 2/4 = ?/4",
  unit: null,
  narrationAudio: null,
  ...over,
});

const QUARTERS = {
  type: "co_construction",
  conceptId: "c-1",
  fullEquation: "1/4 + 2/4 = 3/4",
  expression: "1/4 + 2/4 = ?",
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
      assembles: "1 + 2 = ?",
      equationState: "1 + 2 = ?",
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
      assembles: "1/4 + 2/4 = 3/4",
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

  it("renders each step's assembles once it is accepted, never while it is asked", () => {
    // Backend, 9 Oct: "Once accepted, render assembles".
    const props = show();
    expect(equation()).toBe("1/4 + 2/4 = ?");

    pick("4 and 4");
    // Accepted: what step 1 assembles.
    expect(equation()).toBe("1/4 + 2/4 = ?/4");
    expect(screen.getByText("Both denominators are 4.")).toBeInTheDocument();

    tap("Next step");
    // Step 2 is asked: its own assembles waits for its acceptance.
    expect(equation()).toBe("1/4 + 2/4 = ?/4");
    pick("The numerators: 1 and 2");
    // Step 3 is asked on what step 2 assembled, as 17b draws it.
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

  it("takes equationState only where an accepted step assembles nothing", () => {
    show(
      build({
        steps: [
          step({ confirmationText: "", assembles: "", equationState: "4 and 4 match" }),
          QUARTERS.steps[2],
        ],
      }),
    );

    pick("4 and 4");

    expect(equation()).toBe("4 and 4 match");
  });

  it("prefers an accepted step's assembles to its equationState", () => {
    show(
      build({
        steps: [
          step({
            confirmationText: "",
            assembles: "1/4 + 2/4 = ?/4",
            equationState: "the denominators match",
          }),
          QUARTERS.steps[2],
        ],
      }),
    );

    pick("4 and 4");

    expect(equation()).toBe("1/4 + 2/4 = ?/4");
  });

  it("shows the problem's notation until a step is accepted, never the worked equation", () => {
    show(build({ steps: [step({ assembles: "" })] }));

    expect(equation()).toBe("1/4 + 2/4 = ?");
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

/** The drawing's rows, bar or array, as rendered. */
const scaffoldRows = () => [
  ...document.querySelectorAll<HTMLElement>("[data-scaffold-row]"),
];
const countIn = (selector: string) => () =>
  scaffoldRows().map((r) => r.querySelectorAll(selector).length);

describe("the drawing", () => {
  it("draws the payload's bars with the values it was given", () => {
    show();

    expect(screen.getByText("Picture it")).toBeInTheDocument();
    expect(screen.getByText("1/4")).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
    const rows = scaffoldRows();
    expect(rows).toHaveLength(2);
    expect(countIn(".bg-nevo-violet")()).toEqual([1, 2]);
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

    expect(scaffoldRows()).toHaveLength(2);
    expect(screen.queryByText("3/4")).toBeNull();
  });

  it("lays several marks along one bar, one after another, each label under its own cells", () => {
    // SCRUM-177's own example. Backend, 9 Oct: "A bar may therefore have
    // more marks than rows."
    show(
      build({
        scaffold: { kind: "bar", parts: 5, rows: 1, marks: [3, 1], labels: ["3/5", "1/5"] },
      }),
    );

    const [bar] = scaffoldRows();
    expect(scaffoldRows()).toHaveLength(1);
    expect([...bar.children].map((c) => c.className.match(/bg-nevo-violet(\/55)?\b/)?.[0] ?? "")).toEqual([
      "bg-nevo-violet",
      "bg-nevo-violet",
      "bg-nevo-violet",
      "bg-nevo-violet/55",
      "",
    ]);
    expect(screen.getByText("3/5").style.gridColumn).toBe("1 / span 3");
    expect(screen.getByText("1/5").style.gridColumn).toBe("4 / span 1");
  });

  it("draws empty bars with a part's label under it where there are no marks", () => {
    // "label[i] belongs to ... scaffold part i" when there are no marks.
    show(
      build({
        scaffold: { kind: "bar", parts: 3, rows: 2, labels: ["a", "b", "c"] },
      }),
    );

    expect(scaffoldRows()).toHaveLength(2);
    expect(countIn(".bg-nevo-violet")()).toEqual([0, 0]);
    expect(["a", "b", "c"].map((l) => screen.getByText(l))).toHaveLength(3);
  });
});

describe("D149's array and place value", () => {
  const pieces = (piece: string, within: ParentNode = document) =>
    within.querySelectorAll(`[data-piece="${piece}"]`).length;
  const zones = (piece: string, within: ParentNode = document) =>
    within.querySelectorAll(`[data-zone="${piece}"]`).length;

  it("draws an array as rows of parts columns, its marks filling them in reading order", () => {
    // Backend, 9 Oct: "parts is the number of columns in one row".
    show(build({ scaffold: { kind: "array", parts: 4, rows: 3, marks: [6] } }));

    expect(screen.getByText("Picture it")).toBeInTheDocument();
    expect(scaffoldRows().map((r) => r.children.length)).toEqual([4, 4, 4]);
    expect(countIn(".bg-nevo-navy")()).toEqual([4, 2, 0]);
    // The rest are D149's empty places.
    expect(scaffoldRows()[2].querySelectorAll(".border-dashed")).toHaveLength(4);
  });

  it("tells an array's marks apart, navy then violet", () => {
    show(build({ scaffold: { kind: "array", parts: 4, rows: 2, marks: [5, 2] } }));

    expect(countIn(".bg-nevo-navy")()).toEqual([4, 1]);
    expect(countIn(".bg-nevo-violet")()).toEqual([0, 2]);
  });

  it("draws place value as flats, rods and units, a mark to each column", () => {
    show(
      build({
        scaffold: {
          kind: "place_value",
          parts: 1,
          marks: [1, 2, 3],
          labels: ["Hundreds", "Tens", "Ones"],
        },
      }),
    );

    expect([pieces("flat"), pieces("rod"), pieces("unit")]).toEqual([1, 2, 3]);
    expect(screen.getByText("Hundreds")).toBeInTheDocument();
    expect(screen.getByText("Ones")).toBeInTheDocument();
  });

  it("names no column the payload did not name", () => {
    show(build({ scaffold: { kind: "place_value", parts: 1, marks: [0, 4, 7] } }));

    expect([pieces("flat"), pieces("rod"), pieces("unit")]).toEqual([0, 4, 7]);
    for (const name of ["Hundreds", "Tens", "Ones"]) {
      expect(screen.queryByText(name)).toBeNull();
    }
  });

  it("draws dots as D149's rows of round places, filled in reading order", () => {
    // D149 replaced 37c's groups of two, which read neither rows nor parts.
    show(build({ scaffold: { kind: "dots", parts: 5, rows: 2, marks: [6] } }));

    expect(scaffoldRows().map((r) => r.children.length)).toEqual([5, 5]);
    expect(countIn(".rounded-full.bg-nevo-navy")()).toEqual([5, 1]);
    expect(scaffoldRows()[1].querySelectorAll(".border-dashed")).toHaveLength(4);
  });

  const beads = () => [...document.querySelectorAll<HTMLElement>("[data-bead]")];

  it("draws a number line of parts positions, a part's label under its own", () => {
    // "Cells or positions in one row": D149's 0 to 10 is eleven positions.
    const labels = ["0", "", "", "", "", "5", "", "", "", "", "10"];
    show(build({ scaffold: { kind: "number_line", parts: 11, labels } }));

    expect(document.querySelectorAll("[data-tick]")).toHaveLength(11);
    expect(screen.getByText("5").style.left).toBe("50%");
    expect(screen.getByText("10").style.left).toBe("100%");
    expect(beads()).toHaveLength(0);
  });

  it("puts the marker at each mark's position on the line", () => {
    show(build({ scaffold: { kind: "number_line", parts: 11, marks: [4] } }));

    expect(beads().map((b) => b.style.left)).toEqual(["40%"]);
  });

  const TAP = (tapCount: number) =>
    step({
      stepId: "a1",
      prompt: "Build the total.",
      expectedInput: "drag",
      input: "tap",
      options: [],
      tapCount,
    });

  it("builds into an array's empty places in reading order, from one piece", () => {
    const props = show(
      build({ manipulative: { kind: "array", parts: 3, rows: 2 }, steps: [TAP(4)] }),
    );
    const buildRows = () => [
      ...document.querySelectorAll<HTMLElement>("[data-build-row]"),
    ];
    const filled = () =>
      buildRows().map((r) => r.querySelectorAll(".bg-nevo-navy").length);
    expect(buildRows()).toHaveLength(2);
    expect(filled()).toEqual([0, 0]);
    // D149 offers one piece to tap, not one per piece still to place.
    expect(screen.getAllByRole("button", { name: "Tap to add" })).toHaveLength(1);

    for (let i = 0; i < 4; i++) tap("Tap to add");

    expect(filled()).toEqual([3, 1]);
    expect(props.onPiecePlaced).toHaveBeenCalledTimes(4);
    expect(screen.queryByRole("button", { name: "Tap to add" })).toBeNull();
    tap("That's the total");
    expect(props.onStepAnswered).toHaveBeenCalledWith("a1", true);
    expect(props.onSolved).toHaveBeenCalled();
  });

  it("hops along a number line from its first position, one a tap", () => {
    const props = show(
      build({ manipulative: { kind: "number_line", parts: 5 }, steps: [TAP(3)] }),
    );
    // QUARTERS draws bars, so the only marker is the build's.
    expect(beads().map((b) => b.style.left)).toEqual(["0%"]);

    for (let i = 0; i < 3; i++) tap("+1");

    expect(beads().map((b) => b.style.left)).toEqual(["75%"]);
    expect(props.onPiecePlaced).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("button", { name: "+1" })).toBeNull();
    tap("That's the total");
    expect(props.onStepAnswered).toHaveBeenCalledWith("a1", true);
  });

  it("builds place value column by column, each to the scaffold's count for it", () => {
    // "marks are the piece counts for the columns named by labels".
    const props = show(
      build({
        scaffold: {
          kind: "place_value",
          parts: 1,
          marks: [1, 2, 0],
          labels: ["Hundreds", "Tens", "Ones"],
        },
        manipulative: { kind: "place_value", parts: 1 },
        steps: [TAP(3)],
      }),
    );
    const build_ = () => [
      ...document.querySelectorAll<HTMLElement>("[data-build-column]"),
    ];
    expect(build_().map((c) => [zones("flat", c), zones("rod", c), zones("unit", c)])).toEqual([
      [1, 0, 0],
      [0, 2, 0],
      [0, 0, 0],
    ]);
    // A tray piece for each column with places to fill; Ones has none.
    expect(
      screen.getAllByRole("button", { name: /^Tap to add/ }).map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Tap to add, Hundreds", "Tap to add, Tens"]);

    tap("Tap to add, Tens");
    tap("Tap to add, Tens");
    expect(screen.queryByRole("button", { name: "Tap to add, Tens" })).toBeNull();
    expect(screen.queryByRole("button", { name: "That's the total" })).toBeNull();

    tap("Tap to add, Hundreds");
    expect(build_().map((c) => [pieces("flat", c), pieces("rod", c)])).toEqual([
      [1, 0],
      [0, 2],
      [0, 0],
    ]);
    expect(props.onPiecePlaced).toHaveBeenCalledTimes(3);
    tap("That's the total");
    expect(props.onStepAnswered).toHaveBeenCalledWith("a1", true);
  });
});

describe("what the asked step names (B107)", () => {
  /**
   * 17b's choreography as backend's 9 Oct timing names it: "Highlights apply
   * while the step is being asked. Once accepted, render assembles and move
   * to the next step's highlights."
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
            { target: "?", role: "result" },
            { target: "3/4", role: "result" },
          ],
        }),
      ],
    });
  const ringed = () =>
    scaffoldRows().map((b) => b.querySelectorAll(".outline-nevo-violet").length > 0);
  const navy = countIn(".bg-nevo-navy");
  const token = (text: string) =>
    [...document.querySelectorAll('[aria-live="polite"] span')].find(
      (s) => s.textContent === text,
    );

  it("applies a step's highlights from the moment it is asked", () => {
    show(CHOREOGRAPHED());

    expect(ringed()).toEqual([true, true, false]);
    expect(navy()).toEqual([0, 0, 0]);
  });

  it("moves to the next step's highlights once a step is accepted", () => {
    show(CHOREOGRAPHED());

    // Accepted, its confirmation still showing: step 2's highlights now.
    pick("4 and 4");
    expect(ringed()).toEqual([false, false, false]);
    expect(navy()).toEqual([1, 2, 0]);

    tap("Next step");
    expect(navy()).toEqual([1, 2, 0]);
  });

  it("keeps the result back until the step naming it is accepted", () => {
    show(CHOREOGRAPHED());
    pick("4 and 4");
    tap("Next step");
    pick("The numerators: 1 and 2");

    // The last step is asked: its row is rendered, empty, unnamed.
    expect(scaffoldRows()).toHaveLength(3);
    expect(navy()).toEqual([0, 0, 0]);
    expect(screen.queryByText("3/4")).toBeNull();
    // The "?" it names is where the answer goes: the frame's dashed box.
    expect(token("?")).toHaveClass("border-dashed");

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3" } });
    tap("Check my answer");

    expect(screen.getByText("3/4")).toHaveClass("text-nevo-navy");
    expect(navy()).toEqual([0, 0, 3]);
  });

  it("finds a target among the equation's tokens as well as the drawing's labels", () => {
    show(build({ steps: [step({ highlights: [{ target: "+" }, { target: "2/4", role: "source" }] })] }));

    expect(token("+")).toHaveClass("outline-nevo-violet");
    // The same name rings, or strengthens, wherever the calculation draws it.
    expect(token("2/4")).toHaveClass("font-bold");
    expect(navy()).toEqual([0, 2]);
  });

  it("ignores a target that names nothing the calculation carries", () => {
    show(
      build({
        steps: [
          step({
            highlights: [
              { target: "denominators" },
              // An index, a value: the second bar's mark is 2.
              { target: "1" },
              { target: "2" },
              { target: "mark:1" },
              { target: "1/4 " },
            ],
          }),
        ],
      }),
    );

    // "1/4 " is trimmed to a label; nothing else is guessed at - not an
    // index, not a value.
    expect(ringed()).toEqual([true, false]);
  });

  it("rings a build's piece the asked step names by its label", () => {
    show(
      build({
        manipulative: {
          kind: "fraction_bar",
          parts: 4,
          labels: ["q1", "q2", "q3", "q4"],
        },
        steps: [
          step({
            stepId: "b1",
            prompt: "Build the total.",
            expectedInput: "drag",
            input: "tap",
            options: [],
            tapCount: 3,
            highlights: [{ target: "q2" }],
          }),
        ],
      }),
    );

    const places = [...document.querySelectorAll("[data-build-place]")];
    expect(places.map((p) => p.classList.contains("outline-nevo-violet"))).toEqual([
      false,
      true,
      false,
      false,
    ]);
  });

  it("turns nothing navy just because the solve finished", () => {
    // A payload with no highlights says nothing changed, and nothing does.
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

  it("reaches the labels of dots' parts and a number line", () => {
    show(
      build({
        scaffold: { kind: "dots", parts: 2, labels: ["three", "four"] },
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
