import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import type { CalculationVariant } from "@/lib/api/variants";
import type { AdaptationPlan, Lesson } from "@/lib/types";
import { ADJUSTMENT_ACTIONS } from "@/lib/constants";
import { offendingCalls } from "@/test/signalCatalogue";

/**
 * What a calculation tells the engine, from inside the player.
 *
 * `calculation_step_response` and `manipulative_piece_placed` sent keys the
 * catalogue never declared - `correct`, `placed`, `needed` - and not the one
 * it did, `stepId`, so the engine could not tell which step a child answered.
 * They send the catalogue's keys now, and the guard below holds every payload
 * these tests drive out of the player to the catalogue.
 */

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({
    offeredBreak: null,
    reason: null,
    forSegmentId: null,
    plan: null,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ sessionId: null, report: vi.fn() }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));

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
  confirmationText: "",
  visualUpdate: "",
  assembles: "1/4 + 2/4 = ?",
  equationState: "1/4 + 2/4 = ?/4",
  unit: null,
  narrationAudio: null,
  ...over,
});

const variant = (steps: ReturnType<typeof step>[]) =>
  ({
    type: "co_construction",
    conceptId: "c-1",
    fullEquation: "1/4 + 2/4 = 3/4",
    expression: "1/4 + 2/4",
    answer: "3/4",
    scaffold: null,
    manipulative: { kind: "fraction_bar", parts: 4, rows: 1, labels: [] },
    steps,
    completionStatement: "",
  }) as unknown as CalculationVariant;

const lessonWith = (steps: ReturnType<typeof step>[]): Lesson =>
  ({
    id: "l-1",
    title: "Fractions",
    segments: [
      {
        id: "calc-1",
        modalities: ["text", "interactive"],
        text: { heading: "Adding", body: { default: "Add them." } },
        calculationVariant: "co_construction",
        calculation: calculationFromVariant(variant(steps)),
      },
      {
        id: "after",
        modalities: ["text"],
        text: { heading: "After", body: { default: "Done." } },
      },
    ],
  }) as unknown as Lesson;

const PLAN: AdaptationPlan = {
  lessonId: "l-1",
  segments: [{ segmentId: "calc-1", startModality: "interactive" }],
};

const sent = (type: string) =>
  trackEvent.mock.calls
    .filter(([t]) => t === type)
    .map(([, payload]) => payload as Record<string, unknown>);

const tap = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  trackEvent.mockReset();
});

afterEach(() => {
  cleanup();
  expect(offendingCalls(trackEvent.mock.calls)).toEqual([]);
});

