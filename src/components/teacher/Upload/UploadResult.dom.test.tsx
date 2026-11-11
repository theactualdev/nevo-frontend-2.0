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

// Lydia, 10 Nov: "the parsed-segments line is dropped".
describe("the server's parsed-segments line", () => {
  it("is never said, even when the server sends it", () => {
    render(
      <UploadResult
        lesson={{ ...LESSON, confirmationSummary: "Parsed 2 lesson segments for teacher review." } as LessonDetailResponse}
        fileName="fractions.pdf"
        onUploadAnother={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Parsed 2 lesson segments/)).not.toBeInTheDocument();
  });
});

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

    // SCRUM-319: pressable, never disabled; the reason comes with the tap.
    fireEvent.click(await screen.findByRole("button", { name: "Assign to a class" }));
    expect(await screen.findByText("1 segment still to check")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Assign to a class" })).not.toBeInTheDocument();
  });

  it("names the step that holds it after the tap, and goes back to it (SCRUM-319)", async () => {
    review.mockResolvedValue({
      lessonId: "l-1",
      keyPoints: [],
      outstandingCount: 0,
      readyToAssign: false,
      reviewComplete: false,
      outstandingReviewSteps: ["rewrites"],
    });
    render(<UploadResult lesson={LESSON} fileName="fractions.pdf" onUploadAnother={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Assign to a class" }));
    expect(
      await screen.findByText("It can’t be assigned until its review is done: rewrites still to sign off."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the rewrites" })).toHaveAttribute(
      "href",
      "/teacher/lessons/l-1/review?step=4",
    );
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

  // Lydia, 25 Oct: Assign waits for the lesson-wide sign-off, here as on the
  // lesson page. `readyToAssign` alone let an unreviewed lesson go.
  it("waits for the lesson-wide sign-off, and says the review is what waits", async () => {
    review.mockResolvedValue({
      lessonId: "l-1",
      keyPoints: [],
      outstandingCount: 0,
      readyToAssign: true,
      reviewComplete: false,
    });
    const settled = {
      ...LESSON,
      segments: LESSON.segments.map((s) => ({ ...s, needsReview: false })),
    } as LessonDetailResponse;
    render(<UploadResult lesson={settled} fileName="fractions.pdf" onUploadAnother={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Assign to a class" }));
    expect(await screen.findByText("Review this lesson to assign it.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Assign to a class" })).not.toBeInTheDocument();
    // Backlog item 19: and the way in, rather than a line with nothing to press -
    // C07j LU-04's own "Review lesson" since 6 Nov, so not offered twice.
    expect(screen.getByRole("link", { name: "Review lesson" })).toHaveAttribute(
      "href",
      "/teacher/lessons/l-1/review",
    );
    expect(screen.queryByRole("link", { name: "Review in five steps" })).not.toBeInTheDocument();
  });

  it("offers no way into the review while the verdict is still on its way", () => {
    review.mockReturnValue(new Promise(() => {}));
    render(<UploadResult lesson={LESSON} fileName="fractions.pdf" onUploadAnother={vi.fn()} />);

    expect(screen.queryByRole("link", { name: "Review in five steps" })).not.toBeInTheDocument();
  });

  it("says nothing while the verdict is still on its way", () => {
    review.mockReturnValue(new Promise(() => {}));
    render(<UploadResult lesson={LESSON} fileName="fractions.pdf" onUploadAnother={vi.fn()} />);

    // Pressable even now (SCRUM-319), but there is no reason to give yet.
    fireEvent.click(screen.getByRole("button", { name: "Assign to a class" }));
    expect(screen.queryByText(/still to check|Still being checked|still to sign off/)).not.toBeInTheDocument();
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

/**
 * A RE-READ A SAFETY CHECK STOPPED (`reasonCode: "safety_held"`, backend
 * 06396db). Lydia's line (9 Nov, item 6), as the upload screens say it: not
 * the server's sentence, no reference, and no way to send it again.
 */
describe("a re-read a safety check stopped", () => {
  // Lydia, 10 Nov (item 4): the re-read's own line, above the earlier reading.
  const REREAD =
    "Nevo stopped partway through this re-reading because of a safety check, so what you see below is still the earlier reading.";
  const LINE =
    "Nevo stopped partway through this lesson because of a safety check, so the sections it would normally propose are not here. Nothing has reached your class.";
  const SERVER =
    "Our safety check held this file back, so the lesson has not been prepared. If the material is ordinary classroom content, tell us the reference below and we will look at the check rather than your file.";
  const show = () =>
    render(
      <UploadResult lesson={LESSON} fileName="fractions.pdf" onUploadAnother={vi.fn()} onRegenerated={vi.fn()} />,
    );

  it("says the re-read's line above the earlier reading, and nothing beyond it", async () => {
    awaitParseRun.mockResolvedValue({
      status: "failed",
      finished: true,
      failureReason: SERVER,
      incidentId: "ca8435c98d08",
      reasonCode: "safety_held",
    });
    show();

    tryAgain();

    const said = await screen.findByText(REREAD);
    // "What you see below": the earlier reading's title is below it.
    expect(said.compareDocumentPosition(screen.getAllByText(/Fractions 3/)[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
    expect(screen.queryByText(/reached your class/)).not.toBeInTheDocument();
    expect(screen.queryByText(SERVER)).not.toBeInTheDocument();
    expect(screen.queryByText(/ca8435c98d08/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try that again" })).not.toBeInTheDocument();
  });

  it("says item 6's line only where the lesson has nothing to show", async () => {
    awaitParseRun.mockResolvedValue({ status: "failed", finished: true, failureReason: SERVER, reasonCode: "safety_held" });
    render(
      <UploadResult
        lesson={{ ...LESSON, segments: [], segmentCount: 0 } as LessonDetailResponse}
        fileName="fractions.pdf"
        onUploadAnother={vi.fn()}
        onRegenerated={vi.fn()}
      />,
    );

    tryAgain();

    expect(await screen.findByText(LINE)).toBeInTheDocument();
    expect(screen.queryByText(REREAD)).not.toBeInTheDocument();
  });

  it("leaves any other failed re-read as it was", async () => {
    awaitParseRun.mockResolvedValue({
      status: "failed",
      finished: true,
      failureReason: "Our safety check could not run, so the lesson has not been prepared.",
      reasonCode: "safety_check_unavailable",
    });
    show();

    tryAgain();

    expect(
      await screen.findByText("Our safety check could not run, so the lesson has not been prepared."),
    ).toBeInTheDocument();
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
    expect(screen.queryByText(REREAD)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try that again" })).toBeInTheDocument();
  });
});
