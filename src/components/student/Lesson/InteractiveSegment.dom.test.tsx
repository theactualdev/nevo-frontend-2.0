import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InteractiveSegment } from "./InteractiveSegment";
import { lessonFromContent } from "@/lib/lessons/fromContent";
import type { LessonDetailResponse } from "@/lib/api/lessons";
import type { InteractiveContent } from "@/lib/types";

/**
 * A step card is a button whose text sits only in nested spans - the pattern
 * the 20 Oct production run's accessibility read found unnamed on the
 * key-term chips. It is named on the button itself, as the card reads.
 */

afterEach(() => cleanup());

const CONTENT = {
  heading: "Grow a bean",
  steps: ["Fold a wet paper towel.", "Put the bean inside."],
  outcome: { pending: "Wait a few days.", done: "A root appears." },
};

describe("the step cards", () => {
  it("are named on the button, step number and all", () => {
    render(<InteractiveSegment content={CONTENT} />);

    const first = screen.getByRole("button", {
      name: "Step 1: Fold a wet paper towel.",
    });
    expect(first).toHaveAttribute("aria-label", "Step 1: Fold a wet paper towel.");
    expect(
      screen.getByRole("button", { name: "Step 2: Put the bean inside." }),
    ).toHaveAttribute("aria-label", "Step 2: Put the bean inside.");
  });

  it("still say which are ticked", () => {
    render(<InteractiveSegment content={CONTENT} />);

    const first = screen.getByRole("button", {
      name: "Step 1: Fold a wet paper towel.",
    });
    expect(first).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
  });
});

/*
 * THE ACTIVITY'S TWO LINES (backend SCRUM-273, acc5b27; frame d6b9fbc). An
 * activity carries up to two authored lines: what to watch for while the
 * child works, and what to see once every step is ticked. Each is optional
 * and independent, which makes the frame's four supply states. The line for
 * the moment is drawn only when it was sent - no label, no tick, no intro
 * paragraph, and no box at all where there is no line.
 */
const STEPS = ["Fold a wet paper towel.", "Put the bean inside."];
const WHILE = "Look for a white root pushing out of the bean.";
const AFTER = "That root is the bean starting to grow.";

const activity = (outcome?: InteractiveContent["outcome"]): InteractiveContent => ({
  heading: "Grow a bean",
  // Sent, and never drawn since d6b9fbc.
  intro: "Tick each step as you go - there's no rush.",
  needs: ["A bean", "A paper towel"],
  steps: STEPS,
  ...(outcome ? { outcome } : {}),
});

const tick = (i: number) =>
  fireEvent.click(
    screen.getByRole("button", { name: `Step ${i + 1}: ${STEPS[i]}` }),
  );
const tickAll = () => STEPS.forEach((_, i) => tick(i));

/** The card, top to bottom, as the child sees it. */
const card = (container: HTMLElement) =>
  [...container.querySelector("article")!.children].map((el) => {
    if (el.tagName === "H2") return "heading";
    if (el.tagName === "OL") return "steps";
    if (/need/i.test(el.textContent ?? "")) return "needs";
    return `${el.tagName.toLowerCase()}: ${el.textContent}`;
  });

describe("the four supply states the frame draws", () => {
  it("both lines: the in-progress line while working, the outcome once every step is ticked", () => {
    const { container } = render(
      <InteractiveSegment content={activity({ pending: WHILE, done: AFTER })} />,
    );

    expect(card(container)).toEqual(["heading", "needs", "steps", `div: ${WHILE}`]);
    tick(0);
    expect(card(container)).toEqual(["heading", "needs", "steps", `div: ${WHILE}`]);
    tick(1);
    expect(card(container)).toEqual(["heading", "needs", "steps", `div: ${AFTER}`]);
  });

  it("in-progress only: the line while working, and nothing new at the end", () => {
    const { container } = render(
      <InteractiveSegment content={activity({ pending: WHILE })} />,
    );

    expect(card(container)).toEqual(["heading", "needs", "steps", `div: ${WHILE}`]);
    tickAll();
    expect(card(container)).toEqual(["heading", "needs", "steps"]);
  });

  it("completion only: the steps alone until they are done, then the outcome", () => {
    const { container } = render(
      <InteractiveSegment content={activity({ done: AFTER })} />,
    );

    expect(card(container)).toEqual(["heading", "needs", "steps"]);
    tick(0);
    expect(card(container)).toEqual(["heading", "needs", "steps"]);
    tick(1);
    expect(card(container)).toEqual(["heading", "needs", "steps", `div: ${AFTER}`]);
  });

  it("neither: the steps are the whole card, before and after", () => {
    const { container } = render(<InteractiveSegment content={activity()} />);

    expect(card(container)).toEqual(["heading", "needs", "steps"]);
    tickAll();
    expect(card(container)).toEqual(["heading", "needs", "steps"]);
  });
});

