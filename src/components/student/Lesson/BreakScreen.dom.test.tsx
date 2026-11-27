import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BreakScreen, InPlaceBreak } from "./BreakScreen";
import { BREAK_PICTURES } from "@/components/shared/breakPictures";
import { BREAK_TYPES } from "@/lib/constants";

/**
 * A break can come after the connection has dropped, and its picture is
 * fetched only when the break begins. One that will not load is never drawn
 * as a broken box with its alt text in it. Lydia, 4 Nov: "reuse the lesson
 * picture's behaviour, retry and then the tile" - so it is asked for once
 * more, and then the lesson picture's quiet tile takes its place.
 */

afterEach(cleanup);

const tile = () => document.querySelector("[data-break-tile]");

describe("a break's picture that will not load", () => {
  it("is asked for once more, and shown if it comes", () => {
    render(<BreakScreen type={BREAK_TYPES.FULL} onDone={() => {}} />);
    const first = screen.getByRole("img", { name: "A figure lying down resting" });

    fireEvent.error(first);

    const again = screen.getByRole("img", { name: "A figure lying down resting" });
    expect(again).not.toBe(first);
    expect(tile()).toBeNull();
  });

  it("takes the lesson picture's quiet tile when the second try fails too", () => {
    render(<BreakScreen type={BREAK_TYPES.FULL} onDone={() => {}} />);

    fireEvent.error(screen.getByRole("img", { name: "A figure lying down resting" }));
    fireEvent.error(screen.getByRole("img", { name: "A figure lying down resting" }));

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("A figure lying down resting")).toBeNull();
    const t = tile() as HTMLElement;
    expect(t).not.toBeNull();
    expect(t).toHaveClass("bg-nevo-cream-elevated", "w-[280px]");
    // At the picture's own shape (3:2), so nothing on the screen moves.
    expect(t.style.aspectRatio).toBe("816 / 544");
    expect(t.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: "I'm back" })).toBeTruthy();
  });

  it.each([
    [BREAK_TYPES.MICRO, "A figure sitting calmly with eyes closed", "600 / 600"],
    [BREAK_TYPES.MOVEMENT, "A figure stretching arms overhead", "480 / 720"],
    [BREAK_TYPES.CONSOLIDATION, "A figure thinking, hand resting on chin", "304 / 456"],
  ])("does the same on the %s break", (type, alt, ratio) => {
    render(<BreakScreen type={type} onDone={() => {}} />);

    fireEvent.error(screen.getByRole("img", { name: alt }));
    expect(screen.getByRole("img", { name: alt })).toBeInTheDocument();
    fireEvent.error(screen.getByRole("img", { name: alt }));

    expect((tile() as HTMLElement).style.aspectRatio).toBe(ratio);
  });
});

/*
 * SERVED AS IT IS, AT THE SIZE IT IS DRAWN (backlog 20, 10 Nov). Each
 * picture was a 466-759 KB PNG sent through the image optimizer, which a
 * school tablet waited on. Now it is the file itself, already its size.
 */
describe("a break's picture, as the screen asks for it", () => {
  it.each([
    [BREAK_TYPES.MICRO, "A figure sitting calmly with eyes closed", BREAK_PICTURES.micro],
    [BREAK_TYPES.MOVEMENT, "A figure stretching arms overhead", BREAK_PICTURES.movement],
    [BREAK_TYPES.CONSOLIDATION, "A figure thinking, hand resting on chin", BREAK_PICTURES.consolidation],
    [BREAK_TYPES.FULL, "A figure lying down resting", BREAK_PICTURES.full],
  ])("is the %s break's own small file, never through the optimizer", (type, alt, picture) => {
    render(<BreakScreen type={type} onDone={() => {}} />);
    const img = screen.getByRole("img", { name: alt });
    // Written absolute for a picture loaded first (`priority`); the path is
    // what matters - the file itself, not `/_next/image?url=...`.
    const src = new URL(img.getAttribute("src") ?? "", window.location.href);

    expect(src.pathname).toBe(picture.src);
    expect(src.search).toBe("");
    expect(img.getAttribute("srcset")).toBeNull();
    expect(img.getAttribute("width")).toBe(String(picture.width));
    expect(img.getAttribute("height")).toBe(String(picture.height));
  });
});

/**
 * 18b (Lydia, 25 Nov, L12): the micro and consolidation breaks, taken in the
 * reading column. The break module's own picture, lines and chips, in a
 * filled card; one control ends it; nothing times it.
 */
describe("a break taken in place", () => {
  afterEach(() => vi.useRealTimers());

  it("draws the micro break's figure and line, with Keep going", () => {
    render(<InPlaceBreak type={BREAK_TYPES.MICRO} onDone={() => {}} />);

    expect(screen.getByRole("img", { name: "A figure sitting calmly with eyes closed" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Take a breath" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep going" })).toBeInTheDocument();
  });

  it("is a card in the column, not a dialog or a screen of its own", () => {
    const { container } = render(<InPlaceBreak type={BREAK_TYPES.MICRO} onDone={() => {}} />);

    expect(screen.queryByRole("dialog")).toBeNull();
    const card = container.querySelector("[data-break-in-place='micro']")!;
    expect(card).toHaveClass("bg-nevo-cream-elevated", "rounded-[12px]");
    expect(card.className).not.toMatch(/min-h-\[calc\(100dvh|fixed|inset-0/);
  });

  it("never ends itself: the child's Keep going does, with how long it lasted", () => {
    vi.useFakeTimers();
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    const onDone = vi.fn();
    const onEnd = vi.fn();
    const onStart = vi.fn();
    render(<InPlaceBreak type={BREAK_TYPES.MICRO} onDone={onDone} onEnd={onEnd} onStart={onStart} />);
    expect(onStart).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    expect(onDone).not.toHaveBeenCalled();

    now.mockReturnValue(13_500);
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
    expect(onEnd).toHaveBeenCalledExactlyOnceWith(12_500);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("asks the consolidation break's question with its six chips, and sends what was picked on Continue", () => {
    const onFeelings = vi.fn();
    const onDone = vi.fn();
    render(<InPlaceBreak type={BREAK_TYPES.CONSOLIDATION} onDone={onDone} onFeelings={onFeelings} />);

    expect(screen.getByRole("heading", { name: "How are you feeling right now?" })).toBeInTheDocument();
    expect(screen.getByText("Tap any that fit - there's no wrong answer.")).toBeInTheDocument();
    for (const f of ["Focused", "Curious", "Calm", "Tired", "A bit lost", "Restless"]) {
      expect(screen.getByRole("button", { name: f })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Calm" }));
    expect(screen.getByRole("button", { name: "Calm" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onFeelings).toHaveBeenCalledExactlyOnceWith(["Calm"]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("draws nothing for movement or full, which keep frame 18's screen", () => {
    const { container, rerender } = render(<InPlaceBreak type={BREAK_TYPES.MOVEMENT} onDone={() => {}} />);
    expect(container.innerHTML).toBe("");
    rerender(<InPlaceBreak type={BREAK_TYPES.FULL} onDone={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("says nothing about saving (D208)", () => {
    render(<InPlaceBreak type={BREAK_TYPES.CONSOLIDATION} onDone={() => {}} />);

    expect(document.body.textContent).not.toMatch(/sav|kept|progress/i);
  });
});
