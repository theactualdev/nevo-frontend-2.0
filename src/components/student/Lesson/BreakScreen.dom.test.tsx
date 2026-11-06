import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BreakScreen } from "./BreakScreen";
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
    // At the picture's own shape, so nothing on the screen moves.
    expect(t.style.aspectRatio).toBe("1536 / 1024");
    expect(t.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("button", { name: "I'm back" })).toBeTruthy();
  });

  it.each([
    [BREAK_TYPES.MICRO, "A figure sitting calmly with eyes closed", "1254 / 1254"],
    [BREAK_TYPES.MOVEMENT, "A figure stretching arms overhead", "1024 / 1536"],
    [BREAK_TYPES.CONSOLIDATION, "A figure thinking, hand resting on chin", "1024 / 1536"],
  ])("does the same on the %s break", (type, alt, ratio) => {
    render(<BreakScreen type={type} onDone={() => {}} />);

    fireEvent.error(screen.getByRole("img", { name: alt }));
    expect(screen.getByRole("img", { name: alt })).toBeInTheDocument();
    fireEvent.error(screen.getByRole("img", { name: alt }));

    expect((tile() as HTMLElement).style.aspectRatio).toBe(ratio);
  });
});
