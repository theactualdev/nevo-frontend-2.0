import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { regenerate, awaitParseRun, detail, review } = vi.hoisted(() => ({
  regenerate: vi.fn(),
  awaitParseRun: vi.fn(),
  detail: vi.fn(),
  review: vi.fn(),
}));
vi.mock("@/lib/api/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/content")>();
  return {
    ...actual,
    contentApi: { ...actual.contentApi, regenerate },
    awaitParseRun,
  };
});
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return { ...actual, lessonsApi: { ...actual.lessonsApi, detail, review } };
});

import { UploadResult } from "./UploadResult";
import type { LessonDetailResponse } from "@/lib/api/lessons";

/**
 * The parse result, and the one thing a teacher can do about a bad one.
 *
 * The API is mocked here and the hook is NOT: a component test that mocks its
 * own hook cannot see a defect in the hook, which this console has already
 * paid for once on Home.
 */

const LESSON = {
  id: "l-1",
  title: "Fractions 3",
  segmentCount: 2,
  reviewSegmentCount: 1,
  confirmationSummary: null,
  segments: [
    {
      id: "s-1",
      sequenceOrder: 1,
      title: "What a fraction is",
      contentType: "explanatory_text",
      body: "A fraction names a part of a whole.",
      needsReview: false,
      availableModalities: ["text"],
    },
    {
      id: "s-2",
      sequenceOrder: 2,
      title: "Try these",
      contentType: "practice_question",
      body: "Work through each one.",
      needsReview: true,
      availableModalities: ["text"],
    },
  ],
} as unknown as LessonDetailResponse;

const RECEIPT = {
  lessonId: "l-1",
  parseRunId: "run-1",
  status: "processing",
  pollUrl: "/api/content/parse-runs/run-1",
};

const tryAgain = () =>
  fireEvent.click(screen.getByRole("button", { name: "Try that again" }));

beforeEach(() => {
  regenerate.mockReset().mockResolvedValue(RECEIPT);
  awaitParseRun
    .mockReset()
    .mockResolvedValue({ status: "completed", finished: true, failureReason: null });
  detail.mockReset().mockResolvedValue({ ...LESSON, title: "Fractions 3, read again" });
  review
    .mockReset()
    .mockResolvedValue({ lessonId: "l-1", keyPoints: [], outstandingCount: 0, readyToAssign: false });
});

describe("the try-that-again control", () => {
  it("is absent when nothing can take the re-read lesson", () => {
    // A button that reads the lesson again and throws the answer away is
    // worse than no button.
    render(
      <UploadResult lesson={LESSON} fileName="fractions.pdf" onUploadAnother={vi.fn()} />,
    );

    expect(screen.queryByRole("button", { name: "Try that again" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload another" })).toBeInTheDocument();
  });

  it("re-reads the lesson in place and hands back what came out", async () => {
    const onRegenerated = vi.fn();
    render(
      <UploadResult
        lesson={LESSON}
        fileName="fractions.pdf"
        onUploadAnother={vi.fn()}
        onRegenerated={onRegenerated}
      />,
    );

    tryAgain();

    await waitFor(() =>
      expect(onRegenerated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "l-1" }),
      ),
    );
    expect(regenerate).toHaveBeenCalledWith("l-1");
  });

  it("says what is happening, and that there will not be two copies", async () => {
    awaitParseRun.mockReturnValue(new Promise(() => {}));
    render(
      <UploadResult
        lesson={LESSON}
        fileName="fractions.pdf"
        onUploadAnother={vi.fn()}
        onRegenerated={vi.fn()}
      />,
    );

    tryAgain();

    await screen.findByRole("button", { name: "Reading it again…" });
    expect(screen.getByText(/will not end up with two copies/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reading it again…" })).toBeDisabled();
  });

  it("says nothing changed when the re-read failed", async () => {
    // The lesson is untouched by a failed run, and a teacher deciding whether
    // to re-upload needs to know that before they create a second copy.
    regenerate.mockRejectedValue(new Error("network"));
    render(
      <UploadResult
        lesson={LESSON}
        fileName="fractions.pdf"
        onUploadAnother={vi.fn()}
        onRegenerated={vi.fn()}
      />,
    );

    tryAgain();

    expect(
      await screen.findByText(/nothing about the lesson has changed/),
    ).toBeInTheDocument();
  });
});

/**
 * THE PARSE'S OWN REASON, ON THIS SCREEN TOO. A re-read that failed got our
 * generic line while the upload screens showed the server's, because the
 * hook threw the reason away.
 */
describe("a re-read whose parse failed", () => {
  it("shows the server's reason and the reference to quote", async () => {
    awaitParseRun.mockResolvedValue({
      status: "failed",
      finished: true,
      failureReason: "Nevo couldn’t find readable text in that file.",
      incidentId: "7e728d46d73e",
    });
    render(
      <UploadResult
        lesson={LESSON}
        fileName="fractions.pdf"
        onUploadAnother={vi.fn()}
        onRegenerated={vi.fn()}
      />,
    );

    tryAgain();

    expect(
      await screen.findByText("Nevo couldn’t find readable text in that file."),
    ).toBeInTheDocument();
    expect(screen.getByText("7e728d46d73e")).toBeInTheDocument();
    expect(screen.queryByText(/nothing about the lesson has changed/)).not.toBeInTheDocument();
  });
});

/**
 * LU-04 and C14 B1 both lead with "Assign to a class". It waits on the same
 * gate as the lesson page: the server's `readyToAssign`, never a count.
 */
describe("assigning from the finish screen", () => {
  it("waits, and says what is left, while the server says not yet", async () => {
    render(<UploadResult lesson={LESSON} fileName="fractions.pdf" onUploadAnother={vi.fn()} />);

    expect(await screen.findByText("1 section still to check")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Assign to a class" })).not.toBeInTheDocument();
    expect(screen.getByText("Assign to a class")).toHaveAttribute("aria-disabled", "true");
  });

  it("goes to the assign wizard with this lesson once it can", async () => {
    review.mockResolvedValue({ lessonId: "l-1", keyPoints: [], outstandingCount: 0, readyToAssign: true });
    render(<UploadResult lesson={LESSON} fileName="fractions.pdf" onUploadAnother={vi.fn()} />);

    expect(await screen.findByRole("link", { name: "Assign to a class" })).toHaveAttribute(
      "href",
      "/teacher/lessons/assign?lesson=l-1",
    );
    expect(screen.queryByText(/still to check/)).not.toBeInTheDocument();
  });

  it("says nothing while the verdict is still on its way", () => {
    review.mockReturnValue(new Promise(() => {}));
    render(<UploadResult lesson={LESSON} fileName="fractions.pdf" onUploadAnother={vi.fn()} />);

    expect(screen.getByText("Assign to a class")).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText(/still to check|Still being checked/)).not.toBeInTheDocument();
  });

  it("keeps the lesson itself one press away, where the checking happens", () => {
    render(<UploadResult lesson={LESSON} fileName="fractions.pdf" onUploadAnother={vi.fn()} />);

    expect(screen.getByRole("link", { name: "Open the lesson" })).toHaveAttribute(
      "href",
      "/teacher/lessons/l-1",
    );
  });

  it("asks for the verdict again after a re-read", async () => {
    render(
      <UploadResult
        lesson={LESSON}
        fileName="fractions.pdf"
        onUploadAnother={vi.fn()}
        onRegenerated={vi.fn()}
      />,
    );
    await waitFor(() => expect(review).toHaveBeenCalledTimes(1));
    tryAgain();

    await waitFor(() => expect(review).toHaveBeenCalledTimes(2));
  });
});
