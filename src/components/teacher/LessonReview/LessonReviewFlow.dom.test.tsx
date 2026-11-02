import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { KeyPoint, LessonReview, LessonSegment } from "@/lib/api/lessons";
import { ApiError } from "@/lib/api/client";

const api = vi.hoisted(() => ({
  detail: vi.fn(),
  review: vi.fn(),
  approveAllKeyPoints: vi.fn(),
  approveAllRewrites: vi.fn(),
  amendKeyPoint: vi.fn(),
  resolveMissingKeyPoint: vi.fn(),
  editRewrite: vi.fn(),
  acceptKeyPoint: vi.fn(),
  approveSegment: vi.fn(),
}));
vi.mock("@/lib/api/lessons", () => ({ lessonsApi: api }));
// No new captions here (Q10's are tested in the media file); never the network.
vi.mock("@/lib/api/media", async (actual) => ({
  ...(await actual<typeof import("@/lib/api/media")>()),
  mediaApi: { captions: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { LessonReviewRoute } from "./LessonReviewRoute";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * C07k, "Send a lesson in four calm steps" (Lydia, 19 Oct; design 534ba31),
 * against Teslim's staged contract (codex/lesson-review-redesign, f1ba340).
 *
 * Her rules, each pinned below: four screens; one press approves a whole
 * step; only flagged and not-found items cause friction, at the top of their
 * step; every problem state has its action, and each action writes back; who
 * approved and when on the live step; one plain status line; counts only on
 * the accept buttons and the needs-a-look line; the same at 73 sections as 7.
 */

const HASH_K = "a".repeat(64);
const HASH_R = "b".repeat(64);

const seg = (n: number, over: Partial<LessonSegment> = {}): LessonSegment =>
  ({
    id: `s-${n}`,
    segmentKey: `k-${n}`,
    contentType: "explanatory_text",
    sequenceOrder: n,
    title: `Part ${n}`,
    body: `Body of part ${n}.`,
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
    depthVariants: {
      simplified: { body: `Simpler part ${n}.`, reviewStatus: "pending" },
      expanded: { body: `Longer part ${n}.`, reviewStatus: "pending" },
      model: null,
    },
    ...over,
  }) as unknown as LessonSegment;

const point = (id: string, segmentId: string, over: Partial<KeyPoint> = {}): KeyPoint => ({
  id,
  segmentId,
  segmentTitle: null,
  position: 0,
  text: `Point ${id}.`,
  extractedText: `Point ${id}.`,
  amendedText: null,
  sourceText: `The file's words for ${id}.`,
  confidence: "high",
  reviewState: "settled",
  outstanding: false,
  resolvedAt: null,
  resolvedBy: null,
  ...over,
});

const lesson = (segments: LessonSegment[]) => ({
  id: "l-1",
  title: "Photosynthesis in Leaves",
  subject: "Biology",
  status: "completed",
  segmentCount: segments.length,
  segments,
  modules: [],
  confirmationSummary: null,
});

const reviewOf = (over: Partial<LessonReview> = {}): LessonReview => ({
  lessonId: "l-1",
  title: "Photosynthesis in Leaves",
  outstandingCount: 1,
  keyPointCount: 3,
  readyToAssign: false,
  keyPoints: [
    point("kp-1", "s-1", { outstanding: true, reviewState: "unsure", confidence: "low" }),
    point("kp-2", "s-2"),
    point("kp-3", "s-3"),
  ],
  keyPointsContentHash: HASH_K,
  rewritesContentHash: HASH_R,
  keyPointApproval: null,
  rewriteApproval: null,
  missingKeyPointSegmentIds: ["s-4"],
  rewriteCount: 8,
  pendingRewriteCount: 8,
  reviewComplete: false,
  ...over,
});

const SEGMENTS = [seg(1), seg(2), seg(3), seg(4)];

const open = async (step?: 1 | 2 | 3 | 4 | 5) => {
  render(<LessonReviewRoute lessonId="l-1" step={step} />);
  await screen.findByRole("navigation", { name: "Lesson review steps" });
};

const signoff = (kind: "key_points" | "rewrites", name = "Ms. Adeyemi") => ({
  id: `so-${kind}`,
  kind,
  approvedBy: "t-1",
  approvedByName: name,
  approvedAt: "2026-10-19T10:00:00Z",
  contentHash: kind === "key_points" ? HASH_K : HASH_R,
  current: true,
});

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
  api.detail.mockResolvedValue(lesson(SEGMENTS));
  api.review.mockResolvedValue(reviewOf());
});

describe("four screens, not one page", () => {
  it("names the five steps, and opens on what Nevo made of it", async () => {
    await open();

    const steps = within(screen.getByRole("navigation", { name: "Lesson review steps" }));
    for (const label of ["What I made", "Key points", "Checks", "Rewrites", "Live"]) {
      expect(steps.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.getByText(/Step 1 of 5/)).toBeInTheDocument();
    expect(screen.queryByText(/Step 2 of 5/)).not.toBeInTheDocument();
  });

  it("leads with one plain status line, counting what will stop the teacher", async () => {
    await open();

    expect(
      screen.getByRole("heading", { name: "2 things need a look in the next steps." }),
    ).toBeInTheDocument();
  });

  it("says nothing needs the teacher when nothing is flagged", async () => {
    api.review.mockResolvedValue(
      reviewOf({ keyPoints: [point("kp-2", "s-2")], missingKeyPointSegmentIds: [] }),
    );
    await open();

    expect(
      screen.getByRole("heading", { name: "This looks ready. Nothing needs you." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to key points" })).toBeInTheDocument();
  });

  it("takes the teacher to the flagged ones in one press", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Continue to key points" }));

    expect(screen.getByText(/Step 2 of 5/)).toBeInTheDocument();
  });

  it("shows the structure only when asked", async () => {
    await open();
    expect(screen.queryByText("Part 2")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "See how it’s broken up" }));

    expect(screen.getByText("Part 2")).toBeInTheDocument();
  });

  it("draws no minutes anywhere", async () => {
    api.detail.mockResolvedValue({ ...lesson(SEGMENTS.map((s) => ({ ...s, estimatedMinutes: 4 }))), estimatedMinutes: 16 });
    await open();
    fireEvent.click(screen.getByRole("button", { name: "See how it’s broken up" }));

    expect(screen.queryByText(/min\b/)).not.toBeInTheDocument();
  });
});

describe("the key points", () => {
  it("puts the flagged and the not-found at the top, and the rest below", async () => {
    await open(2);

    const top = screen.getByText("Nevo wants your eyes on these").parentElement!;
    expect(within(top).getByText("Point kp-1.")).toBeInTheDocument();
    expect(within(top).getByText("Part 4 - no key point found.")).toBeInTheDocument();
    expect(screen.getByText("The rest - clear as read")).toBeInTheDocument();
    expect(screen.getByText("Point kp-2.")).toBeInTheDocument();
  });

  it("carries no count in its title", async () => {
    await open(2);

    expect(
      screen.getByRole("heading", { name: "The key points, pulled from what you uploaded" }),
    ).toBeInTheDocument();
  });

  it("will not take the one press while a section has no decision", async () => {
    await open(2);

    expect(screen.getByRole("button", { name: "Accept all 3 key points" })).toBeDisabled();
    expect(screen.getByText(/Decide the 1 section with no key point first/)).toBeInTheDocument();
  });

  it("writes 'Leave it out' straight back", async () => {
    api.resolveMissingKeyPoint.mockResolvedValue(
      reviewOf({
        keyPoints: [
          ...reviewOf().keyPoints,
          point("kp-4", "s-4", { extractedText: "", text: "", reviewState: "removed", confidence: "low" }),
        ],
        missingKeyPointSegmentIds: [],
      }),
    );
    await open(2);
    fireEvent.click(screen.getByRole("button", { name: "Leave it out" }));

    await waitFor(() =>
      expect(api.resolveMissingKeyPoint).toHaveBeenCalledWith("l-1", "s-4", { action: "omit" }),
    );
    expect(await screen.findByText("Left out - Part 4 has no key point.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add one after all" })).toBeInTheDocument();
  });

  it("writes 'Add one myself' back in the teacher's words", async () => {
    api.resolveMissingKeyPoint.mockResolvedValue(
      reviewOf({
        keyPoints: [
          ...reviewOf().keyPoints,
          point("kp-4", "s-4", { extractedText: "", text: "Guard cells open the pores.", amendedText: "Guard cells open the pores.", reviewState: "amended" }),
        ],
        missingKeyPointSegmentIds: [],
      }),
    );
    await open(2);
    fireEvent.click(screen.getByRole("button", { name: "Add one myself" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Key point for Part 4" }), {
      target: { value: "  Guard cells open the pores.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add this key point" }));

    await waitFor(() =>
      expect(api.resolveMissingKeyPoint).toHaveBeenCalledWith("l-1", "s-4", {
        action: "add",
        text: "Guard cells open the pores.",
      }),
    );
    expect(await screen.findByText("You added this one.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit again" })).toBeInTheDocument();
  });

  it("settles a flagged point as it reads without a write of its own", async () => {
    await open(2);
    fireEvent.click(screen.getByRole("button", { name: "Looks right" }));

    expect(screen.getByText("You confirmed the wording.")).toBeInTheDocument();
    expect(api.acceptKeyPoint).not.toHaveBeenCalled();
  });

  it("amends a flagged point, and keeps it in place as done", async () => {
    api.amendKeyPoint.mockResolvedValue(
      reviewOf({
        keyPoints: [
          point("kp-1", "s-1", { text: "Leaves make food.", amendedText: "Leaves make food.", reviewState: "amended" }),
          point("kp-2", "s-2"),
          point("kp-3", "s-3"),
        ],
      }),
    );
    await open(2);
    fireEvent.click(screen.getByRole("button", { name: "Edit wording" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Key point wording" }), {
      target: { value: "Leaves make food." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save wording" }));

    await waitFor(() => expect(api.amendKeyPoint).toHaveBeenCalledWith("l-1", "kp-1", "Leaves make food."));
    const top = screen.getByText("Nevo wants your eyes on these").parentElement!;
    expect(await within(top).findByText("You changed the wording.")).toBeInTheDocument();
    expect(within(top).getByText("Leaves make food.")).toBeInTheDocument();
  });

  it("signs every key point in one press, with the hash it was shown", async () => {
    api.review.mockResolvedValue(reviewOf({ missingKeyPointSegmentIds: [] }));
    api.approveAllKeyPoints.mockResolvedValue(
      reviewOf({ missingKeyPointSegmentIds: [], keyPointApproval: signoff("key_points") }),
    );
    await open(2);
    fireEvent.click(screen.getByRole("button", { name: "Accept all 3 key points" }));

    await waitFor(() => expect(api.approveAllKeyPoints).toHaveBeenCalledWith("l-1", HASH_K));
    expect(await screen.findByText(/Step 3 of 5/)).toBeInTheDocument();
    expect(api.acceptKeyPoint).not.toHaveBeenCalled();
  });

  it("re-reads and says so when the lesson changed underneath", async () => {
    api.review.mockResolvedValue(reviewOf({ missingKeyPointSegmentIds: [] }));
    api.approveAllKeyPoints.mockRejectedValue(
      new ApiError(409, "changed", {
        detail: { code: "review_content_changed", message: "The lesson changed." },
      }),
    );
    await open(2);
    fireEvent.click(screen.getByRole("button", { name: "Accept all 3 key points" }));

    expect(await screen.findByText(/The lesson changed while you had it open/)).toBeInTheDocument();
    expect(api.review).toHaveBeenCalledTimes(2);
    expect(api.approveAllKeyPoints).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Step 2 of 5/)).toBeInTheDocument();
  });

  it("shows the server's reason when an approval is refused", async () => {
    api.review.mockResolvedValue(reviewOf({ missingKeyPointSegmentIds: [] }));
    api.approveAllKeyPoints.mockRejectedValue(
      new ApiError(409, "x", {
        detail: { code: "lesson_not_ready_for_review", message: "Wait for the lesson to finish processing before approving." },
      }),
    );
    await open(2);
    fireEvent.click(screen.getByRole("button", { name: "Accept all 3 key points" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Wait for the lesson to finish processing before approving.",
    );
  });
});

describe("the rewrites", () => {
  it("lists each part with a simpler and a longer version, and no Flag", async () => {
    await open(4);

    expect(screen.getByText(/Step 4 of 5/)).toBeInTheDocument();
    expect(screen.getAllByText("Simpler")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /Flag/ })).not.toBeInTheDocument();
  });

  it("opens a part to both versions, each editable", async () => {
    api.editRewrite.mockResolvedValue(reviewOf());
    await open(4);
    fireEvent.click(screen.getByRole("button", { name: "Open the rewrites of Part 1" }));

    expect(screen.getByText("Simpler part 1.")).toBeInTheDocument();
    expect(screen.getByText("Longer part 1.")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Edit wording" })[0]);
    fireEvent.change(screen.getByRole("textbox", { name: "Simpler version wording" }), {
      target: { value: "A leaf makes food." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save wording" }));

    await waitFor(() =>
      expect(api.editRewrite).toHaveBeenCalledWith("l-1", "s-1", "simplified", "A leaf makes food."),
    );
    // The new wording lives on the lesson, so the lesson is read again.
    await waitFor(() => expect(api.detail).toHaveBeenCalledTimes(2));
  });

  it("signs every rewrite in one press and goes live", async () => {
    api.review.mockResolvedValue(
      reviewOf({ missingKeyPointSegmentIds: [], keyPointApproval: signoff("key_points") }),
    );
    api.approveAllRewrites.mockResolvedValue(
      reviewOf({
        missingKeyPointSegmentIds: [],
        keyPointApproval: signoff("key_points"),
        rewriteApproval: signoff("rewrites"),
        reviewComplete: true,
      }),
    );
    await open(4);
    fireEvent.click(screen.getByRole("button", { name: "Accept all rewrites" }));

    await waitFor(() => expect(api.approveAllRewrites).toHaveBeenCalledWith("l-1", HASH_R));
    expect(await screen.findByRole("heading", { name: "This lesson is ready" })).toBeInTheDocument();
  });

  it("asks nothing of a lesson with no rewrites", async () => {
    api.detail.mockResolvedValue(lesson(SEGMENTS.map((s) => ({ ...s, depthVariants: null }))));
    api.review.mockResolvedValue(reviewOf({ rewriteCount: 0, pendingRewriteCount: 0 }));
    await open(4);

    expect(screen.queryByRole("button", { name: "Accept all rewrites" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });
});

describe("live", () => {
  const complete = (rewriteBy = "Ms. Adeyemi") =>
    api.review.mockResolvedValue(
      reviewOf({
        missingKeyPointSegmentIds: [],
        keyPointApproval: signoff("key_points"),
        rewriteApproval: signoff("rewrites", rewriteBy),
        reviewComplete: true,
      }),
    );

  it("opens on live once the lesson is signed off, naming who and when", async () => {
    complete();
    await open();

    expect(screen.getByRole("heading", { name: "This lesson is ready" })).toBeInTheDocument();
    expect(screen.getByText("Approved by Ms. Adeyemi · 19 October")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Assign to classes" })).toHaveAttribute(
      "href",
      "/teacher/lessons/assign?lesson=l-1",
    );
  });

  it("names both people when two signed", async () => {
    complete("Mr. Okafor");
    await open();

    expect(screen.getByText("Key points approved by Ms. Adeyemi · 19 October")).toBeInTheDocument();
    expect(screen.getByText("Rewrites approved by Mr. Okafor · 19 October")).toBeInTheDocument();
  });

  it("makes no claim about how a child learns", async () => {
    complete();
    await open();

    expect(screen.queryByText(/suits how they learn/)).not.toBeInTheDocument();
  });

  it("is not live before the sign-off, and says what is left", async () => {
    await open(5);

    expect(screen.getByRole("heading", { name: "Not live yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to the key points" })).toBeInTheDocument();
  });
});

describe("the same at 73 sections as at 7", () => {
  it("keeps one press, and only the counts change", async () => {
    const many = Array.from({ length: 73 }, (_, i) => seg(i + 1));
    api.detail.mockResolvedValue(lesson(many));
    api.review.mockResolvedValue(
      reviewOf({
        keyPoints: many.map((s, i) => point(`kp-${i + 1}`, s.id)),
        missingKeyPointSegmentIds: [],
        rewriteCount: 146,
      }),
    );
    await open(2);

    expect(screen.getByRole("button", { name: "Accept all 73 key points" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "+ 68 more, all read cleanly" })).toBeInTheDocument();

    const steps = within(screen.getByRole("navigation", { name: "Lesson review steps" }));
    fireEvent.click(steps.getByRole("button", { name: /Rewrites/ }));
    expect(
      screen.getByRole("button", { name: "+ 68 more sections, each rewritten the same way" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept all rewrites" })).toBeInTheDocument();
  });
});

/**
 * C07d, as its port note has it: optional editing, "reached from step 1 only
 * when a teacher wants to change something".
 */
describe("the way to change how it is broken up", () => {
  it("is offered on step 1", async () => {
    await open();

    expect(screen.getByRole("link", { name: "Change something" })).toHaveAttribute(
      "href",
      "/teacher/lessons/l-1/structure",
    );
  });
});
