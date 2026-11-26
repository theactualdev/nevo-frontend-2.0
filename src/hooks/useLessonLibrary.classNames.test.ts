import { describe, expect, it } from "vitest";
import { __toCardForTest } from "./useLessonLibrary";
import type { LessonSummary } from "@/lib/api/lessons";

/**
 * The library card's footer names the classes, as C06 draws it - "JSS 2A,
 * JSS 2B" (backlog item 13; Teslim T11, live 21 Nov: `classNames` on the
 * lesson summary, without cancelled assignments).
 */
const lesson = (over: Partial<LessonSummary> = {}) =>
  ({
    id: "l-1",
    title: "Solving Linear Equations",
    status: "completed",
    sourceType: "pdf",
    segmentCount: 6,
    reviewSegmentCount: 0,
    unapprovedSegmentCount: 0,
    createdAt: "2026-10-20T09:00:00Z",
    ...over,
  }) as LessonSummary;

describe("the card's footer", () => {
  it("names the classes the lesson is assigned to", () => {
    const card = __toCardForTest(lesson({ classNames: ["JSS 2A", "JSS 2B"], assignmentCount: 58 }));
    expect(card.footer).toBe("JSS 2A, JSS 2B");
  });

  it("says Not yet assigned when no class and no child has it", () => {
    expect(__toCardForTest(lesson({ classNames: [], assignmentCount: 0 })).footer).toBe(
      "Not yet assigned",
    );
  });

  it("keeps the count for children assigned outside a class", () => {
    expect(__toCardForTest(lesson({ classNames: [], assignmentCount: 3 })).footer).toBe(
      "Assigned to 3 students",
    );
  });

  it("keeps the count for an older server that names no classes", () => {
    expect(__toCardForTest(lesson({ assignmentCount: 1 })).footer).toBe("Assigned to 1 student");
  });

  it("never names a blank class", () => {
    expect(__toCardForTest(lesson({ classNames: ["  ", "JSS 2A"], assignmentCount: 30 })).footer).toBe(
      "JSS 2A",
    );
  });
});
