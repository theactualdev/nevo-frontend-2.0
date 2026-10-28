import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { LessonSegment } from "@/lib/api/lessons";

const { approveSegment, review } = vi.hoisted(() => ({
  approveSegment: vi.fn(),
  review: vi.fn(),
}));
vi.mock("@/lib/api/lessons", () => ({ lessonsApi: { approveSegment, review } }));
vi.mock("@/components/shared/IllustrationWrapper", () => ({
  IllustrationWrapper: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

import { LiveVariantReview } from "./LiveVariantReview";

/**
 * The variant review once C07b's approve step is retired (Lydia, 19 Oct).
 *
 * "C07b's per-segment approve step is retired; it keeps its assignment steps."
 * This screen approved one section at a time, through a route backend has now
 * deprecated in favour of C07k's lesson-wide sign-off. What is left is the
 * reading - the variants, the pills between sections - and C07b-1's card,
 * which sends a teacher to the four-step review.
 */

const seg = (over: Partial<LessonSegment> = {}): LessonSegment =>
  ({
    id: "seg-1",
    segmentKey: "s1",
    contentType: "explanation",
    sequenceOrder: 1,
    title: "Common denominators",
    body: "…",
    availableModalities: [],
    comprehensionCheckpoints: [],
    needsReview: false,
    reviewReasons: [],
    approved: false,
    approvedAt: null,
    textVariant: { body: "Find a common denominator first.", keyPoints: [] },
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    ...over,
  }) as unknown as LessonSegment;

const show = (over: Partial<LessonSegment> = {}, segmentCount = 5) =>
  render(
    <LiveVariantReview
      lessonId="l-1"
      lessonTitle="Adding unlike denominators"
      segment={seg(over)}
      sectionIndex={2}
      segmentCount={segmentCount}
    />,
  );

beforeEach(() => {
  approveSegment.mockReset();
  review.mockReset();
});

describe("the retired approve step", () => {
  it("offers no approval on a section that is not approved", () => {
    show();

    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
  });

  it("names itself as the review's rewrites step, and goes back to it (C16d)", () => {
    show();

    expect(screen.getByRole("link", { name: /Lesson review · Rewrites/ })).toHaveAttribute(
      "href",
      "/teacher/lessons/l-1/review?step=4",
    );
    // C07b is deleted (design 0d46d4f), and its card with it.
    expect(screen.queryByText("Reviewing happens in four calm steps now")).not.toBeInTheDocument();
  });

  it("calls neither the deprecated approval nor the review", () => {
    show({ visualVariant: { imageUrl: null, caption: "x", reviewedBy: null } as never });
    for (const tab of screen.getAllByRole("tab")) fireEvent.click(tab);

    expect(approveSegment).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
  });

  it("keeps the variants readable", () => {
    show();

    expect(screen.getByText("Find a common denominator first.")).toBeInTheDocument();
  });
});

describe("the progress line", () => {
  it("counts sections when the total is known", () => {
    show({}, 5);

    expect(screen.getByText(/reviewing section 2 of 5/i)).toBeInTheDocument();
  });

  it("states no total it was not given", () => {
    // The count is not derivable from one segment, and inventing it would be
    // a number nobody measured.
    render(
      <LiveVariantReview
        lessonId="l-1"
        lessonTitle="Adding unlike denominators"
        segment={seg()}
        sectionIndex={2}
      />,
    );

    expect(screen.getByText(/reviewing section 2$/i)).toBeInTheDocument();
    expect(screen.queryByText(/of 5/i)).not.toBeInTheDocument();
  });
});

/**
 * T58. The picture's sign-off line read the segment the page loaded with, so
 * the teacher who had just approved it was told nobody had.
 */
describe("the picture's sign-off line", () => {
  const PICTURE = { imageUrl: null, caption: "A leaf in cross-section", reviewedBy: null };
  const visual = () => fireEvent.click(screen.getByRole("tab", { name: "Visual" }));

  it("says nobody has signed it off while the section waits", () => {
    show({ visualVariant: PICTURE as never });
    visual();

    expect(screen.getByText("No one has signed this picture off yet.")).toBeInTheDocument();
  });

  it("does not say so of a section approved before the page opened", () => {
    show({ approved: true, visualVariant: PICTURE as never });
    visual();

    expect(screen.queryByText("No one has signed this picture off yet.")).not.toBeInTheDocument();
  });

  it("still names who signed it off, when the server says", () => {
    show({ approved: true, visualVariant: { ...PICTURE, reviewedBy: "Ms Bello" } as never });
    visual();

    expect(screen.getByText("Signed off by Ms Bello.")).toBeInTheDocument();
  });
});

/**
 * T54. One section per URL, and no way to the next but back to the lesson.
 * C07b draws a pill per section.
 */
describe("the section pills", () => {
  const pills = () => screen.getByRole("navigation", { name: "Sections" });

  it("draws one per section, each its own address", () => {
    show({}, 5);
    const links = Array.from(pills().querySelectorAll("a"));

    expect(links.map((a) => a.textContent)).toEqual([
      "Section 1",
      "Section 2",
      "Section 3",
      "Section 4",
      "Section 5",
    ]);
    expect(links[3]).toHaveAttribute("href", "/teacher/lessons/l-1/variants?section=4");
  });

  it("marks this section as the current one, in the frame's filled pill", () => {
    show({}, 5);
    const here = screen.getByRole("link", { name: "Section 2" });

    expect(here).toHaveAttribute("aria-current", "page");
    expect(here.className).toMatch(/bg-nevo-navy/);
  });

  it("tints the sections before this one and leaves the rest plain", () => {
    show({}, 5);

    expect(screen.getByRole("link", { name: "Section 1" }).className).toMatch(/bg-nevo-violet\/12/);
    expect(screen.getByRole("link", { name: "Section 3" }).className).toMatch(/bg-nevo-cream-elevated/);
    expect(screen.getByRole("link", { name: "Section 3" })).not.toHaveAttribute("aria-current");
  });

  it("draws none for a lesson of one section", () => {
    show({}, 1);

    expect(screen.queryByRole("navigation", { name: "Sections" })).not.toBeInTheDocument();
  });
});

/**
 * DESIGN, 8 OCT: at tablet the review note conforms to its host - no cap of
 * its own (it was 680px), and the screen's tab row: equal widths, 38px,
 * 12.5px. Desktop keeps the 820px reading column and its own tabs.
 */
describe("at tablet width", () => {
  it("takes the host's width, capping only from 1280px", () => {
    show();
    const column = screen.getByRole("tablist").closest("[class*='xl:max-w-[820px]']")!;

    expect(column).not.toBeNull();
    expect(column.className).not.toMatch(/(^| )max-w-/);
  });

  it("lays its tabs out as the screen's row: equal widths, one line", () => {
    show();
    const row = screen.getByRole("tablist");

    expect(row.className.split(" ")).not.toContain("flex-wrap");
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveClass("flex-1", "basis-0", "h-[38px]", "text-[12.5px]", "xl:flex-none");
    }
  });
});
