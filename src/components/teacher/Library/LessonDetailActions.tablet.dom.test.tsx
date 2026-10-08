import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LessonDetailActions } from "./LessonDetailActions";

/**
 * C06b's tablet artboard stacks the actions under the title, reading from the
 * left, at 42px and 14px; desktop sets them beside it, right-aligned, at 44px
 * and 14.5px.
 */
describe("the lesson's actions", () => {
  it("read from the left under the title, and from the right beside it on desktop", () => {
    render(<LessonDetailActions lessonId="l-1" />);
    const assign = screen.getByRole("link", { name: "Assign to a class" });

    expect(assign.parentElement!.parentElement).toHaveClass("items-start", "xl:items-end");
  });

  it("take the tablet's 42px and 14px, and desktop's 44px and 14.5px", () => {
    render(<LessonDetailActions lessonId="l-1" />);

    expect(screen.getByRole("link", { name: "Assign to a class" })).toHaveClass(
      "h-[42px]",
      "text-sm",
      "xl:h-11",
      "xl:text-[14.5px]",
    );
  });

  it("left-aligns what is still to check under a stacked action", () => {
    render(
      <LessonDetailActions lessonId="l-1" ready={false} outstandingKeyPoints={2} />,
    );

    expect(screen.getByText(/2 key points still to check/)).toHaveClass("xl:text-right");
    expect(screen.getByText(/2 key points still to check/).className.split(" ")).not.toContain(
      "text-right",
    );
  });
});
