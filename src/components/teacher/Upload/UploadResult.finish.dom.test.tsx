import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
 * C07j LU-04 / 04b / 04c on the upload finish screen (1397ec4), as the Hub
 * decided them on 6 Nov: by the SERVER's review alone; LU-04's formats
 * sentence dropped; the review's real five steps; "Your students won't see
 * it..." only while readyToAssign is false; Lydia's key-points sentence only
 * when exactly true; and nothing new drawn over a read that failed.
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

const signoff = (kind: string, name = "Ms. Adeyemi", at = "2026-11-04T10:00:00Z") => ({
  id: `so-${kind}`,
  kind,
  approvedBy: "t-1",
  approvedByName: name,
  approvedAt: at,
  contentHash: "h".repeat(64),
  current: true,
});

const approvedPicture = {
  id: "m-1",
  segmentId: "s-1",
  kind: "image",
  status: "approved",
  approvedByName: "Ms. Adeyemi",
  approvedAt: "2026-11-04T09:00:00Z",
  asset: { image: { imageUrl: "https://example.test/p.png" } },
};

const reviewOf = (over: Record<string, unknown> = {}) => ({
  lessonId: "l-1",
  keyPoints: [],
  outstandingCount: 0,
  readyToAssign: false,
  reviewComplete: false,
  ...over,
});

const settled = {
  ...LESSON,
  segments: LESSON.segments.map((s) => ({ ...s, needsReview: false })),
} as LessonDetailResponse;

const show = () =>
  render(<UploadResult lesson={settled} fileName="fractions.pdf" onUploadAnother={vi.fn()} />);

describe("LU-04, nothing reviewed yet", () => {
  it("says it's ready for review, in the frame's words, with Review lesson and Upload another", async () => {
    review.mockResolvedValue(reviewOf());
    show();

    expect(await screen.findByRole("heading", { name: "“Fractions 3” is ready for your review" })).toBeInTheDocument();
    expect(screen.getByText("Ready to review")).toBeInTheDocument();
    expect(
      screen.getByText(/Give them a quick review and the lesson’s ready to assign - nothing reaches your students until you have\./),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review lesson" })).toHaveAttribute("href", "/teacher/lessons/l-1/review");
    expect(screen.getAllByRole("button", { name: "Upload another" })).toHaveLength(1);
  });

  /* Hub decision 1: formats are per section, and media is often still being made. */
  it("never says the read, listen and watch versions are built", async () => {
    review.mockResolvedValue(reviewOf());
    show();

    await screen.findByRole("heading", { name: /is ready for your review/ });
    expect(screen.queryByText(/read, listen and watch/i)).toBeNull();
  });

  /* Hub decision 7: function below stays until Lydia rules. */
  it("keeps the sections list below", async () => {
    review.mockResolvedValue(reviewOf());
    show();

    await screen.findByRole("heading", { name: /is ready for your review/ });
    expect(screen.getByText("What Nevo found")).toBeInTheDocument();
    expect(screen.getByText("What a fraction is")).toBeInTheDocument();
  });
});

describe("LU-04b, part-way", () => {
  it("draws the review's real five steps and continues at the first one still open", async () => {
    review.mockResolvedValue(reviewOf({ media: { items: [approvedPicture] } }));
    show();

    expect(await screen.findByRole("heading", { name: "You’re part-way through reviewing this" })).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Review steps" });
    for (const label of ["What I made", "Key points", "Checks", "Rewrites", "Live"]) {
      expect(steps).toHaveTextContent(label);
    }
    expect(screen.getByRole("link", { name: "Continue review" })).toHaveAttribute(
      "href",
      "/teacher/lessons/l-1/review?step=2",
    );
    expect(screen.getByRole("link", { name: "Back to my library" })).toHaveAttribute("href", "/teacher/lessons");
  });

  it("says Lydia's sentence when it's exactly so - on the key points, not yet assignable", async () => {
    review.mockResolvedValue(reviewOf({ media: { items: [approvedPicture] } }));
    show();

    expect(
      await screen.findByText(
        "You’ve approved the structure and are on the key points. Your students won’t see it until the review is finished.",
      ),
    ).toBeInTheDocument();
  });

  /* Hub decisions 4 and 5. */
  it("says neither sentence past the key points once it could be assigned", async () => {
    review.mockResolvedValue(
      reviewOf({
        readyToAssign: true,
        keyPointApproval: signoff("key_points"),
        checks: [
          {
            segmentId: "s-1",
            segmentTitle: "What a fraction is",
            questionId: "q-1",
            questionPrompt: "What is a half?",
            questionAnswerType: "text",
            questionOptions: [],
            questionAnswerKey: "one of two parts",
            teacherReviewed: false,
            markable: true,
          },
        ],
      }),
    );
    show();

    await screen.findByRole("heading", { name: "You’re part-way through reviewing this" });
    expect(screen.queryByText(/on the key points/)).toBeNull();
    expect(screen.queryByText(/won’t see it until/)).toBeNull();
    expect(screen.getByRole("link", { name: "Continue review" })).toHaveAttribute(
      "href",
      "/teacher/lessons/l-1/review?step=3",
    );
  });
});

describe("LU-04c, reviewed", () => {
  it("says it's reviewed and ready, with the approval on record, Assign and View in library", async () => {
    review.mockResolvedValue(
      reviewOf({ readyToAssign: true, reviewComplete: true, keyPointApproval: signoff("key_points") }),
    );
    show();

    expect(await screen.findByRole("heading", { name: "“Fractions 3” is reviewed and ready" })).toBeInTheDocument();
    expect(screen.getByText("Reviewed by Ms. Adeyemi · 4 November")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Assign to a class" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Assign to a class" })).toHaveAttribute(
      "href",
      "/teacher/lessons/assign?lesson=l-1",
    );
    expect(screen.getByRole("link", { name: "View in library" })).toHaveAttribute("href", "/teacher/lessons/l-1");
  });

  it("names both people when two signed parts of it", async () => {
    review.mockResolvedValue(
      reviewOf({
        readyToAssign: true,
        reviewComplete: true,
        keyPointApproval: signoff("key_points", "Ms. Adeyemi", "2026-11-03T10:00:00Z"),
        rewriteApproval: signoff("rewrites", "Mr. Bello", "2026-11-04T10:00:00Z"),
      }),
    );
    show();

    expect(await screen.findByText("Reviewed by Ms. Adeyemi and Mr. Bello · 4 November")).toBeInTheDocument();
  });

  /* LU-04c offers Assign, so it is drawn only where Assign is open. */
  it("is not drawn when the review is complete but the server won't let it be assigned", async () => {
    review.mockResolvedValue(reviewOf({ readyToAssign: false, reviewComplete: true }));
    show();

    expect(await screen.findByRole("heading", { name: "Fractions 3" })).toBeInTheDocument();
    expect(screen.queryByText(/is reviewed and ready/)).toBeNull();
  });
});

describe("over a read that hasn't answered", () => {
  it("draws the screen as it was when the review can't be read", async () => {
    review.mockRejectedValue(new Error("down"));
    show();

    expect(await screen.findByRole("heading", { name: "Fractions 3" })).toBeInTheDocument();
    expect(screen.queryByText(/is ready for your review|part-way|reviewed and ready/)).toBeNull();
  });
});
