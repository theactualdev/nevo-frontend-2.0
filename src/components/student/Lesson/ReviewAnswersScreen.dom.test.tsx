import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReviewAnswersScreen } from "./ReviewAnswersScreen";
import { LessonSummaryScreen } from "./LessonSummaryScreen";
import { saveCheckOutcome, saveReviewAnswers } from "./reviewStore";
import { clearSession, setSession } from "@/lib/auth/session";
import type { Lesson } from "@/lib/types";

/**
 * The two screens after a lesson, and what they let a child do.
 *
 * Each pointed at the other unconditionally: "Review answers" opened an empty
 * review for a lesson with no check-in, and "Back to summary" landed on "isn't
 * ready yet" for a lesson with no recap. And the picks the review reads were
 * kept per LESSON in sessionStorage, which outlives signing out - so the next
 * child on a shared tablet saw the last child's answers as their own.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const QUESTION = {
  prompt: "Which number is on top?",
  options: [
    { id: "a", label: "The numerator" },
    { id: "b", label: "The denominator" },
  ],
  correctId: "a",
};

const lesson = (over: Record<string, unknown> = {}) =>
  ({
    id: "frac-3",
    title: "Fractions Lesson 3",
    segments: [],
    summary: { recap: "You explored fractions." },
    assessment: { questions: [QUESTION] },
    ...over,
  }) as unknown as Lesson;

const signInAs = (userId: string) =>
  setSession({
    token: `tok-${userId}`,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId,
    role: "student",
  });

beforeEach(() => {
  window.sessionStorage.clear();
  clearSession();
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("the summary's way to the review", () => {
  it("is offered when there is a check-in to look back at", () => {
    render(<LessonSummaryScreen lesson={lesson()} />);

    expect(screen.getByRole("button", { name: "Review answers" })).toBeTruthy();
  });

  it("is not offered when there is none", () => {
    render(<LessonSummaryScreen lesson={lesson({ assessment: undefined })} />);

    expect(screen.queryByRole("button", { name: "Review answers" })).toBeNull();
    expect(screen.getByRole("button", { name: "Back to lessons" })).toBeTruthy();
  });
});

describe("the review's way back to the summary", () => {
  it("is offered when there is a summary", () => {
    render(<ReviewAnswersScreen lesson={lesson()} />);

    expect(screen.getByRole("button", { name: "Back to summary" })).toBeTruthy();
  });

  it("is not offered when there is none", () => {
    render(<ReviewAnswersScreen lesson={lesson({ summary: undefined })} />);

    expect(screen.queryByRole("button", { name: "Back to summary" })).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });
});

describe("Review answers", () => {
  it("does not claim a save it cannot know about", () => {
    render(<ReviewAnswersScreen lesson={lesson()} />);

    expect(screen.getByText(/Nothing to fix here/)).toBeTruthy();
    expect(screen.queryByText(/progress is saved/i)).toBeNull();
  });

  it("shows a child their own picks", () => {
    signInAs("child-a");
    saveReviewAnswers("frac-3", [{ questionIndex: 0, selectedId: "b" }]);

    render(<ReviewAnswersScreen lesson={lesson()} />);

    expect(screen.getByText("YOU CHOSE")).toBeTruthy();
  });

  it("tags a miss with no promise of a return (D96)", () => {
    // "Revisit soon" renders only where the engine scheduled the return.
    signInAs("child-a");
    saveReviewAnswers("frac-3", [{ questionIndex: 0, selectedId: "b" }]);

    render(<ReviewAnswersScreen lesson={lesson()} />);

    expect(screen.getByText("THE IDEA")).toBeTruthy();
    expect(screen.queryByText(/revisit/i)).toBeNull();
  });

  it("does not show the next child on the tablet the last child's picks", () => {
    signInAs("child-a");
    saveReviewAnswers("frac-3", [{ questionIndex: 0, selectedId: "b" }]);

    // Same tab - sessionStorage survives the sign-out.
    clearSession();
    signInAs("child-b");
    render(<ReviewAnswersScreen lesson={lesson()} />);

    expect(screen.queryByText("YOU CHOSE")).toBeNull();
    expect(screen.getByText("THE ANSWER")).toBeTruthy();
  });
});

describe("From the check-in, on the summary (B26)", () => {
  const OUTCOME = {
    mastered: ["Numerators"],
    revisit: ["Denominators"],
    note: "Not drawn here - the summary has no note.",
  };

  it("draws the outcome the completion write brought back", async () => {
    signInAs("stu-1");
    saveCheckOutcome("frac-3", OUTCOME);

    render(<LessonSummaryScreen lesson={lesson()} />);

    expect(await screen.findByText("FROM THE CHECK-IN")).toBeTruthy();
    expect(screen.getByText("Numerators")).toBeTruthy();
    // Named, without "· we'll revisit soon" (D96): nothing scheduled it.
    expect(screen.getByText(/Denominators/).textContent).toBe("Denominators");
    expect(screen.queryByText(/revisit/i)).toBeNull();
  });

  it("draws no section when there is none to draw", () => {
    // Finished on another visit, or the completion never answered: nothing
    // to say, and the sample lists are not a stand-in (rule 5).
    signInAs("stu-1");

    render(<LessonSummaryScreen lesson={lesson()} />);

    expect(screen.queryByText("FROM THE CHECK-IN")).toBeNull();
  });

  it("does not show the next child on the tablet the last child's", () => {
    signInAs("stu-1");
    saveCheckOutcome("frac-3", OUTCOME);
    signInAs("stu-2");

    render(<LessonSummaryScreen lesson={lesson()} />);

    expect(screen.queryByText("Numerators")).toBeNull();
  });
});
