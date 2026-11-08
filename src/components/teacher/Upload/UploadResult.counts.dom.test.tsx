import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { review } = vi.hoisted(() => ({ review: vi.fn() }));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return { ...actual, lessonsApi: { ...actual.lessonsApi, review } };
});

import { UploadResult } from "./UploadResult";
import { splitLine } from "./splitLine";
import type { LessonDetailResponse } from "@/lib/api/lessons";

/**
 * Live test, 8 Nov: the finish screen said "From Heat Transfer.pdf · 7
 * sections" and "split it into 7 sections" right after the structure step said
 * "3 sections · 7 segments". `segmentCount` counts segments; the sections are
 * the lesson's `modules`.
 */

const seg = (n: number, needsReview = false) => ({
  id: `s-${n}`,
  sequenceOrder: n,
  title: `Part ${n}`,
  contentType: "explanatory_text",
  body: "…",
  needsReview,
  availableModalities: ["text"],
});

const lesson = (over: Record<string, unknown> = {}) =>
  ({
    id: "l-1",
    title: "Heat transfer",
    segmentCount: 7,
    reviewSegmentCount: 0,
    confirmationSummary: null,
    segments: [1, 2, 3, 4, 5, 6, 7].map((n) => seg(n)),
    modules: [{ id: "m-1" }, { id: "m-2" }, { id: "m-3" }],
    ...over,
  }) as unknown as LessonDetailResponse;

beforeEach(() => {
  review.mockReset().mockResolvedValue({ lessonId: "l-1", keyPoints: [], outstandingCount: 0, readyToAssign: false });
});

describe("what the lesson was split into", () => {
  it("says sections and segments as the structure step does", () => {
    expect(splitLine(lesson())).toBe("3 sections · 7 segments");
  });

  it("says only segments when there are no sections", () => {
    expect(splitLine(lesson({ modules: [] }))).toBe("7 segments");
    expect(splitLine(lesson({ modules: undefined, segmentCount: 1 }))).toBe("1 segment");
  });

  it("is what the finish screen's header says", () => {
    render(<UploadResult lesson={lesson()} fileName="Heat Transfer.pdf" onUploadAnother={vi.fn()} />);

    expect(screen.getByText("From Heat Transfer.pdf · 3 sections · 7 segments")).toBeInTheDocument();
    expect(screen.queryByText(/7 sections/)).not.toBeInTheDocument();
  });

  it("counts segments, not sections, in the line about what is worth a look", () => {
    render(
      <UploadResult
        lesson={lesson({ reviewSegmentCount: 2 })}
        fileName="Heat Transfer.pdf"
        onUploadAnother={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Nevo read your file and split it into 7 segments. 2 are worth a look before you assign it."),
    ).toBeInTheDocument();
  });
});
