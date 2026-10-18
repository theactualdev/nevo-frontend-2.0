import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    onAct: vi.fn(),
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
/** One piece off the tray - D149's single piece. */
const placeOne = () => tap("+ 1/4");
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

  it("draws the equation's minus signs as the field and pad draw them", () => {
    show(build({ expression: "2 - 5 = -3, on the x-axis" }));

    // The payload's hyphens are the sign, but for a word's own hyphen.
    expect(equation()).toBe("2 − 5 = −3, on the x-axis");
  });

  it("still finds a highlight by the token as the payload wrote it", () => {
    show(
      build({
        expression: "2 - 5 = -3",
        steps: [step({ highlights: [{ target: "-3" }] })],
      }),
    );

    const ringed = [...document.querySelectorAll('[aria-live="polite"] span')]
      .filter((s) => s.classList.contains("outline-nevo-violet"))
      .map((s) => s.textContent);
    expect(ringed).toEqual(["−3"]);
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

  it("accepts the stored answer for a typed step, however it is spaced", () => {
    const props = show(build({ steps: [QUARTERS.steps[2]] }));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: " 3 " } });
    tap("Check my answer");

    expect(props.onStepAnswered).toHaveBeenCalledWith("s3", true);
    expect(props.onSolved).toHaveBeenCalled();
  });

  it("takes no step's targets for a right answer", () => {
    // The step's targets carry "3.0". They name what it points at.
    const props = show(build({ steps: [QUARTERS.steps[2]] }));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3.0" } });
    tap("Check my answer");

    expect(props.onStepAnswered).toHaveBeenCalledWith("s3", false);
    expect(props.onSolved).not.toHaveBeenCalled();
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

  it("tells the host when the child picks, types, or opens the hint (D211)", () => {
    const picking = show();
    tap("4 and 4");
    expect(picking.onAct).toHaveBeenCalledTimes(1);
    tap("Need a hint?");
    expect(picking.onAct).toHaveBeenCalledTimes(2);
    cleanup();

    const typing = show(
      build({
        steps: [
          step({
            input: "number",
            expectedInput: "numeric",
            options: [],
            answer: "3",
          }),
        ],
      }),
    );
    tap("3");
    expect(typing.onAct).toHaveBeenCalledTimes(1);
  });

  it("offers no hint on a step that has none", () => {
    show(build({ steps: [QUARTERS.steps[1]] }));

    expect(screen.queryByRole("button", { name: "Need a hint?" })).toBeNull();
  });

  it("is set in the darker violet, never soft violet on cream (D210)", () => {
    show();

    const link = screen.getByRole("button", { name: "Need a hint?" });
    expect(link.className.split(" ")).toContain("text-nevo-violet-text");
    expect(link.className.split(" ")).not.toContain("text-nevo-violet");
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

  it("keeps the newest digit in view when the number outgrows the field", () => {
    show(NEGATIVE());
    const field = screen.getByRole("textbox");
    const scrolledTo = vi.fn();
    Object.defineProperty(field, "scrollWidth", { configurable: true, value: 640 });
    Object.defineProperty(field, "scrollLeft", {
      configurable: true,
      get: () => 0,
      set: scrolledTo,
    });

    tap("7");

    expect(scrolledTo).toHaveBeenLastCalledWith(640);
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

  it("puts Check under the field with the first key and Need a hint? under it, as 17a does", () => {
    show(NEGATIVE());
    const field = screen.getByRole("textbox");
    const hint = screen.getByRole("button", { name: "Need a hint?" });
    // Nothing held empty before a key: the hint link sits under the field.
    expect(document.querySelector('form button[type="submit"]')).toBeNull();
    expect(field.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    tap("3");

    const check = screen.getByRole("button", { name: "Check my answer" });
    expect(field.compareDocumentPosition(check) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(check.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("docks the pad where the host gives it a place, not under the step", () => {
    const dock = document.createElement("div");
    document.body.append(dock);
    try {
      render(<CalculationSolver calculation={NEGATIVE()} onSolved={vi.fn()} padDock={dock} />);

      expect(dock).toContainElement(pad());
      expect(screen.getByRole("textbox").closest("form")?.parentElement).not.toContainElement(pad());
    } finally {
      cleanup();
      dock.remove();
    }
  });

  it("waits for the host's place rather than drawing the pad twice", () => {
    render(<CalculationSolver calculation={NEGATIVE()} onSolved={vi.fn()} padDock={null} />);

    expect(pad()).toBeNull();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("gives an expression the full keyboard, and no pad", () => {
    show(build({ steps: [step({ input: "number", expectedInput: "text", answer: "3x - 4" })] }));

    expect(screen.getByRole("textbox")).toHaveAttribute("inputmode", "text");
    expect(pad()).toBeNull();
  });
});

describe("bringing the step into view above the docked pad", () => {
  /*
   * jsdom lays nothing out, so the column and where each marked part of the
   * step sits are given here, and a resize is delivered by hand - as the
   * browser delivers one after layout.
   */
  let rects: Record<string, [number, number]>;
  let observers: (() => void)[];
  const scrolled = vi.fn();
  const before = Element.prototype.scrollIntoView;
  beforeEach(() => {
    observers = [];
    scrolled.mockReset();
    Element.prototype.scrollIntoView = scrolled;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const name =
          this.getAttribute("data-reveal") ??
          (this.hasAttribute("data-test-column") ? "column" : "");
        const [top, bottom] = rects[name] ?? [0, 0];
        return {
          top,
          bottom,
          height: bottom - top,
          left: 0,
          right: 375,
          width: 375,
          x: 0,
          y: top,
          toJSON: () => ({}),
        } as DOMRect;
      },
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        cb: () => void;
        constructor(cb: () => void) {
          this.cb = cb;
        }
        observe() {
          observers.push(this.cb);
        }
        unobserve() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Element.prototype.scrollIntoView = before;
  });
  const resized = () => act(() => observers.splice(0).forEach((cb) => cb()));
  const inColumn = (
    calc: CalculationSegment,
    props: Partial<Parameters<typeof CalculationSolver>[0]> = {},
  ) => {
    const onSystemScroll = vi.fn();
    render(
      <div data-test-column style={{ overflowY: "auto" }}>
        <CalculationSolver
          calculation={calc}
          onSolved={vi.fn()}
          onSystemScroll={onSystemScroll}
          {...props}
        />
      </div>,
    );
    return onSystemScroll;
  };
  /** The part the last move was made by, and how. */
  const lastMove = () => ({
    part: (scrolled.mock.contexts.at(-1) as Element | undefined)?.getAttribute(
      "data-reveal",
    ),
    how: scrolled.mock.calls.at(-1)?.[0],
  });
  const NUMBER = () =>
    build({ steps: [step({ input: "number", expectedInput: "numeric", answer: "-3" })] });

  it("shows the question, the field and the hint link together where they fit", () => {
    rects = { column: [100, 400], prompt: [420, 446], form: [464, 584], field: [496, 568], hint: [600, 644] };
    const onSystemScroll = inColumn(NUMBER());
    resized();

    // Below the column: brought up by the end, the least move that shows it.
    expect(lastMove()).toEqual({ part: "hint", how: { block: "end" } });
    expect(onSystemScroll).toHaveBeenCalledTimes(1);
  });

  it("keeps the question and the field, and lets the hint link go, where all three do not fit", () => {
    rects = { column: [100, 400], prompt: [420, 446], form: [464, 690], field: [496, 568], hint: [706, 750] };
    inColumn(NUMBER());
    resized();

    expect(lastMove()).toEqual({ part: "form", how: { block: "end" } });
  });

  it("brings Check into view as it goes live, with the field above it", () => {
    rects = { column: [100, 400], prompt: [120, 146], form: [164, 300], field: [196, 268], hint: [316, 360] };
    inColumn(NUMBER());
    resized();
    // All of it in view: nothing moves.
    expect(scrolled).not.toHaveBeenCalled();

    // The first key: Check arrives under the helper line, below the column.
    rects = { ...rects, prompt: [120, 146], form: [164, 452], check: [400, 452], hint: [468, 512] };
    tap("3");
    resized();

    expect(lastMove()).toEqual({ part: "form", how: { block: "end" } });
  });

  it("brings the engine's hint into view with the field when the question will not fit too", () => {
    rects = { column: [100, 400], prompt: [420, 520], pill: [536, 596], form: [612, 780], field: [650, 722] };
    inColumn(NUMBER(), { engineHint: "Count down from 2." });
    resized();

    // Question to field is 302px, the column 300: the hint and the field.
    expect(lastMove()).toEqual({ part: "field", how: { block: "end" } });
  });

  it("leaves a choice step where it is, under the child's finger", () => {
    rects = { column: [100, 400], prompt: [420, 446] };
    inColumn(build());
    tap("4 and 4");
    resized();

    expect(scrolled).not.toHaveBeenCalled();
  });

  it("brings That's the total into view as it arrives", () => {
    rects = { column: [100, 400], prompt: [300, 326], total: [380, 432] };
    const onSystemScroll = inColumn(
      build({
        steps: [
          step({ stepId: "b1", prompt: "Build the total.", expectedInput: "drag", input: "tap", options: [], tapCount: 2 }),
        ],
      }),
    );
    for (let i = 0; i < 2; i++) placeOne();

    expect(lastMove()).toEqual({ part: "total", how: { block: "end" } });
    expect(onSystemScroll).toHaveBeenCalled();
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

  it("offers one piece to tap, as D149 does for every kind, and says each one placed", () => {
    // Design, 9 Oct: "One scaffold, one interaction, everywhere." A tile per
    // piece still to place told the child how many were left.
    const props = show(build({ steps: [BUILD] }));

    expect(screen.getAllByRole("button", { name: "+ 1/4" })).toHaveLength(1);
    expect(screen.getByText("Tap to add")).toBeInTheDocument();
    placeOne();

    expect(props.onPiecePlaced).toHaveBeenCalledWith("b1");
    expect(screen.getAllByRole("button", { name: "+ 1/4" })).toHaveLength(1);
    expect(
      document.querySelectorAll("[data-build-place].bg-nevo-navy"),
    ).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "That's the total" })).toBeNull();
  });

  it("finishes once the bar holds the stored count", () => {
    const props = show(build({ steps: [BUILD] }));

    for (let i = 0; i < 3; i++) placeOne();
    // The piece is spent once the stored count is placed (Lydia, 17 Oct).
    expect(screen.getByRole("button", { name: "+ 1/4" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    tap("That's the total");

    expect(props.onPiecePlaced).toHaveBeenCalledTimes(3);
    expect(props.onStepAnswered).toHaveBeenCalledWith("b1", true);
    expect(props.onSolved).toHaveBeenCalled();
  });

  it("tells the host each time the child acts on the step (D211)", () => {
    const props = show(build({ steps: [BUILD] }));
    expect(props.onAct).not.toHaveBeenCalled();

    placeOne();

    expect(props.onAct).toHaveBeenCalledTimes(1);
  });

  it("lays its places at D149's 46px, 6px apart, at every width (design, 13 Oct)", () => {
    show(build({ steps: [BUILD] }));
    const places = [...document.querySelectorAll("[data-build-place]")];

    expect(places).toHaveLength(4);
    for (const place of places) {
      expect(place.className.split(" ")).toContain("h-[46px]");
      // One height: no per-breakpoint 34 / 40 / 36 left over.
      expect(place.className).not.toMatch(/(sm|lg):h-/);
    }
    expect(places[0].parentElement?.className.split(" ")).toContain("gap-1.5");
  });
});

describe("the last piece cannot also submit the build (Lydia, 17 Oct; D162)", () => {
  /*
   * "'That's the total' appears exactly where the last piece's button was,
   * so building the answer also submits it." The tray went with the last
   * piece and the commit took its row, under the finger that had just
   * tapped. jsdom lays nothing out, so "where the piece was" is the row
   * after the build's card - the one the tray held.
   */
  const TAP = (tapCount: number) =>
    step({
      stepId: "a1",
      prompt: "Build the total.",
      expectedInput: "drag",
      input: "tap",
      options: [],
      tapCount,
    });
  /** The build's card: "The total", and the places the pieces go into. */
  const card = () => screen.getByText("The total").parentElement!;
  /** A tap where `piece` was, on whatever now holds the tray's row. */
  const tapWhereItWas = (piece: HTMLElement) => {
    const there = card().nextElementSibling as HTMLElement;
    fireEvent.click(
      there.contains(piece)
        ? piece
        : there.matches("button")
          ? there
          : (there.querySelector("button") ?? there),
    );
  };

  it.each([
    ["a fraction bar", { kind: "fraction_bar", parts: 4, rows: 1, labels: [] }, "+ 1/4", 3],
    ["an array", { kind: "array", parts: 3, rows: 2 }, "Tap to add", 4],
    ["counters", { kind: "counters", parts: 5, rows: 2 }, "Tap to add", 3],
    ["a number line", { kind: "number_line", parts: 5 }, "+1", 3],
  ] as const)(
    "%s: a fast second tap, or a double tap, where the last piece was submits nothing",
    (_, manipulative, piece, count) => {
      const props = show(build({ manipulative, steps: [TAP(count)] }));
      const tile = screen.getByRole("button", { name: piece });
      const tray = tile.parentElement!;
      for (let i = 0; i < count; i++) fireEvent.click(tile);

      // One tap too many on the spot the finger is on...
      tapWhereItWas(tile);
      expect(props.onStepAnswered).not.toHaveBeenCalled();
      expect(props.onSolved).not.toHaveBeenCalled();
      // ...and a double tap there.
      tapWhereItWas(tile);
      tapWhereItWas(tile);

      expect(props.onStepAnswered).not.toHaveBeenCalled();
      expect(props.onSolved).not.toHaveBeenCalled();
      expect(props.onPiecePlaced).toHaveBeenCalledTimes(count);
      // The piece is still there, spent; the row is the tray's still.
      expect(tile).toBeInTheDocument();
      expect(tile).toHaveAttribute("aria-disabled", "true");
      expect(card().nextElementSibling).toBe(tray);
      expect(tray).toHaveAttribute("data-tray-done");
    },
  );

  it.each([
    ["a fraction bar", { kind: "fraction_bar", parts: 4, rows: 1, labels: [] }, "+ 1/4", 3],
    ["an array", { kind: "array", parts: 3, rows: 2 }, "Tap to add", 4],
    ["counters", { kind: "counters", parts: 5, rows: 2 }, "Tap to add", 3],
    ["a number line", { kind: "number_line", parts: 5 }, "+1", 3],
  ] as const)(
    "%s: That's the total arrives below the tray, not in its place, and commits when pressed",
    (_, manipulative, piece, count) => {
      const props = show(build({ manipulative, steps: [TAP(count)] }));
      const tile = screen.getByRole("button", { name: piece });
      for (let i = 0; i < count; i++) fireEvent.click(tile);

      const total = screen.getByRole("button", { name: "That's the total" });
      const tray = tile.parentElement!;
      expect(tray.contains(total)).toBe(false);
      expect(total).not.toBe(card().nextElementSibling);
      expect(
        tray.compareDocumentPosition(total) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // D162's beat: unseen and untappable for about 450ms (globals.css).
      expect(total).toHaveClass("nevo-arrive-late");

      tap("That's the total");
      expect(props.onStepAnswered).toHaveBeenCalledWith("a1", true);
      expect(props.onSolved).toHaveBeenCalledTimes(1);
    },
  );

  it("place value: a tap where the last column's piece was submits nothing, and That's the total still does", () => {
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
    const hundreds = screen.getByRole("button", { name: "Tap to add, Hundreds" });
    const tray = hundreds.parentElement!;
    tap("Tap to add, Tens");
    tap("Tap to add, Tens");
    fireEvent.click(hundreds);

    tapWhereItWas(hundreds);
    expect(props.onStepAnswered).not.toHaveBeenCalled();
    tapWhereItWas(hundreds);
    expect(props.onStepAnswered).not.toHaveBeenCalled();
    expect(props.onSolved).not.toHaveBeenCalled();
    expect(hundreds).toBeInTheDocument();
    expect(hundreds).toHaveAttribute("aria-disabled", "true");
    expect(card().nextElementSibling).toBe(tray);

    const total = screen.getByRole("button", { name: "That's the total" });
    expect(tray.contains(total)).toBe(false);
    tap("That's the total");
    expect(props.onStepAnswered).toHaveBeenCalledWith("a1", true);
  });

  it("keeps a keyboard's focus on the spent piece, never moving it onto That's the total", () => {
    // A held Enter, or a switch pressed once too often, would commit there.
    const props = show(
      build({ manipulative: { kind: "fraction_bar", parts: 4, rows: 1, labels: [] }, steps: [TAP(2)] }),
    );
    const tile = screen.getByRole("button", { name: "+ 1/4" });
    tile.focus();
    // Enter and Space on a focused button are its click.
    fireEvent.click(document.activeElement!);
    fireEvent.click(document.activeElement!);

    expect(document.activeElement).toBe(tile);
    expect(document.activeElement).not.toBe(
      screen.getByRole("button", { name: "That's the total" }),
    );
    fireEvent.click(document.activeElement!);
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    fireEvent.keyDown(document.activeElement!, { key: " " });
    expect(props.onStepAnswered).not.toHaveBeenCalled();
    expect(props.onPiecePlaced).toHaveBeenCalledTimes(2);
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
  /** The line's ticks, as where each sits and which violet it is. */
  const ticks = () =>
    [...document.querySelectorAll<HTMLElement>("[data-tick]")].map(
      (t) => `${t.style.left} ${t.dataset.tick}`,
    );

  it("draws a number line of parts positions, a part's label under its own", () => {
    // "Cells or positions in one row": D149's 0 to 10 is eleven positions.
    const labels = ["0", "", "", "", "", "5", "", "", "", "", "10"];
    show(build({ scaffold: { kind: "number_line", parts: 11, labels } }));

    expect(screen.getByText("5").style.left).toBe("50%");
    expect(screen.getByText("10").style.left).toBe("100%");
    expect(screen.getByText("10")).toHaveClass("text-nevo-near-black/60");
    expect(beads()).toHaveLength(0);
  });

  it("ticks only the positions the data labels, in D149's violet pair (D159)", () => {
    // D159: "labels belong to marks, only where there are marks - not one
    // per tick". Eleven ticks stood here before, one a position.
    const labels = ["0", "", "", "", "", "5", "", "", "", "", "10"];
    show(build({ scaffold: { kind: "number_line", parts: 11, labels } }));

    expect(ticks()).toEqual(["0% violet", "50% light", "100% violet"]);
    const [tick] = document.querySelectorAll("[data-tick]");
    expect(tick).toHaveClass("w-[3px]", "h-5", "bg-nevo-violet");
  });

  it("puts the marker, and a tick, at each mark's position on the line", () => {
    show(build({ scaffold: { kind: "number_line", parts: 11, marks: [4, 7] } }));

    expect(beads().map((b) => b.style.left)).toEqual(["40%", "70%"]);
    expect(ticks()).toEqual(["40% violet", "70% light"]);
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
    expect(screen.getByRole("button", { name: "Tap to add" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
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
    // The build carries no marks or labels, so its line has no ticks (D159).
    expect(ticks()).toEqual([]);

    for (let i = 0; i < 3; i++) tap("+1");

    expect(beads().map((b) => b.style.left)).toEqual(["75%"]);
    expect(props.onPiecePlaced).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: "+1" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
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
    expect(screen.getByRole("button", { name: "Tap to add, Tens" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.queryByRole("button", { name: "That's the total" })).toBeNull();
    // Tens' piece is spent where it was, so Hundreds' has not moved.
    const tray = screen.getByRole("button", { name: "Tap to add, Hundreds" })
      .parentElement!;
    expect(
      [...tray.children].slice(1).map((c) =>
        c.hasAttribute("data-tray-place") ? "place" : c.getAttribute("aria-label"),
      ),
    ).toEqual(["Tap to add, Hundreds", "place"]);

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

  const PLACE_BUILD = (labels?: string[]) =>
    build({
      scaffold: {
        kind: "place_value",
        parts: 1,
        marks: [1, 2, 0],
        ...(labels ? { labels } : {}),
      },
      manipulative: { kind: "place_value", parts: 1 },
      steps: [TAP(3)],
    });
  const captions = () =>
    [...document.querySelectorAll("[data-tray-caption]")].map((c) => c.textContent);

  it("captions each tray piece with its column's label as the payload gives it (D149)", () => {
    show(PLACE_BUILD(["Hundreds", "Tens", "Ones"]));

    // The payload's words, not D149's "Hundred" and "Ten".
    expect(captions()).toEqual(["Hundreds", "Tens"]);
    const tens = screen.getByRole("button", { name: "Tap to add, Tens" });
    expect(tens.querySelector("[data-tray-caption]")).toHaveClass(
      "text-[10px]",
      "font-medium",
      "text-nevo-near-black/60",
    );

    tap("Tap to add, Tens");
    tap("Tap to add, Tens");
    // The full column's piece keeps its caption, spent, so the Hundreds
    // piece beside it does not move.
    const kept = document.querySelector("[data-tray-place]");
    expect(kept).toHaveClass("opacity-50");
    expect(kept).toHaveAttribute("aria-disabled", "true");
    expect(kept).toHaveTextContent("Tens");
  });

  it("captions no tray piece the payload did not name", () => {
    show(PLACE_BUILD());

    expect(screen.getAllByRole("button", { name: "Tap to add" })).toHaveLength(2);
    expect(captions()).toEqual([]);
  });

  it("sets a caption in the reading type, with the accommodation on (D30)", () => {
    show(PLACE_BUILD(["Hundreds", "Tens", "Ones"]), true);

    expect(document.querySelector("[data-tray-caption]")).toHaveClass(
      "text-[18px]",
      "leading-[2]",
    );
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

    // The result's bar is kept back, so two bars, both ringed.
    expect(ringed()).toEqual([true, true]);
    expect(navy()).toEqual([0, 0]);
  });

  it("rings the whole of a bar its own mark names, empty cells too", () => {
    // 17a's `mkBar`: the denominators' ring is round all four quarters of
    // each bar, not the one or two the bar holds.
    show(CHOREOGRAPHED());

    expect(countIn(".outline-nevo-violet")()).toEqual([4, 4]);
  });

  it("keeps a ring on a shared bar to its own mark's cells", () => {
    show(
      build({
        scaffold: { kind: "bar", parts: 5, rows: 1, marks: [3, 1], labels: ["3/5", "1/5"] },
        steps: [step({ highlights: [{ target: "1/5" }] })],
      }),
    );

    expect(countIn(".outline-nevo-violet")()).toEqual([1]);
  });

  it("moves to the next step's highlights once a step is accepted", () => {
    show(CHOREOGRAPHED());

    // Accepted, its confirmation still showing: step 2's highlights now.
    pick("4 and 4");
    expect(ringed()).toEqual([false, false]);
    expect(navy()).toEqual([1, 2]);

    tap("Next step");
    expect(navy()).toEqual([1, 2]);
  });

  it("keeps the result back until the step naming it is accepted", () => {
    show(CHOREOGRAPHED());
    pick("4 and 4");
    tap("Next step");
    pick("The numerators: 1 and 2");

    // The last step is asked: the result's bar is not drawn at all - no
    // empty third bar saying where the answer will go (17a, `sc-if done`).
    expect(scaffoldRows()).toHaveLength(2);
    expect(navy()).toEqual([0, 0]);
    expect(screen.queryByText("3/4")).toBeNull();
    // The "?" it names is where the answer goes: the frame's dashed box.
    expect(token("?")).toHaveClass("border-dashed");

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3" } });
    tap("Check my answer");

    expect(scaffoldRows()).toHaveLength(3);
  });

  /** A bar's own label, at its start. */
  const rowLabel = (row: number) => scaffoldRows()[row].previousElementSibling;
  const solve = () => {
    pick("4 and 4");
    tap("Next step");
    pick("The numerators: 1 and 2");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "3" } });
    tap("Check my answer");
  };

  it("brings the result's bar in soft violet, its label in navy (D164)", () => {
    // D164: "the moment the child is right the bars return to Soft Violet".
    // The solver frame's `mkBar` draws the result row unemphasised, with its
    // "3/4" in navy at 600. It was held navy for good before.
    show(CHOREOGRAPHED());
    solve();

    expect(navy()).toEqual([0, 0, 0]);
    expect(countIn(".bg-nevo-violet")()).toEqual([1, 2, 3]);
    expect(rowLabel(2)).toHaveTextContent("3/4");
    expect(rowLabel(2)).toHaveClass("font-semibold", "text-nevo-navy");
    expect(rowLabel(0)).not.toHaveClass("text-nevo-navy");
  });

  it("sets the accepted answer in the solved equation at 700, and nothing else (D204)", () => {
    // A lesson stored before ids: its result is named by its words.
    show(CHOREOGRAPHED());
    solve();

    expect(equation()).toBe("1/4 + 2/4 = 3/4");
    expect(token("3/4")).toHaveClass("font-bold");
    expect(
      document.querySelectorAll('[aria-live="polite"] .font-bold'),
    ).toHaveLength(1);
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

  it("keeps the bar's place once the solve is done, so the drawing does not move", () => {
    // 17b §13: "Scaffold and equation never move or reflow between steps."
    render(
      <CalculationSolver
        calculation={build({ steps: [step({ narrationAudio: clip(1) })] })}
        onSolved={vi.fn()}
      />,
    );
    expect(audio()).not.toBeNull();

    pick("4 and 4");

    // Nothing left to read: the recording goes, and its row stays.
    expect(audio()).toBeNull();
    expect(document.querySelector("[data-narration-place]")).toHaveClass("h-16", "mb-4");
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

  it("keeps Play pressable when the recording did not load, and says so when pressed (D211)", () => {
    const NO_SOUND = "The sound didn't load. Try again in a moment.";
    listen({});
    fireEvent.error(audio()!);
    const button = screen.getByRole("button", { name: "Play narration" });

    // Not greyed: pressable, and nothing said until it is pressed.
    expect(button).toBeEnabled();
    expect(button.className).not.toMatch(/opacity-40|cursor-not-allowed/);
    expect(screen.queryByText(NO_SOUND)).toBeNull();

    fireEvent.click(button);

    expect(screen.getByText(NO_SOUND)).toBeInTheDocument();
    expect(play).not.toHaveBeenCalled();
  });

  it("says it in the failure line's place, beside Play, so the card barely grows (D211)", () => {
    listen({});
    fireEvent.error(audio()!);
    const button = screen.getByRole("button", { name: "Play narration" });

    fireEvent.click(button);

    const line = screen.getByText("The sound didn't load. Try again in a moment.");
    // In the row, not a row of its own under it: a row of its own pushed the
    // drawing and the options down by about 68px.
    expect(line.parentElement).toBe(button.parentElement);
    expect(button.parentElement?.className).not.toContain("flex-wrap");
    expect(screen.queryByText("Couldn't load this recording")).toBeNull();
    // The row's own 13px, in the reference's panel.
    expect(line.className.split(" ")).toEqual(
      expect.arrayContaining(["text-[13px]", "rounded-[10px]", "bg-nevo-violet/14"]),
    );
    expect(line.className.split(" ")).not.toContain("text-sm");
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

/**
 * Round 13: backend's 13 Oct answers (B108-B131), each held to the screen.
 */
const render13 = (
  calc: CalculationSegment,
  extra: Partial<React.ComponentProps<typeof CalculationSolver>> = {},
) => {
  const props = {
    onSolved: vi.fn(),
    onStepAnswered: vi.fn(),
    onHintOpened: vi.fn(),
    onHintShown: vi.fn(),
    onHintUsed: vi.fn(),
  };
  const view = render(
    <CalculationSolver calculation={calc} {...props} {...extra} />,
  );
  return { props, view };
};

describe("the pad, extended by the step (B108)", () => {
  const EXPRESSION = (requiredCharacters: unknown) =>
    build({
      steps: [
        step({
          input: "number",
          expectedInput: "text",
          options: [],
          answer: "3x - 4",
          requiredCharacters,
        }),
      ],
    });
  const pad = () => screen.queryByRole("group", { name: "On-screen keyboard" });

  it("types an expression on the Nevo pad with the keys the step names", () => {
    const { props } = render13(EXPRESSION(["x"]));

    // The device's keyboard is suppressed: the pad is the keyboard.
    expect(screen.getByRole("textbox")).toHaveAttribute("inputmode", "none");
    expect(pad()).toBeInTheDocument();
    for (const key of ["3", "x", "Minus sign", "4"]) tap(key);
    tap("Check my answer");

    expect(props.onStepAnswered).toHaveBeenCalledWith("s1", true);
    // D150's line is about a number; nothing is written for an expression.
    expect(screen.queryByText(/Type the number you worked out/)).toBeNull();
  });

  it("is the standard pad where the step names no keys", () => {
    render13(EXPRESSION([]));

    expect(pad()).toBeInTheDocument();
    expect(document.querySelector("[data-step-keys]")).toBeNull();
  });

  it("adds each key once, and none the pad already carries", () => {
    render13(EXPRESSION(["-", "x", "+", "7", "."]));

    const added = [...document.querySelectorAll("[data-step-keys] button")];
    expect(added.map((k) => k.textContent)).toEqual(["x", "+"]);
    expect(screen.getAllByRole("button", { name: "Minus sign" })).toHaveLength(1);
  });
});

describe("the equation's tokens and the drawing's ids (B109, B127)", () => {
  const TOKENS = [
    { id: "t-a", text: "1/4" },
    { id: "t-plus", text: "+" },
    { id: "t-b", text: "2/4" },
    { id: "t-eq", text: "=" },
    { id: "t-r", text: "3/4", hiddenUntilAccepted: true },
  ];
  const WITH_IDS = (over: Record<string, unknown> = {}) =>
    build({
      expression: "1/4 + 2/4",
      scaffold: {
        kind: "bar",
        parts: 4,
        rows: 3,
        marks: [1, 2, 3],
        labels: ["1/4", "2/4", ""],
        markIds: ["m-a", "m-b", "m-r"],
      },
      steps: [
        step({
          input: "number",
          expectedInput: "numeric",
          options: [],
          answer: "3",
          equationTokens: TOKENS,
          resultTargetId: "t-r",
          highlights: [
            { target: "t-plus" },
            { target: "m-a" },
            { target: "t-r", role: "result" },
            { target: "m-r", role: "result" },
          ],
          ...over,
        }),
      ],
    });
  const token = (id: string) =>
    document.querySelector<HTMLElement>(`[data-token="${id}"]`);
  const answer = () => {
    tap("3");
    tap("Check my answer");
  };

  it("draws the equation from its tokens, the step's answer kept back", () => {
    render13(WITH_IDS());

    expect(equation()).toBe("1/4 + 2/4 = ?");
    expect(token("t-r")).toHaveClass("border-dashed");
    expect(token("t-r")).toHaveTextContent("?");

    answer();
    // Accepted: the whole line, its answer in place.
    expect(equation()).toBe("1/4 + 2/4 = 3/4");
  });

  it("rings a token by its id, as the bars are (design, 13 Oct)", () => {
    render13(WITH_IDS());

    expect(token("t-plus")).toHaveClass("outline-nevo-violet");
    // The solver frame's `eqTokenStyle`: 3px out.
    expect(token("t-plus")).toHaveClass("outline-offset-3");
    expect(token("t-a")).not.toHaveClass("outline-nevo-violet");
    // The mark named by its id: the whole of its bar.
    expect(countIn(".outline-nevo-violet")()).toEqual([4, 0]);
  });

  it("never matches words on a lesson that carries ids", () => {
    // "1/4" is a label and a token's text, and names neither here.
    render13(WITH_IDS({ highlights: [{ target: "1/4" }, { target: "+" }] }));

    expect(document.querySelectorAll(".outline-nevo-violet")).toHaveLength(0);
  });

  it("keeps back a mark a result names by its id, labelled or not, until accepted", () => {
    render13(WITH_IDS());

    // The third bar is the result and carries no label: still not drawn.
    expect(scaffoldRows()).toHaveLength(2);

    answer();
    expect(scaffoldRows()).toHaveLength(3);
  });

  it("keeps back a part's label a result names, on a bar and on a line", () => {
    for (const kind of ["bar", "number_line"]) {
      render13(
        build({
          scaffold: { kind, parts: 3, labels: ["0", "1", "2"], labelIds: ["p0", "p1", "p2"] },
          steps: [step({ highlights: [{ target: "p2", role: "result" }] })],
        }),
      );
      expect(screen.getByText("1"), kind).toBeInTheDocument();
      expect(screen.queryByText("2"), kind).toBeNull();

      pick("4 and 4");
      expect(screen.getByText("2"), kind).toBeInTheDocument();
      cleanup();
    }
  });

  it("keeps back the step's resultTargetId even where it is not flagged", () => {
    render13(
      WITH_IDS({
        equationTokens: TOKENS.map((t) => ({ ...t, hiddenUntilAccepted: false })),
      }),
    );

    expect(equation()).toBe("1/4 + 2/4 = ?");
    expect(screen.queryByText("3/4")).toBeNull();
  });

  it("sets a step's answer at 700 once it is accepted, named by its id (B127, D204)", () => {
    render13(
      build({
        expression: "1/4 + 2/4",
        steps: [
          step({
            equationTokens: TOKENS,
            resultTargetId: "t-r",
            highlights: [{ target: "t-r", role: "result" }],
          }),
          step({ stepId: "s2" }),
        ],
      }),
    );

    pick("4 and 4");
    // Accepted, its confirmation showing: the whole line, its answer at 700.
    expect(equation()).toBe("1/4 + 2/4 = 3/4");
    expect(token("t-r")).toHaveClass("font-bold");
    expect(token("t-a")).not.toHaveClass("font-bold");
  });

  it("picks out no answer in a solved equation that names no token (B101)", () => {
    // `fullEquation` is a flat string. On a lesson with ids nothing in it can
    // be named, and the answer is never found by its words instead.
    render13(WITH_IDS());
    answer();

    expect(equation()).toBe("1/4 + 2/4 = 3/4");
    expect(
      document.querySelectorAll('[aria-live="polite"] .font-bold'),
    ).toHaveLength(0);
  });

  it("ticks no position a held-back label marks, and keeps each tick's violet as it arrives", () => {
    render13(
      build({
        scaffold: {
          kind: "number_line",
          parts: 3,
          labels: ["0", "1", "2"],
          labelIds: ["p0", "p1", "p2"],
        },
        steps: [step({ highlights: [{ target: "p1", role: "result" }] })],
      }),
    );
    const ticks = () =>
      [...document.querySelectorAll<HTMLElement>("[data-tick]")].map(
        (t) => `${t.style.left} ${t.dataset.tick}`,
      );

    // On a line, where a held-back label sits is the answer.
    expect(ticks()).toEqual(["0% violet", "100% violet"]);

    pick("4 and 4");
    expect(ticks()).toEqual(["0% violet", "50% light", "100% violet"]);
  });
});

describe("the builds B111 and B112 open", () => {
  const TAP = (tapCount: number) =>
    step({
      stepId: "a1",
      prompt: "Build the total.",
      expectedInput: "drag",
      input: "tap",
      options: [],
      tapCount,
    });
  const beads = () => [...document.querySelectorAll<HTMLElement>("[data-bead]")];

  it("hops a number line from its scaffold's start", () => {
    render13(
      build({
        scaffold: { kind: "number_line", parts: 6, start: 2 },
        manipulative: { kind: "number_line", parts: 6 },
        steps: [TAP(2)],
      }),
    );

    // Position 2 of 0 to 5, then one hop on.
    expect(beads().map((b) => b.style.left)).toEqual(["40%"]);
    tap("+1");
    expect(beads().map((b) => b.style.left)).toEqual(["60%"]);
  });

  it("builds counters into D149's dots, one dropped into the next space a tap", () => {
    const { props } = render13(
      build({
        manipulative: { kind: "counters", parts: 5, rows: 2 },
        steps: [TAP(3)],
      }),
    );
    const filled = () =>
      document.querySelectorAll('[data-build-dot="filled"]').length;

    expect(document.querySelectorAll("[data-build-dot]")).toHaveLength(10);
    expect(document.querySelector("[data-build-dot]")).toHaveClass("rounded-full");
    for (let i = 0; i < 3; i++) tap("Tap to add");

    expect(filled()).toBe(3);
    expect(screen.getByRole("button", { name: "Tap to add" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    tap("That's the total");
    expect(props.onStepAnswered).toHaveBeenCalledWith("a1", true);
  });
});

describe("drawn to the support level (B116)", () => {
  const card = () => screen.queryByText("Picture it");
  const HINT = "Look at the bottom number of each fraction.";

  it("draws the scaffold at standard, and with no level at all", () => {
    render13(build(), { level: "moderate" });
    expect(card()).toBeInTheDocument();
    cleanup();

    render13(build(), { level: null });
    expect(card()).toBeInTheDocument();
  });

  it("takes the scaffold away at light and at none, and keeps the child's own hint", () => {
    for (const level of ["light", "none", "minimal"] as const) {
      render13(build(), { level });
      expect(card(), level).toBeNull();
      // The prompt and the equation stay.
      expect(screen.getByText("What are the denominators?")).toBeInTheDocument();
      expect(equation()).toBe("1/4 + 2/4 = ?");
      expect(screen.getByRole("button", { name: "Need a hint?" })).toBeInTheDocument();
      cleanup();
    }
  });

  it("shows the step's hint at strong, which the child can close", () => {
    const { props } = render13(build(), { level: "full" });

    expect(card()).toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Need a hint?" })).toBeNull();
    expect(props.onHintShown).toHaveBeenCalledWith("step", "s1");

    tap("Close hint");
    expect(screen.queryByText(HINT)).toBeNull();
    expect(screen.getByRole("button", { name: "Need a hint?" })).toBeInTheDocument();
  });
});

describe("when a hint is offered and used (B130, B131)", () => {
  const ENGINE = "Count the pieces in each bar.";

  it("reports the engine's hint as it shows, not while a confirmation holds its place", () => {
    const { props, view } = render13(build());
    pick("4 and 4");
    // The engine's answer arrives beside step 1's confirmation.
    view.rerender(
      <CalculationSolver
        calculation={build()}
        onSolved={vi.fn()}
        onHintShown={props.onHintShown}
        engineHint={ENGINE}
      />,
    );
    expect(screen.queryByText(ENGINE)).toBeNull();
    expect(props.onHintShown).not.toHaveBeenCalled();

    tap("Next step");
    expect(screen.getByText(ENGINE)).toBeInTheDocument();
    expect(props.onHintShown).toHaveBeenCalledTimes(1);
    expect(props.onHintShown).toHaveBeenCalledWith("engine", "s2");
  });

  it("reports the engine's hint used as the step is submitted with it on screen, once a step", () => {
    const { props } = render13(build(), { engineHint: ENGINE });

    pick("1 and 2");
    expect(props.onHintUsed).toHaveBeenCalledTimes(1);
    expect(props.onHintUsed).toHaveBeenCalledWith("engine", "s1");
    // Before the step's own response, which it is about.
    expect(props.onHintUsed.mock.invocationCallOrder[0]).toBeLessThan(
      props.onStepAnswered.mock.invocationCallOrder[0],
    );

    pick("4 and 4");
    expect(props.onHintUsed).toHaveBeenCalledTimes(1);
    tap("Next step");
    pick("The numerators: 1 and 2");
    expect(props.onHintUsed).toHaveBeenCalledTimes(2);
    expect(props.onHintUsed).toHaveBeenLastCalledWith("engine", "s2");
  });

  it("reports a strong level's hint used on submit, and not one closed first", () => {
    const shown = render13(build(), { level: "full" });
    pick("4 and 4");
    expect(shown.props.onHintUsed).toHaveBeenCalledWith("step", "s1");
    cleanup();

    const closed = render13(build(), { level: "full" });
    tap("Close hint");
    pick("4 and 4");
    expect(closed.props.onHintUsed).not.toHaveBeenCalled();
  });

  it("sends no second use on a step whose hint the child opened - opening it was the use", () => {
    const { props, view } = render13(build());

    tap("Need a hint?");
    // The engine's hint arrives on the same step, after the child's own.
    view.rerender(
      <CalculationSolver
        calculation={build()}
        onSolved={vi.fn()}
        onHintOpened={props.onHintOpened}
        onHintUsed={props.onHintUsed}
        engineHint={ENGINE}
      />,
    );
    expect(screen.getByText(ENGINE)).toBeInTheDocument();
    pick("4 and 4");

    expect(props.onHintOpened).toHaveBeenCalledWith("s1");
    expect(props.onHintUsed).not.toHaveBeenCalled();
  });
});

/**
 * Backend's tokens as it sends them (`_validated_calculation_variant`): every
 * step carries exactly one, its own answer, hidden until accepted and named
 * by `resultTargetId` and a `result` highlight. Those carry no equation line.
 */
describe("a step whose only token is its own answer, as backend sends it", () => {
  const backendStep = (over: Record<string, unknown>) => {
    const s = step(over);
    const id = `${s.stepId}-result`;
    return {
      ...s,
      requiredCharacters: [],
      equationTokens: [{ id, text: String(s.answer), hiddenUntilAccepted: true }],
      resultTargetId: id,
      highlights: [
        ...((over.highlights as unknown[] | undefined) ?? []),
        { target: id, role: "result" },
      ],
    };
  };
  const BACKEND = (over: Record<string, unknown> = {}) =>
    build({
      scaffold: {
        kind: "bar",
        parts: 4,
        rows: 2,
        marks: [1, 2],
        labels: ["1/4", "2/4"],
        markIds: ["mark-1", "mark-2"],
        labelIds: ["label-1", "label-2"],
      },
      steps: [
        backendStep({ highlights: [{ target: "mark-1", role: "active" }] }),
        backendStep({ ...QUARTERS.steps[1] }),
        backendStep({ ...QUARTERS.steps[2] }),
      ],
      ...over,
    });
  const typeAnswer = (value: string) => {
    fireEvent.change(screen.getByRole("textbox"), { target: { value } });
    tap("Check my answer");
  };

  it("shows the problem's notation while the step is asked, not a lone ?", () => {
    render13(BACKEND());

    expect(equation()).toBe("1/4 + 2/4 = ?");
    expect(document.querySelector("[data-token]")).toBeNull();
  });

  it("keeps each step's answer back until it is accepted (B127)", () => {
    render13(BACKEND());
    expect(equation()).not.toContain("4 and 4");

    pick("4 and 4");
    tap("Next step");
    pick("The numerators: 1 and 2");
    // The last step is asked: the line is the one before it, without its 3.
    expect(equation()).toBe("1 + 2 = ?");
    expect(equation()).not.toContain("3");

    typeAnswer("3");
    expect(equation()).toBe("1/4 + 2/4 = 3/4");
  });

  it("shows the step's assembles once it is accepted, not its bare answer", () => {
    render13(BACKEND());

    pick("4 and 4");
    expect(equation()).toBe("1/4 + 2/4 = ?/4");
    tap("Next step");
    expect(equation()).toBe("1/4 + 2/4 = ?/4");
    cleanup();

    // With no `fullEquation`, the last step's own assembles stands at the end.
    render13(BACKEND({ fullEquation: "", steps: [backendStep({ ...QUARTERS.steps[2] })] }));
    typeAnswer("3");
    expect(equation()).toBe("1/4 + 2/4 = 3/4");
  });

  it("still rings a mark by its id", () => {
    render13(BACKEND());

    expect(countIn(".outline-nevo-violet")()).toEqual([4, 0]);
  });
});
