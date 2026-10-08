import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ReviewAnswersScreen } from "./ReviewAnswersScreen";
import { LessonSummaryScreen } from "./LessonSummaryScreen";
import { saveCheckOutcome, saveReviewAnswers } from "./reviewStore";
import { lessonsApi, type LessonQuestionAttempt } from "@/lib/api/lessons";
import { ApiError } from "@/lib/api/client";
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
  vi.restoreAllMocks();
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

describe("the picks the account holds (audit 61)", () => {
  /*
   * They were read from this tab's sessionStorage only, so the same child
   * opening the same review on another visit or tablet saw no picks at all.
   */
  const LIVE = lesson({
    assessment: {
      questions: [
        {
          ...QUESTION,
          id: "cp-1",
          options: [
            { id: "a", label: "The numerator", value: 1 },
            { id: "b", label: "The denominator", value: 2 },
          ],
        },
      ],
    },
  });
  const chose = (value: number) =>
    [
      {
        questionId: "cp-1",
        source: "assessment",
        answer: value,
        attemptNumber: 1,
        submittedAt: "2026-10-06T09:00:00Z",
      },
    ] as LessonQuestionAttempt[];

  it("are shown on a tablet that holds none of them", async () => {
    signInAs("child-a");
    const read = vi.spyOn(lessonsApi, "attempts").mockResolvedValue(chose(2));

    render(<ReviewAnswersScreen lesson={LIVE} live />);

    expect(await screen.findByText("YOU CHOSE")).toBeTruthy();
    expect(screen.getByText("The denominator")).toBeTruthy();
    expect(read).toHaveBeenCalledWith("frac-3");
  });

  it("win over this tab's copy where the two disagree", async () => {
    signInAs("child-a");
    saveReviewAnswers("frac-3", [{ questionIndex: 0, selectedId: "a" }]);
    vi.spyOn(lessonsApi, "attempts").mockResolvedValue(chose(2));

    render(<ReviewAnswersScreen lesson={LIVE} live />);

    expect(await screen.findByText("YOU CHOSE")).toBeTruthy();
  });

  it("are filled from this tab where the account has no answer yet", async () => {
    // "Review answers" opens as the last answer is given, and its write can
    // still be on the way.
    signInAs("child-a");
    saveReviewAnswers("frac-3", [{ questionIndex: 0, selectedId: "b" }]);
    let land: (rows: LessonQuestionAttempt[]) => void = () => {};
    const read = vi.spyOn(lessonsApi, "attempts").mockReturnValue(
      new Promise((resolve) => (land = resolve)),
    );

    render(<ReviewAnswersScreen lesson={LIVE} live />);
    // This tab's copy is the first paint.
    expect(await screen.findByText("YOU CHOSE")).toBeTruthy();

    await act(async () => land([]));

    expect(read).toHaveBeenCalled();
    expect(screen.getByText("YOU CHOSE")).toBeTruthy();
  });

  it("are never stood in for by this tab's copy when the read fails (rule 5)", async () => {
    signInAs("child-a");
    saveReviewAnswers("frac-3", [{ questionIndex: 0, selectedId: "b" }]);
    const read = vi
      .spyOn(lessonsApi, "attempts")
      .mockRejectedValueOnce(new ApiError(0, "offline"))
      .mockResolvedValueOnce(chose(2));

    render(<ReviewAnswersScreen lesson={LIVE} live />);

    expect(
      await screen.findByText("We couldn’t open this just now"),
    ).toBeTruthy();
    expect(screen.queryByText("YOU CHOSE")).toBeNull();
    expect(screen.queryByText("THE ANSWER")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("YOU CHOSE")).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("are not asked for on the signed-out walkthrough", () => {
    const read = vi.spyOn(lessonsApi, "attempts");

    render(<ReviewAnswersScreen lesson={LIVE} />);

    expect(read).not.toHaveBeenCalled();
    expect(screen.getByText("THE ANSWER")).toBeTruthy();
  });
});
