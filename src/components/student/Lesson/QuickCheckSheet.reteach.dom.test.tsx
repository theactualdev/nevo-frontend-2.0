import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import {
  GIVES_WAY_AFTER_MS,
  QuickCheckSheet,
  RECOVERY_LINE,
  RETEACH_COPY,
} from "./QuickCheckSheet";
import type { ReteachingResponse } from "@/lib/api/lessons";
import type { QuickCheck } from "@/lib/types";

/**
 * THE RE-TEACH BOX (17f, design 1397ec4; Lydia, 4 Nov, her 19: "the box shows
 * the guided steps only and the explanation is held back until after the
 * retry"). Everything it says is the server's: the steps are its re-teaching's
 * `screens`, the ways its `availableRoutes`, the explanation the check's own.
 * Nothing here is chosen by the check's level (tests 2 and 3 are the
 * server's to tell apart).
 */

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetContent: ({ children }: { children: ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const QUESTION = "During the day, which gas do plants take in to make their food?";
const EXPLANATION =
  "Plants take in carbon dioxide during the day and give out oxygen - the opposite of what we do when we breathe.";

const CHECK: QuickCheck = {
  id: "cp-1",
  question: QUESTION,
  options: [
    { id: "o2", label: "Oxygen" },
    { id: "co2", label: "Carbon dioxide" },
    { id: "n2", label: "Nitrogen" },
  ],
  correctId: "co2",
  correctNote: EXPLANATION,
  recoveryNote: "Not quite. Let's look again.",
  explanation: EXPLANATION,
  holds: true,
};

/**
 * THE HOST'S MARK, given straight back (test 9): the package's key, as the
 * player gives it where no reply comes. The sheet marks nothing itself.
 */
const byKey = ({ selectedId }: { selectedId: string }) =>
  selectedId === CHECK.correctId;

const RETEACHING: ReteachingResponse = {
  questionId: "cp-1",
  segmentId: "seg-1",
  availableRoutes: [
    { action: "format", format: "visual", label: "Try it as a picture" },
    { action: "slower", label: "Take it more slowly" },
  ],
  recommendedRoute: { action: "format", format: "visual", label: "Try it as a picture" },
  screens: [
    "Picture a leaf out in the sunshine.",
    "To make its food, the plant pulls one gas in from the air.",
    "Which of these three is the one it takes in?",
  ],
};

type Props = ComponentProps<typeof QuickCheckSheet>;
const mount = (over: Partial<Props> = {}) => {
  const props = {
    check: CHECK,
    open: true,
    onTapOut: vi.fn(),
    onAnswered: vi.fn(byKey),
    onContinue: vi.fn(),
    onTakeBreak: vi.fn(),
    onGiveWay: vi.fn(),
    onTakeWay: vi.fn(),
    reteaching: RETEACHING,
    ways: ["picture", "slower", "simpler", "audio", "activity", "text"] as Props["ways"],
    ...over,
  };
  const view = render(<QuickCheckSheet {...props} />);
  return { props, view };
};

const pickFirst = (label: string) =>
  fireEvent.click(screen.getByRole("button", { name: label }));
const option = (label: string) => screen.getByRole("button", { name: label });
const checkButton = () => screen.getByRole("button", { name: RETEACH_COPY.check });

describe("the re-teach box, on a miss the server re-teaches", () => {
  it("opens with the server's steps, numbered, and no explanation and no answer (R1)", () => {
    mount();
    pickFirst("Oxygen");

    expect(screen.getByText(RETEACH_COPY.title)).toBeInTheDocument();
    const steps = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(steps).toEqual([
      "1Picture a leaf out in the sunshine.",
      "2To make its food, the plant pulls one gas in from the air.",
      "3Which of these three is the one it takes in?",
    ]);
    expect(screen.queryByText(EXPLANATION)).toBeNull();
    expect(screen.queryByText(RECOVERY_LINE)).toBeNull();
    expect(document.body.textContent).not.toMatch(/wrong|incorrect|not quite/i);
  });

  it("holds the earlier pick calm, and keeps Check quiet until a new pick (R1)", () => {
    const { props } = mount();
    pickFirst("Oxygen");

    expect(option("Oxygen").className).toContain("bg-nevo-cream-elevated");
    expect(option("Oxygen")).toHaveAttribute("aria-pressed", "false");
    expect(checkButton()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(checkButton());
    // Only the first pick has been answered.
    expect(props.onAnswered).toHaveBeenCalledTimes(1);
  });

  it("makes Check the primary once a new pick is made, and sends it as an answer (R2)", () => {
    const { props } = mount();
    pickFirst("Oxygen");

    fireEvent.click(option("Carbon dioxide"));

    expect(option("Carbon dioxide")).toHaveAttribute("aria-pressed", "true");
    expect(checkButton()).toHaveAttribute("aria-disabled", "false");
    expect(checkButton().className).toContain("bg-nevo-navy");
    fireEvent.click(checkButton());
    expect(props.onAnswered).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedId: "co2" }),
    );
  });

  it("shows the explanation, as the server sends it, only after the retry is right (R3)", () => {
    const { props } = mount();
    pickFirst("Oxygen");
    fireEvent.click(option("Carbon dioxide"));
    fireEvent.click(checkButton());

    expect(screen.getByText(RETEACH_COPY.done)).toBeInTheDocument();
    expect(screen.getByText(EXPLANATION)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: RETEACH_COPY.keepGoing }));
    expect(props.onContinue).toHaveBeenCalledTimes(1);
  });

  it("says only \"That's it\" after a right retry on a check with no explanation", () => {
    mount({ check: { ...CHECK, explanation: undefined } });
    pickFirst("Oxygen");
    fireEvent.click(option("Carbon dioxide"));
    fireEvent.click(checkButton());

    expect(screen.getByText(RETEACH_COPY.done)).toBeInTheDocument();
    expect(screen.queryByText(EXPLANATION)).toBeNull();
  });

  it("offers another way after a second miss, still with no answer and no explanation (R4)", () => {
    const { props } = mount();
    pickFirst("Oxygen");
    fireEvent.click(option("Nitrogen"));
    fireEvent.click(checkButton());

    expect(props.onAnswered).toHaveBeenLastCalledWith(
      expect.objectContaining({ selectedId: "n2" }),
    );
    expect(screen.getByText(RETEACH_COPY.again)).toBeInTheDocument();
    expect(screen.getByText(RETEACH_COPY.waysLine)).toBeInTheDocument();
    expect(screen.queryByText(EXPLANATION)).toBeNull();
    expect(screen.queryByRole("button", { name: "Carbon dioxide" })).toBeNull();
    // 17f's ways, in its words, of those the server offers here - no others.
    expect(
      ["As a picture", "Listen to it", "Simpler"].map(
        (n) => screen.queryByRole("button", { name: n }) !== null,
      ),
    ).toEqual([true, true, true]);
    expect(screen.queryByRole("button", { name: /slow|step at a time|yourself|text/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "As a picture" }));
    expect(props.onTakeWay).toHaveBeenCalledWith("picture");
    fireEvent.click(screen.getByRole("button", { name: RETEACH_COPY.shortBreak }));
    expect(props.onTakeBreak).toHaveBeenCalledTimes(1);
  });

  it("draws no ways after a second miss where the server offers none of 17f's", () => {
    mount({ ways: ["slower"] });
    pickFirst("Oxygen");
    fireEvent.click(option("Nitrogen"));
    fireEvent.click(checkButton());

    expect(screen.getByText(RETEACH_COPY.again)).toBeInTheDocument();
    expect(screen.queryByText(RETEACH_COPY.waysLine)).toBeNull();
  });

  it("does not repeat the question as a step when the server has no steps but the question", () => {
    mount({ reteaching: { ...RETEACHING, screens: [QUESTION] } });
    pickFirst("Oxygen");

    expect(screen.getByText(RETEACH_COPY.title)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("never gives way while the box is open", () => {
    vi.useFakeTimers();
    const { props } = mount();
    pickFirst("Oxygen");

    act(() => void vi.advanceTimersByTime(GIVES_WAY_AFTER_MS * 3));

    expect(props.onGiveWay).not.toHaveBeenCalled();
    expect(screen.getByText(RETEACH_COPY.title)).toBeInTheDocument();
  });

  it("times the retry from the box opening (rule 4)", () => {
    let now = 1_000;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    try {
      const { props } = mount();
      now = 3_000;
      pickFirst("Oxygen");
      now = 10_000;
      fireEvent.click(option("Carbon dioxide"));
      fireEvent.click(checkButton());

      expect(props.onAnswered).toHaveBeenLastCalledWith({
        selectedId: "co2",
        responseTimeMs: 7_000,
      });
    } finally {
      clock.mockRestore();
    }
  });
});

describe("a miss the server does not re-teach", () => {
  it("is held and gives way, as before", () => {
    vi.useFakeTimers();
    const { props } = mount({ reteaching: { ...RETEACHING, questionId: "another" } });
    pickFirst("Oxygen");

    expect(screen.getByText(RECOVERY_LINE)).toBeInTheDocument();
    expect(screen.queryByText(RETEACH_COPY.title)).toBeNull();
    act(() => void vi.advanceTimersByTime(GIVES_WAY_AFTER_MS));
    expect(props.onGiveWay).toHaveBeenCalledTimes(1);
  });

  it("opens the box when the re-teaching arrives after the miss", () => {
    const { props, view } = mount({ reteaching: null });
    pickFirst("Oxygen");
    expect(screen.getByText(RECOVERY_LINE)).toBeInTheDocument();

    view.rerender(<QuickCheckSheet {...props} reteaching={RETEACHING} />);

    expect(screen.getByText(RETEACH_COPY.title)).toBeInTheDocument();
  });
});
