import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReviewEntryScreen } from "./ReviewEntryScreen";

afterEach(() => cleanup());

describe("the review session's title (design, 13 Oct)", () => {
  it("is weight 600, not 700, which is kept for display numerals", () => {
    render(<ReviewEntryScreen lessonTitle="Photosynthesis" onBegin={vi.fn()} />);

    const title = screen.getByRole("heading", { level: 1, name: "Photosynthesis" });
    expect(title.className.split(" ")).toContain("font-semibold");
    expect(title.className).not.toMatch(/\bfont-bold\b/);
  });
});
