import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { LessonReview, LessonSegment } from "@/lib/api/lessons";
import type { LessonMediaItem } from "@/lib/api/media";
import { ApiError } from "@/lib/api/client";

const api = vi.hoisted(() => ({
  detail: vi.fn(),
  review: vi.fn(),
  approveAllKeyPoints: vi.fn(),
  approveAllRewrites: vi.fn(),
  amendKeyPoint: vi.fn(),
  resolveMissingKeyPoint: vi.fn(),
  editRewrite: vi.fn(),
}));
const media = vi.hoisted(() => ({
  approve: vi.fn(),
  retry: vi.fn(),
  list: vi.fn(),
  withdraw: vi.fn(),
  withdrawLive: vi.fn(),
  restore: vi.fn(),
}));
vi.mock("@/lib/api/lessons", () => ({ lessonsApi: api }));
vi.mock("@/lib/api/media", () => ({ mediaApi: media }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/components/shared/IllustrationWrapper", () => ({
  IllustrationWrapper: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

import { LessonReviewRoute } from "./LessonReviewRoute";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * SCRUM-286: generated pictures and narration are approved inside C07k's step
 * 1 (Lydia, 23 Oct; design 82c213b). Pictures as tiles to glance across,
 * narration to sample, a flag as the only friction, one press for the step,
 * and the four scenarios the frame draws.
 *
 * And the reason this has to ship WITH the review: since Teslim's 10c6bf8 the
 * key-point press also approves every waiting picture and recording. So it is
 * not offered while one is still unseen.
 */

const seg = (n: number): LessonSegment =>
  ({
    id: `s-${n}`,
    segmentKey: `k-${n}`,
    contentType: "explanatory_text",
    sequenceOrder: n,
    title: `Part ${n}`,
    body: `Body ${n}.`,
    availableModalities: ["text"],
    comprehensionCheckpoints: [],
    needsReview: false,
    reviewReasons: [],
    approved: true,
    approvedAt: null,
    textVariant: null,
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    depthVariants: null,
  }) as unknown as LessonSegment;

const SEGMENTS = [seg(1), seg(2), seg(3)];

const picture = (id: string, segmentId: string, status = "awaiting_review"): LessonMediaItem =>
  ({
    id,
    segmentId,
    kind: "image",
    status,
    asset: {
      image: {
        imageUrl: `https://cdn.test/${id}.png`,
        previewUrl: null,
        width: 400,
        height: 300,
        caption: `A picture for ${segmentId}`,
        storagePath: `lessons/${id}.png`,
      },
    },
    sourceChanged: false,
    failureCode: null,
    createdAt: "2026-10-23T10:00:00Z",
    completedAt: "2026-10-23T10:01:00Z",
    approvedAt: null,
    approvedBy: null,
    approvedByName: null,
  }) as unknown as LessonMediaItem;

const recording = (id: string, segmentId: string, status = "awaiting_review"): LessonMediaItem =>
  ({
    ...picture(id, segmentId, status),
    kind: "audio",
    asset: {
      audio: { audioUrl: `https://cdn.test/${id}.mp3`, storagePath: `lessons/${id}.mp3`, durationMs: 38000 },
    },
  }) as unknown as LessonMediaItem;

const reviewWith = (items: LessonMediaItem[] | null, over: Partial<LessonReview> = {}): LessonReview =>
  ({
    lessonId: "l-1",
    title: "Photosynthesis in Leaves",
    outstandingCount: 0,
    keyPointCount: 0,
    readyToAssign: true,
    keyPoints: [],
    keyPointsContentHash: "a".repeat(64),
    rewritesContentHash: "b".repeat(64),
    keyPointApproval: null,
    rewriteApproval: null,
    missingKeyPointSegmentIds: [],
    rewriteCount: 0,
    pendingRewriteCount: 0,
    reviewComplete: false,
    media:
      items === null
        ? null
        : { lessonId: "l-1", summary: { phase: "awaiting_review", generationComplete: true }, items },
    ...over,
  }) as unknown as LessonReview;

const open = async (step?: 1 | 2 | 3 | 4 | 5) => {
  render(<LessonReviewRoute lessonId="l-1" step={step} />);
  await screen.findByRole("navigation", { name: "Lesson review steps" });
};

beforeEach(() => {
  for (const fn of [...Object.values(api), ...Object.values(media)]) fn.mockReset();
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
  api.detail.mockResolvedValue({
    id: "l-1",
    title: "Photosynthesis in Leaves",
    subject: "Biology",
    status: "completed",
    segmentCount: 3,
    segments: SEGMENTS,
    modules: [],
    confirmationSummary: null,
  });
  api.review.mockResolvedValue(
    reviewWith([picture("p1", "s-1"), picture("p2", "s-2"), recording("n1", "s-1")]),
  );
  media.approve.mockResolvedValue([]);
  media.retry.mockResolvedValue({});
});

describe("pictures and narration in step 1", () => {
  it("says what Nevo made and asks for a look, then an approval", async () => {
    await open();

    expect(
      screen.getByRole("heading", {
        name: "Nevo made 2 pictures and 1 recording for this lesson. Have a look, then approve.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pictures · 2 made")).toBeInTheDocument();
    expect(screen.getByText("1 section has none")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "A picture for s-1" })).toBeInTheDocument();
    expect(screen.getByText("Narration · 1 recording")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play the narration for Part 1" })).toBeInTheDocument();
    expect(screen.getByText("0:38")).toBeInTheDocument();
  });

  it("approves everything shown in one press, then moves on", async () => {
    api.review
      .mockResolvedValueOnce(reviewWith([picture("p1", "s-1"), picture("p2", "s-2"), recording("n1", "s-1")]))
      .mockResolvedValue(
        reviewWith([picture("p1", "s-1", "approved"), picture("p2", "s-2", "approved"), recording("n1", "s-1", "approved")]),
      );
    await open();
    expect(screen.getByText("One press approves everything here.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve pictures and narration" }));

    // In lesson order: section 1's picture and recording, then section 2's.
    await waitFor(() => expect(media.approve).toHaveBeenCalledWith("l-1", ["p1", "n1", "p2"]));
    expect(media.retry).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Continue to key points" })).toBeInTheDocument();
    expect(screen.getByText("Media approved. Nothing else needs you.")).toBeInTheDocument();
  });

  it("sends a flagged one back to be made again, and approves the rest", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Flag the picture for Part 2" }));

    expect(screen.getByText("1 flagged - Nevo will remake it; the rest go as they are.")).toBeInTheDocument();
    expect(screen.getByText("1 flagged for a change")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve pictures and narration" }));

    await waitFor(() => expect(media.approve).toHaveBeenCalledWith("l-1", ["p1", "n1"]));
    expect(media.retry).toHaveBeenCalledWith("l-1", "p2");
    // The remake goes first, so a refusal can stop the approval.
    expect(media.retry.mock.invocationCallOrder[0]).toBeLessThan(media.approve.mock.invocationCallOrder[0]);
  });

  it("approves nothing when a remake is refused, and says why", async () => {
    media.retry.mockRejectedValue(
      new ApiError(409, "x", { detail: { code: "media_retry_not_allowed", message: "This one can't be made again yet." } }),
    );
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Flag the narration for Part 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve pictures and narration" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This one can't be made again yet.");
    expect(media.approve).not.toHaveBeenCalled();
  });

  it("names only what there is: pictures only", async () => {
    api.review.mockResolvedValue(reviewWith([picture("p1", "s-1")]));
    await open();

    expect(screen.getByRole("button", { name: "Approve the pictures" })).toBeInTheDocument();
    expect(screen.getByText("No narration was made for this lesson.")).toBeInTheDocument();
  });

  it("names only what there is: narration only", async () => {
    api.review.mockResolvedValue(reviewWith([recording("n1", "s-1")]));
    await open();

    expect(screen.getByRole("button", { name: "Approve the narration" })).toBeInTheDocument();
    expect(screen.getByText("No pictures were made for this lesson.")).toBeInTheDocument();
  });

  it("calls a lesson with no media complete, not broken", async () => {
    api.review.mockResolvedValue(reviewWith(null));
    await open();

    expect(screen.getByText("This lesson is text only")).toBeInTheDocument();
    expect(screen.getByText(/It.s complete as it is - children will read it\./)).toBeInTheDocument();
    expect(screen.getByText("Text only - nothing to approve here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to key points" })).toBeInTheDocument();
  });

  it("says what is still being made, and does not wait for it", async () => {
    api.review.mockResolvedValue(
      reviewWith([picture("p1", "s-1"), picture("p2", "s-2", "processing"), recording("n1", "s-3", "queued")]),
    );
    await open();

    expect(
      screen.getByText("Nevo is still making 1 picture and 1 recording. You can carry on; they'll wait here for you."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve the pictures" })).toBeInTheDocument();
  });

  it("offers to try again on one that could not be made", async () => {
    api.review.mockResolvedValue(
      reviewWith([picture("p1", "s-1"), { ...picture("p9", "s-2", "failed"), asset: null, failureCode: "educational_review_failed" }]),
    );
    await open();

    expect(screen.getByText("Nevo couldn’t make one of these.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(media.retry).toHaveBeenCalledWith("l-1", "p9"));
  });
});

describe("the key-point press, which also signs media", () => {
  it("is held while a picture or recording is still waiting", async () => {
    await open(2);

    expect(screen.getByRole("button", { name: /Accept/ })).toBeDisabled();
    expect(screen.getByText(/Approve the pictures and narration in step 1 first/)).toBeInTheDocument();
  });

  it("is offered once nothing is waiting", async () => {
    api.review.mockResolvedValue(reviewWith([picture("p1", "s-1", "approved")]));
    await open(2);

    expect(screen.getByRole("button", { name: /Accept/ })).toBeEnabled();
  });

  it("opens on step 1 when a signed-off lesson has new media waiting", async () => {
    api.review.mockResolvedValue(
      reviewWith([picture("p1", "s-1")], {
        reviewComplete: true,
        keyPointApproval: { id: "k", kind: "key_points", approvedBy: "t-1", approvedByName: "Ms. Adeyemi", approvedAt: "2026-10-19T10:00:00Z", contentHash: "x", current: true },
      }),
    );
    await open();

    expect(screen.getByText(/Step 1 of 5/)).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Lesson review steps" })).getByRole("button", { name: /What I made/ })).toHaveAttribute("aria-current", "step");
  });
});

/**
 * Design 11 (Lydia, 26 Oct): "show remade as remade". "A teacher who flagged
 * something and sees an identical picture will either flag it again or assume
 * we ignored them." The server keeps the item's id through a remake, so the
 * mark is this visit's own record of what the teacher sent back.
 */
describe("a flagged picture or recording that comes back remade", () => {
  it("is marked Remade when it is waiting for a look again", async () => {
    api.review
      .mockResolvedValueOnce(reviewWith([picture("p1", "s-1"), picture("p2", "s-2"), recording("n1", "s-1")]))
      // After the press: p1 and n1 approved, p2 remade and waiting again.
      .mockResolvedValue(
        reviewWith([picture("p1", "s-1", "approved"), picture("p2", "s-2"), recording("n1", "s-1", "approved")]),
      );
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Flag the picture for Part 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve pictures and narration" }));

    expect(await screen.findByText("Remade")).toBeInTheDocument();
    expect(screen.getByText("Remade as you asked - have a look before you approve.")).toBeInTheDocument();
  });

  it("marks a remade recording the same way", async () => {
    api.review
      .mockResolvedValueOnce(reviewWith([recording("n1", "s-1"), recording("n2", "s-2")]))
      .mockResolvedValue(reviewWith([recording("n1", "s-1"), recording("n2", "s-2", "approved")]));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Flag the narration for Part 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve the narration" }));

    expect(await screen.findByText("Remade")).toBeInTheDocument();
  });

  it("marks nothing the teacher did not send back", async () => {
    await open();

    expect(screen.queryByText("Remade")).not.toBeInTheDocument();
  });

  it("marks nothing while the remake is still being made", async () => {
    api.review
      .mockResolvedValueOnce(reviewWith([picture("p1", "s-1"), picture("p2", "s-2")]))
      .mockResolvedValue(reviewWith([picture("p1", "s-1", "approved"), picture("p2", "s-2", "processing")]));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Flag the picture for Part 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve the pictures" }));

    await waitFor(() => expect(media.retry).toHaveBeenCalledWith("l-1", "p2"));
    expect(await screen.findByText(/Nevo is still making 1 picture/)).toBeInTheDocument();
    expect(screen.queryByText("Remade")).not.toBeInTheDocument();
  });
});

/**
 * 6b5d496: the server keeps `remadeAt` and `requestedBy`, so the mark is no
 * longer one visit's memory (#897). It survives a reload and reaches every
 * teacher reviewing the lesson, and "as you asked" is said only to whoever did.
 */
describe("a remake the server has recorded", () => {
  const remadeBy = (requestedBy: string, status = "awaiting_review"): LessonMediaItem =>
    ({ ...picture("p2", "s-2", status), requestedBy, remadeAt: "2026-10-29T18:00:00Z" }) as LessonMediaItem;

  it("is marked Remade on opening the review, with no flag pressed in this visit", async () => {
    api.review.mockResolvedValue(reviewWith([picture("p1", "s-1"), remadeBy("t-1")]));
    await open();

    expect(await screen.findByText("Remade")).toBeInTheDocument();
    expect(screen.getByText("Remade as you asked - have a look before you approve.")).toBeInTheDocument();
  });

  it("tells another teacher it was remade after a flag, not that they asked", async () => {
    api.review.mockResolvedValue(reviewWith([picture("p1", "s-1"), remadeBy("t-colleague")]));
    await open();

    expect(await screen.findByText("Remade")).toBeInTheDocument();
    expect(screen.getByText("Remade after a flag - have a look before you approve.")).toBeInTheDocument();
    expect(screen.queryByText(/as you asked/)).not.toBeInTheDocument();
  });

  it("is not marked once it has been approved", async () => {
    api.review.mockResolvedValue(reviewWith([picture("p1", "s-1"), remadeBy("t-1", "approved")]));
    await open();

    expect(screen.queryByText("Remade")).not.toBeInTheDocument();
  });

  it("marks nothing the server never remade", async () => {
    api.review.mockResolvedValue(
      reviewWith([{ ...picture("p1", "s-1"), requestedBy: "t-1", remadeAt: null } as LessonMediaItem]),
    );
    await open();

    expect(screen.queryByText("Remade")).not.toBeInTheDocument();
  });
});