describe("the line's box", () => {
  it("carries no label and no tick, while working or once done", () => {
    render(
      <InteractiveSegment content={activity({ pending: WHILE, done: AFTER })} />,
    );
    /** The box round a line: the line, and nothing else in it. */
    const box = (line: string) => screen.getByText(line).parentElement!;

    expect(screen.queryByText(/what you should see/i)).toBeNull();
    expect(box(WHILE).querySelector("svg")).toBeNull();
    expect(box(WHILE).children).toHaveLength(1);
    tickAll();
    expect(screen.queryByText(/what you should see/i)).toBeNull();
    expect(box(AFTER).querySelector("svg")).toBeNull();
    expect(box(AFTER).children).toHaveLength(1);
  });

  it("reads in one tone, the near-black, while working and once done", () => {
    render(
      <InteractiveSegment content={activity({ pending: WHILE, done: AFTER })} />,
    );
    const working = screen.getByText(WHILE).className;
    tickAll();
    const finished = screen.getByText(AFTER).className;

    expect(finished).toBe(working);
    expect(working.split(" ")).toContain("text-nevo-near-black");
    expect(working).not.toMatch(/text-nevo-near-black\//);
  });

  it("is the frame's box: 14px 16px padding, cream-elevated, 12px corners, 14px below the steps", () => {
    render(<InteractiveSegment content={activity({ pending: WHILE })} />);
    const classes = screen.getByText(WHILE).parentElement!.className.split(" ");

    expect(classes).toEqual(
      expect.arrayContaining([
        "mt-3.5",
        "rounded-[12px]",
        "bg-nevo-cream-elevated",
        "px-4",
        "py-3.5",
        "shadow-elevation-1",
      ]),
    );
  });

  it("is absent - no element at all - when the line for the moment is", () => {
    for (const outcome of [
      undefined,
      {},
      { pending: "" },
      { done: AFTER },
    ] as InteractiveContent["outcome"][]) {
      const { container } = render(
        <InteractiveSegment content={activity(outcome)} />,
      );
      const article = container.querySelector("article")!;
      // Nothing after the steps: no empty box, no reserved space.
      expect(article.lastElementChild?.tagName).toBe("OL");
      cleanup();
    }
    // Once done, with only the in-progress line sent.
    const { container } = render(
      <InteractiveSegment content={activity({ pending: WHILE })} />,
    );
    tickAll();
    expect(container.querySelector("article")!.lastElementChild?.tagName).toBe("OL");
  });
});

describe("the rest of the card, as the frame trims it", () => {
  it("draws no introduction paragraph", () => {
    const { container } = render(
      <InteractiveSegment content={activity({ pending: WHILE })} />,
    );

    expect(screen.queryByText(/there's no rush/)).toBeNull();
    expect(container.querySelector("article > p")).toBeNull();
  });

  it("sits the steps closer, so the in-progress line fits on a phone", () => {
    const { container } = render(
      <InteractiveSegment content={activity({ pending: WHILE })} />,
    );
    const needs = screen.getByText(/need/i).parentElement!.className.split(" ");
    const list = container.querySelector("ol")!.className.split(" ");
    const step = screen
      .getByRole("button", { name: `Step 1: ${STEPS[0]}` })
      .className.split(" ");

    expect(needs).toEqual(expect.arrayContaining(["mt-4", "py-[11px]", "px-4"]));
    expect(list).toEqual(expect.arrayContaining(["mt-3.5", "gap-2"]));
    expect(step).toEqual(expect.arrayContaining(["py-[11px]", "px-4"]));
  });
});

/*
 * OSMOSIS SECTION 4, as the server now sends it (acc5b27): six steps and the
 * outcome restored from the source's "What you should see" paragraph, and no
 * `inProgress`, which the source never had. So the box appears only once all
 * six steps are ticked. The steps and line below are this test's own, shaped
 * like that payload; read from the wire, through the adapter.
 */
describe("an activity read from the wire with its outcome alone", () => {
  const SIX = [
    "Cut two strips of yam the same size.",
    "Measure each strip.",
    "Put one strip in plain water.",
    "Put the other strip in salt water.",
    "Leave both for thirty minutes.",
    "Take them out and measure them again.",
  ];
  const OUTCOME = "The strip in plain water is firmer; the one in salt water is softer.";
  const fromWire = () =>
    lessonFromContent({
      id: "osmosis",
      title: "Osmosis",
      confirmationSummary: null,
      segments: [
        {
          id: "seg-4",
          segmentKey: "s4",
          contentType: "explanatory_text",
          sequenceOrder: 4,
          title: "Osmosis in a yam",
          body: "Water moves across a membrane.",
          availableModalities: ["text", "interactive"],
          comprehensionCheckpoints: [],
          textVariant: null,
          visualVariant: null,
          audioVariant: null,
          interactiveVariant: {
            type: "activity",
            title: "Watch a yam strip change",
            materials: [],
            steps: SIX.map((instruction, i) => ({ id: `a${i}`, instruction })),
            outcome: OUTCOME,
          },
          calculationVariant: null,
          needsReview: false,
          reviewReasons: [],
        },
      ],
    } as unknown as LessonDetailResponse)!.segments[0].interactive!;

  it("shows no box until all six steps are ticked, then the outcome alone", () => {
    const { container } = render(<InteractiveSegment content={fromWire()} />);
    const article = () => container.querySelector("article")!;

    SIX.slice(0, 5).forEach((s, i) =>
      fireEvent.click(screen.getByRole("button", { name: `Step ${i + 1}: ${s}` })),
    );
    expect(article().lastElementChild?.tagName).toBe("OL");

    fireEvent.click(screen.getByRole("button", { name: `Step 6: ${SIX[5]}` }));
    expect(article().lastElementChild?.textContent).toBe(OUTCOME);
  });
});

/*
 * MEASURED IN THE FRAME'S SOURCE (22 Oct on-screen check, d6b9fbc). The
 * checkbox is a 24px box with its 2px border outside - the frame sets no
 * border-box - so 28px square, and the step text starts 56px into the card,
 * not 52. The heading and the "STEP n" label set no line-height, so both are
 * `normal`: a 12px line on the label, not 15, so each card is 3px shorter.
 */
describe("the card's measurements, as the frame draws them", () => {
  const classes = (el: Element) => el.className.split(" ");

  it("draws the checkbox 28px square", () => {
    render(<InteractiveSegment content={activity()} />);
    const box = screen.getByRole("button", { name: `Step 1: ${STEPS[0]}` })
      .firstElementChild!;

    expect(classes(box)).toContain("size-7");
    expect(classes(box)).not.toContain("size-6");
    expect(classes(box)).toContain("border-2");
  });

  it("sets the STEP label on a normal line, not the inherited 1.5", () => {
    render(<InteractiveSegment content={activity()} />);
    const label = screen.getByText("Step 1");

    expect(classes(label)).toEqual(
      expect.arrayContaining(["text-[10px]", "leading-[normal]"]),
    );
  });

  it("sets the heading on a normal line", () => {
    render(<InteractiveSegment content={activity()} />);
    const heading = screen.getByRole("heading", { name: "Grow a bean" });

    expect(classes(heading)).toContain("leading-[normal]");
    expect(classes(heading)).not.toContain("leading-[1.3]");
  });
});
