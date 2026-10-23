import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import type { Lesson } from "@/lib/types";

/**
 * THE PLAYER'S LAYOUT, AS FRAME d6b9fbc'S SOURCE MEASURES IT (the 22 Oct
 * on-screen check found us off on each):
 *  - the reading column is 620px (tablet) and 680px (desktop) INSIDE the
 *    frame's 32px and 40px side padding - ours put the padding inside the
 *    max width, so the text was 556 at x132 at 820 wide and 600 at x340 at
 *    1280, where the frame's is 620 at x100 and 680 at x300;
 *  - the position line is 11px text inline in a row at `normal`, so the row
 *    is the frame's 27px and the bar starts where the frame's does - ours
 *    made the text a block of its own on the inherited 1.5, 24px;
 *  - the track is near-black at 10% with square ends, not navy at 12% with
 *    rounded ones. No ruling set ours: it came from the onboarding design
 *    reference (16 Jul), which the other callers keep.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent: vi.fn() }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ suggestion: null, breakSuggestion: null }),
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ sessionId: null, report: vi.fn() }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const LESSON = {
  id: "lesson-1",
  title: "Osmosis",
  segments: ["seg-1", "seg-2"].map((id) => ({
    id,
    modalities: ["text"],
    text: { heading: id, body: { default: `Body of ${id}.` } },
  })),
} as unknown as Lesson;

const classes = (el: Element) => el.className.split(" ");

afterEach(() => cleanup());

describe("the lesson's layout, as the frame measures it", () => {
  it("sets the reading column inside its side padding, 620 and 680 wide", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);
    const column = document.querySelector(".overflow-y-auto > div")!;

    // The box is the column plus its padding: 620 + 2 x 32, and 680 + 2 x 40.
    expect(classes(column)).toEqual(
      expect.arrayContaining([
        "mx-auto",
        "max-w-full",
        "sm:max-w-[684px]",
        "sm:p-8",
        "lg:max-w-[760px]",
        "lg:p-10",
      ]),
    );
    expect(classes(column)).not.toContain("sm:max-w-[620px]");
    expect(classes(column)).not.toContain("lg:max-w-[680px]");
  });

  it("runs the position line inline in a row at a normal line height", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);
    const text = screen.getByText(/Segment 1 of 2/, { selector: "span" });
    const row = text.parentElement!;

    expect(classes(text)).toEqual(
      expect.arrayContaining(["font-mono", "text-[11px]", "leading-[normal]"]),
    );
    expect(classes(text)).not.toContain("block");
    expect(classes(row)).toEqual(
      expect.arrayContaining(["px-4", "pb-[7px]", "leading-[normal]"]),
    );
  });

  it("draws the progress track near-black at 10%, with square ends", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);
    const track = screen.getByRole("progressbar");
    const fill = track.firstElementChild!;

    expect(classes(track)).toContain("bg-nevo-near-black/10");
    expect(classes(track)).not.toContain("bg-nevo-navy/12");
    expect(classes(track)).not.toContain("rounded-full");
    expect(classes(fill)).toContain("bg-nevo-violet");
    expect(classes(fill)).not.toContain("rounded-full");
  });
});
