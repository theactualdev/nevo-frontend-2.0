import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  CheckReviewItem,
  LessonReview,
  LessonSegment,
} from "@/lib/api/lessons";
import { ApiError } from "@/lib/api/client";

const api = vi.hoisted(() => ({
  detail: vi.fn(),
  review: vi.fn(),
  approveAllKeyPoints: vi.fn(),
  approveAllChecks: vi.fn(),
  approveAllGuidedSteps: vi.fn(),
  approveAllCalculationParts: vi.fn(),
  approveAllRewrites: vi.fn(),
  amendKeyPoint: vi.fn(),
  resolveMissingKeyPoint: vi.fn(),
  editRewrite: vi.fn(),
  concept: vi.fn(),
  generateTransferItems: vi.fn(),
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
 * The press that asks Nevo for a concept's transfer set (C25, test 5).
 * HELD: no frame draws it (Hub, 5 Nov), and nothing writes a set at upload.
 *
 * What is pinned: one press per concept with no set, under its name, and
 * none for a concept that has one or a section with no concept; it asks for
 * that concept and shows the review the server returns; each refusal is a
 * plain line and the press can be tried again; and a set that already exists
 * is read back rather than reported as a failure.
 */

const HASH_K = "a".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_G = "d".repeat(64);

const seg = (n: number): LessonSegment =>
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
    depthVariants: null,
  }) as unknown as LessonSegment;

const SEGMENTS = [seg(1), seg(2)];

const lesson = {
  id: "l-1",
  title: "Photosynthesis in Leaves",
  subject: "Biology",
  status: "completed",
  segmentCount: 2,
  segments: SEGMENTS,
  modules: [],
  confirmationSummary: null,
};

const check = (n: number, over: Partial<CheckReviewItem> = {}): CheckReviewItem => ({
  segmentId: `s-${n}`,
  segmentTitle: `Part ${n}`,
  questionId: `q-${n}`,
  questionPrompt: `What do leaves need, question ${n}?`,
  questionAnswerType: "single_choice",
  questionOptions: [
    { value: "a", label: "Light" },
    { value: "b", label: "Salt" },
  ],
  questionAnswerKey: "a",
  teacherReviewed: false,
  markable: true,
  ...over,
});

const signoff = (kind: "key_points" | "checks" | "guided_steps", hash: string) => ({
  id: `so-${kind}`,
  kind,
  approvedBy: "t-1",
  approvedByName: "Ms. Adeyemi",
  approvedAt: "2026-10-27T10:00:00Z",
  contentHash: hash,
  current: true,
});

const reviewOf = (over: Partial<LessonReview> = {}): LessonReview => ({
  lessonId: "l-1",
  title: "Photosynthesis in Leaves",
  outstandingCount: 0,
  keyPointCount: 0,
  readyToAssign: false,
  keyPoints: [],
  keyPointsContentHash: HASH_K,
  rewritesContentHash: "",
  keyPointApproval: signoff("key_points", HASH_K),
  rewriteApproval: null,
  missingKeyPointSegmentIds: [],
  rewriteCount: 0,
  pendingRewriteCount: 0,
  reviewComplete: false,
  checks: [check(1), check(2)],
  checksContentHash: HASH_C,
  checksApproval: null,
  guidedSteps: [],
  guidedStepsContentHash: HASH_G,
  guidedStepsApproval: null,
  ...over,
});

const open = async (step?: 1 | 2 | 3 | 4 | 5) => {
  render(<LessonReviewRoute lessonId="l-1" step={step} />);
  await screen.findByRole("navigation", { name: "Lesson review steps" });
};

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
  api.detail.mockResolvedValue(lesson);
  api.review.mockResolvedValue(reviewOf());
});

