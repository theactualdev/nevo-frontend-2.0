import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LAST_SAVED, LeaveLessonDialog } from "./LeaveLessonDialog";

/**
 * SCRUM-94: the Leave dialog's scrim is the Lesson Check frame's -
 * `rgba(43,43,47,0.55)`, near-black at 55% - where it was /30.
 */

afterEach(cleanup);

describe("the Leave dialog's scrim (SCRUM-94)", () => {
  it("dims the lesson behind it at 55%, never pure black", () => {
    render(
      <LeaveLessonDialog
        open
        onOpenChange={() => {}}
        resumable
        onLeave={() => {}}
      />,
    );
    expect(screen.getByRole("dialog")).toBeTruthy();

    const overlay = document.querySelector<HTMLElement>(
      "[data-state='open'].fixed.inset-0",
    );
    expect(overlay).not.toBeNull();
    expect(overlay!.className).toContain("bg-nevo-near-black/55");
    expect(overlay!.className).not.toMatch(/bg-nevo-near-black\/30|bg-black/);
  });
});

/**
 * LEAVING, REFRAMED (17d S7; the Lesson Check Frame's leave screen, 7 Nov):
 * "Leaving for now?", D88's sentence where the frame's "right where you are"
 * would claim more, the frame's second sentence, and Take a break beside
 * Leave for now.
 */
describe("the Leave dialog's words and choices", () => {
  const show = (over: Partial<Parameters<typeof LeaveLessonDialog>[0]> = {}) => {
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      resumable: true,
      onLeave: vi.fn(),
      onTakeBreak: vi.fn(),
      ...over,
    };
    render(<LeaveLessonDialog {...props} />);
    return props;
  };

  it("says the frame's heading, D88's sentence and the frame's second", () => {
    show();

    expect(screen.getByRole("heading", { name: "Leaving for now?" })).toBeTruthy();
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      `${LAST_SAVED} Stepping away and coming back later is a good thing to do.`,
    );
    expect(screen.queryByText(/right where you are/)).toBeNull();
  });

  it("says nothing of a saved place where none is written", () => {
    show({ resumable: false });

    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(
      "Stepping away and coming back later is a good thing to do.",
    );
  });

  it("offers Keep learning, Take a break and Leave for now, in that order", () => {
    const props = show();

    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Keep learning",
      "Take a break",
      "Leave for now",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Take a break" }));
    expect(props.onTakeBreak).toHaveBeenCalledOnce();
    expect(props.onLeave).not.toHaveBeenCalled();
  });
});
