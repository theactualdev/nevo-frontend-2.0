import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LeaveLessonDialog } from "./LeaveLessonDialog";

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