const transfer = (
  kind: "application_a" | "application_b" | "comparison" | "diagnosis",
  source = "s-1",
): CheckReviewItem =>
  check(0, {
    segmentId: "l-1",
    segmentTitle: "End-of-lesson check",
    scope: "assessment",
    questionId: `transfer-${source}-${kind}`,
    questionPrompt: `The ${kind} item for ${source}?`,
    masteryLevel: kind.startsWith("application") ? "application" : "analysis",
    masteryLevelAuthoredBy: "nevo",
    transferKind: kind,
    sourceSegmentId: source,
  });

const setFor = (source: string) =>
  (["application_a", "application_b", "comparison", "diagnosis"] as const).map((k) => transfer(k, source));

const withConcepts = (a: string | null = "c-prop", b: string | null = "c-other") =>
  api.detail.mockResolvedValue({
    ...lesson,
    segments: [
      { ...SEGMENTS[0], conceptId: a },
      { ...SEGMENTS[1], conceptId: b },
    ],
  });

const refusal = (status: number, code: string) =>
  new ApiError(status, code, { detail: { code } });

beforeEach(() => {
  api.concept.mockImplementation(async (id: string) => ({
    id,
    name: id === "c-prop" ? "Proportion" : "Ratio",
  }));
});

describe("the press that writes a transfer set (held for its frame)", () => {
  it("is offered for each concept with no set, under the concept's name", async () => {
    withConcepts();
    await open(3);

    expect(await screen.findAllByRole("button", { name: "Add a transfer question" })).toHaveLength(2);
    expect(await screen.findByText("Proportion · transfer question")).toBeInTheDocument();
    expect(await screen.findByText("Ratio · transfer question")).toBeInTheDocument();
  });

  it("is not offered for a concept that already has its set, or for a section with no concept", async () => {
    withConcepts("c-prop", null);
    api.review.mockResolvedValue(reviewOf({ checks: [check(1), ...setFor("s-1")] }));
    await open(3);

    await screen.findByRole("region", { name: "Proportion · transfer question" });
    expect(screen.queryByRole("button", { name: "Add a transfer question" })).toBeNull();
  });

  it("asks for that concept's set and shows what the server wrote", async () => {
    withConcepts("c-prop", null);
    api.generateTransferItems.mockResolvedValue({
      lessonId: "l-1",
      conceptId: "c-prop",
      generatedCount: 4,
      review: reviewOf({ checks: [check(1), check(2), ...setFor("s-1")] }),
    });
    await open(3);

    fireEvent.click(await screen.findByRole("button", { name: "Add a transfer question" }));

    expect(await screen.findByRole("region", { name: "Proportion · transfer question" })).toBeInTheDocument();
    expect(api.generateTransferItems).toHaveBeenCalledWith("l-1", "c-prop");
    expect(screen.getByText("The application_a item for s-1?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a transfer question" })).toBeNull();
  });

  it.each([
    [503, "transfer_generation_unavailable", "Nevo can't write one right now. Try again in a moment."],
    [502, "transfer_generation_invalid_output", "Nevo couldn't write one that works this time. Try again."],
    [409, "concept_has_no_source_section", "Nevo couldn't find a section that teaches this, so it can't write one."],
  ])("says plainly when the server refuses with %s %s, and can be pressed again", async (status, code, line) => {
    withConcepts("c-prop", null);
    api.generateTransferItems.mockRejectedValue(refusal(status, code));
    await open(3);

    fireEvent.click(await screen.findByRole("button", { name: "Add a transfer question" }));

    expect(await screen.findByText(line)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a transfer question" })).toBeEnabled();
  });

  it("reads the review again when the set turns out to exist already", async () => {
    withConcepts("c-prop", null);
    api.generateTransferItems.mockRejectedValue(refusal(409, "transfer_items_exist"));
    await open(3);
    const reads = api.review.mock.calls.length;
    api.review.mockResolvedValue(reviewOf({ checks: [check(1), ...setFor("s-1")] }));

    fireEvent.click(await screen.findByRole("button", { name: "Add a transfer question" }));

    expect(await screen.findByRole("region", { name: "Proportion · transfer question" })).toBeInTheDocument();
    expect(api.review.mock.calls.length).toBeGreaterThan(reads);
  });
});