describe("a calculation's signals", () => {
  it("names the step answered, and never sends whether it was right", () => {
    render(<LessonPlayer lesson={lessonWith([step()])} plan={PLAN} />);

    tap("1 and 2");
    tap("Check my answer");
    tap("4 and 4");
    tap("Check my answer");

    expect(sent("calculation_step_response")).toEqual([
      { segmentId: "calc-1", stepId: "s1" },
      { segmentId: "calc-1", stepId: "s1" },
    ]);
    expect(sent("calculation_complete")).toEqual([{ segmentId: "calc-1" }]);
  });

  it("names the step a piece was placed on", () => {
    render(
      <LessonPlayer
        lesson={lessonWith([
          step({
            stepId: "b1",
            prompt: "Build the total.",
            expectedInput: "drag",
            input: "tap",
            options: [],
            answer: "2",
            tapCount: 2,
          }),
        ])}
        plan={PLAN}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "+ 1/4" })[0]);

    expect(sent("manipulative_piece_placed")).toEqual([
      { segmentId: "calc-1", stepId: "b1" },
    ]);
  });

  it("tells the engine when the child opens a step's hint", () => {
    render(<LessonPlayer lesson={lessonWith([step()])} plan={PLAN} />);

    tap("Need a hint?");

    // Shown and acted on, with the concept the payload names.
    expect(sent("hint_offered")).toEqual([{ segmentId: "calc-1", conceptId: "c-1" }]);
    expect(sent("hint_used")).toEqual([{ segmentId: "calc-1", conceptId: "c-1" }]);
  });

  it("sends no hint event for a miss - the engine decides those", () => {
    render(<LessonPlayer lesson={lessonWith([step()])} plan={PLAN} />);

    tap("1 and 2");
    tap("Check my answer");
    tap("Check my answer");

    expect(sent("hint_offered")).toEqual([]);
    expect(sent("hint_used")).toEqual([]);
  });

  it("reports a step's narration the way the audio card reports its own", () => {
    render(
      <LessonPlayer
        lesson={lessonWith([
          step({
            narrationAudio: {
              audioUrl: "https://cdn.example/s1.mp3",
              storagePath: null,
            },
          }),
        ])}
        plan={PLAN}
      />,
    );
    const audio = document.querySelector("audio")!;

    fireEvent.play(audio);
    fireEvent.ended(audio);
    tap("Play narration");
    fireEvent.error(audio);

    expect(sent("narration_played")).toEqual([{ segmentId: "calc-1" }]);
    expect(sent("replay")).toEqual([{ segmentId: "calc-1" }]);
    expect(sent("system_busy")).toHaveLength(1);
    // No storage path to re-issue from, so the first failure is the failure.
    expect(sent("media_load_failed")).toEqual([
      expect.objectContaining({ segmentId: "calc-1", channel: "audio" }),
    ]);
  });

  it("takes reading support from the plan the other segments read (D30)", () => {
    render(
      <LessonPlayer
        lesson={lessonWith([step()])}
        plan={{ ...PLAN, accommodations: { reading: true } }}
      />,
    );

    expect(screen.getByText("What are the denominators?")).toHaveClass(
      "tracking-[0.01em]",
    );
    expect(screen.getByRole("button", { name: "4 and 4" })).toHaveClass(
      "leading-[2]",
    );
  });

  it("leaves the calculation as drawn without it", () => {
    render(<LessonPlayer lesson={lessonWith([step()])} plan={PLAN} />);

    expect(screen.getByText("What are the denominators?")).not.toHaveClass(
      "tracking-[0.01em]",
    );
    expect(screen.getByRole("button", { name: "4 and 4" })).not.toHaveClass(
      "leading-[2]",
    );
  });

  it("does not read its own move of the column as the child scrolling", () => {
    /*
     * The solver brings a number step into view above the docked pad - the
     * system moving the column, like the focus move onto a segment - so no
     * `scroll` goes up for it. jsdom lays nothing out: the column, the
     * step's parts and the move itself are given here, and the resize that
     * prompts the move is delivered by hand, after the segment has opened.
     */
    const style = document.createElement("style");
    style.textContent = ".overflow-y-auto { overflow-y: auto; }";
    document.head.append(style);
    const observers: (() => void)[] = [];
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
    const rect = (top: number, bottom: number) =>
      ({ top, bottom, height: bottom - top, left: 0, right: 375, width: 375, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    const PARTS: Record<string, DOMRect> = {
      prompt: rect(500, 526),
      form: rect(540, 700),
      field: rect(560, 632),
      hint: rect(716, 760),
    };
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        if (this.classList.contains("overflow-y-auto")) return rect(100, 400);
        return PARTS[this.getAttribute("data-reveal") ?? ""] ?? rect(0, 0);
      },
    );
    const before = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = () => {
      const column = document.querySelector(".overflow-y-auto")!;
      Object.defineProperties(column, {
        scrollTop: { value: 360, configurable: true },
        clientHeight: { value: 300, configurable: true },
        scrollHeight: { value: 900, configurable: true },
      });
    };
    try {
      render(
        <LessonPlayer
          lesson={lessonWith([
            step({ prompt: "So what is 1 + 2?", expectedInput: "numeric", input: "number", options: [], answer: "3" }),
          ])}
          plan={PLAN}
        />,
      );
      act(() => observers.splice(0).forEach((cb) => cb()));
      fireEvent.scroll(document.querySelector(".overflow-y-auto")!);

      expect(sent("scroll")).toEqual([]);
    } finally {
      Element.prototype.scrollIntoView = before;
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      style.remove();
    }
  });

  it("docks the number pad on the bottom edge, under the pinned arrows (D150)", () => {
    render(
      <LessonPlayer
        lesson={lessonWith([
          step({
            prompt: "So what is 1 + 2?",
            expectedInput: "numeric",
            input: "number",
            options: [],
            answer: "3",
          }),
        ])}
        plan={PLAN}
      />,
    );
    const pad = screen.getByRole("group", { name: "On-screen keyboard" });
    const nav = screen.getByRole("button", { name: "Next" }).closest("nav")!;
    const column = document.querySelector(".overflow-y-auto")!;

    // Out of the column that scrolls, last in the player, after the arrows.
    expect(column).not.toContainElement(pad);
    expect(pad.closest("[data-pad-dock]")).toBe(nav.parentElement!.lastElementChild);
    expect(nav.compareDocumentPosition(pad) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is one screen high, the column its only scroller", () => {
    render(<LessonPlayer lesson={lessonWith([step()])} plan={PLAN} />);
    const nav = screen.getByRole("button", { name: "Next" }).closest("nav")!;
    const player = nav.parentElement!;

    // The header and the arrows stay put; only the column moves.
    expect(player.className).toContain("h-[calc(100dvh/var(--nevo-text-zoom,1))]");
    expect(player.className).not.toContain("min-h-[100dvh]");
    expect(document.querySelector(".overflow-y-auto")).toHaveClass("min-h-0", "flex-1");
  });

  it("offers no pacing chips over the solver, so a tap can send no slower_trigger", () => {
    // The segment's text could be chunked, but the solver is what is on
    // screen, and 17a draws no density pill there.
    const lesson = lessonWith([step()]);
    lesson.segments[0].text = {
      heading: "Adding",
      body: { default: "One idea here. A second idea here. A third idea here." },
    } as Lesson["segments"][number]["text"];
    render(<LessonPlayer lesson={lesson} plan={PLAN} />);

    expect(screen.getByText("What are the denominators?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Slower" })).toBeNull();
    expect(sent("slower_trigger")).toEqual([]);
    // Nor a held row: 17a draws none on the solver, and it needs the room.
    expect(document.querySelector("header .invisible")).toBeNull();
  });

  it("shows the engine's hint in the step's hint place, with no second offer beside it", () => {
    const HINT = "Look at the number under each line.";
    render(
      <LessonPlayer
        lesson={lessonWith([step()])}
        plan={{ ...PLAN, adjustment: ADJUSTMENT_ACTIONS.OFFER_HINT, hint: HINT }}
      />,
    );
    const hint = screen.getByText(HINT);
    const prompt = screen.getByText("What are the denominators?");
    const firstOption = screen.getByRole("button", { name: "4 and 4" });

    // 17a's "hint auto-shown": the pill between the prompt and the response.
    expect(prompt.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hint.compareDocumentPosition(firstOption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Need a hint?" })).toBeNull();
    expect(sent("hint_offered")).toEqual([{ segmentId: "calc-1" }]);

    // D29: the child can close it, and their own hint is on offer again.
    tap("Close hint");
    expect(screen.queryByText(HINT)).toBeNull();
    expect(screen.getByRole("button", { name: "Need a hint?" })).toBeInTheDocument();
  });

  it("holds the forward chevron until the solution has assembled", () => {
    render(<LessonPlayer lesson={lessonWith([step()])} plan={PLAN} />);
    tap("Next");
    // Held: still on the calculation.
    expect(screen.getByText("What are the denominators?")).toBeInTheDocument();

    tap("4 and 4");
    tap("Check my answer");
    tap("Next");

    expect(screen.getByRole("heading", { name: "After" })).toBeInTheDocument();
  });

  it("keeps Next pressable while a step is unsolved, and says why in place (D211)", () => {
    const ONE_MORE_BIT = "There's one more bit to do first.";
    render(<LessonPlayer lesson={lessonWith([step()])} plan={PLAN} />);
    const next = screen.getByRole("button", { name: "Next" });

    // Not greyed out, and nothing said until it is pressed.
    expect(next).toBeEnabled();
    expect(next.className).not.toMatch(/cursor-not-allowed/);
    expect(screen.queryByText(ONE_MORE_BIT)).toBeNull();

    tap("Next");
    expect(screen.getByText(ONE_MORE_BIT)).toBeInTheDocument();
    // Through the press itself, however often it comes.
    tap("Next");
    expect(screen.getByText(ONE_MORE_BIT)).toBeInTheDocument();

    // The child acts on the step: the line has done its job, and the column
    // gets its room back for the step.
    tap("4 and 4");
    expect(screen.queryByText(ONE_MORE_BIT)).toBeNull();
  });

  it("takes the line away on the next key on the pad, or the hint (D211)", () => {
    const ONE_MORE_BIT = "There's one more bit to do first.";
    render(
      <LessonPlayer
        lesson={lessonWith([
          step({
            prompt: "So what is 1 + 2?",
            expectedInput: "numeric",
            input: "number",
            options: [],
            answer: "3",
          }),
        ])}
        plan={PLAN}
      />,
    );

    tap("Next");
    expect(screen.getByText(ONE_MORE_BIT)).toBeInTheDocument();
    tap("1");
    expect(screen.queryByText(ONE_MORE_BIT)).toBeNull();

    tap("Next");
    expect(screen.getByText(ONE_MORE_BIT)).toBeInTheDocument();
    tap("Need a hint?");
    expect(screen.queryByText(ONE_MORE_BIT)).toBeNull();
  });

  it("sets the line in line with the step, in the reading column's box (D211)", () => {
    render(<LessonPlayer lesson={lessonWith([step()])} plan={PLAN} />);
    tap("Next");

    const line = screen.getByText("There's one more bit to do first.");
    const row = line.parentElement!;
    const column = document.querySelector(".overflow-y-auto > div")!;
    const solver = document.querySelector('[aria-live="polite"]')!.parentElement!;
    const classes = (el: Element) => el.className.split(" ");

    // It spanned the screen less 14px a side, wider than the step above it.
    // Now the reading column's widths and side padding...
    const widths = ["max-w-full", "sm:max-w-[620px]", "lg:max-w-[680px]"];
    expect(classes(column)).toEqual(expect.arrayContaining(widths));
    expect(classes(row)).toEqual(expect.arrayContaining(widths));
    expect(classes(column)).toEqual(
      expect.arrayContaining(["p-6", "sm:p-8", "lg:p-10"]),
    );
    expect(classes(row)).toEqual(
      expect.arrayContaining(["px-6", "sm:px-8", "lg:px-10"]),
    );
    // ...and then the solver's narrower one.
    const narrower = ["sm:max-w-[560px]", "lg:max-w-[600px]"];
    expect(classes(solver)).toEqual(expect.arrayContaining(narrower));
    expect(classes(line)).toEqual(expect.arrayContaining(narrower));
  });
});
