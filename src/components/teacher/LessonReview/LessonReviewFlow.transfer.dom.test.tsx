import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  CheckReviewItem,
  LessonReview,
  LessonSegment,
} from "@/lib/api/lessons";

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
 * C25, Transfer Question Review (1397ec4; Lydia's test 5), as far as the
 * server goes on 5 Nov (backend #8).
 *
 * What is pinned: a concept's four transfer items are drawn as the frame's
 * set - situation one, situation two, the question - under the concept's
 * name, with the fourth (diagnosis) as an ordinary check under it; they are
 * not drawn twice, and the one press still counts them; each part's answer
 * is a tap away; the heading never shows an id; and nothing approves a set
 * apart or changes a part, because no route does (rule 10, held).
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
  prompt: string,
  over: Partial<CheckReviewItem> = {},
): CheckReviewItem =>
  check(0, {
    segmentId: "l-1",
    segmentTitle: "End-of-lesson check",
    scope: "assessment",
    questionId: `transfer-${kind}`,
    questionPrompt: prompt,
    questionOptions: [
      { value: "a", label: `Right for ${kind}` },
      { value: "b", label: `Wrong for ${kind}` },
      { value: "c", label: `Also wrong for ${kind}` },
    ],
    questionAnswerKey: "a",
    masteryLevel: kind.startsWith("application") ? "application" : "analysis",
    masteryLevelAuthoredBy: "nevo",
    transferKind: kind,
    transferContext: `A context for ${kind}`,
    sourceSegmentId: "s-1",
    ...over,
  });

const SET = [
  transfer("application_a", "A recipe for 4 uses 200 g of rice. How much for 6?"),
  transfer("application_b", "On a map 2 cm is 5 km. How far is 7 cm?"),
  transfer("comparison", "What is the same about how you'd work out both?"),
  transfer("diagnosis", "Which step went wrong in this working?"),
];

const withConcepts = () => {
  const segs = [
    { ...SEGMENTS[0], conceptId: "c-prop" },
    { ...SEGMENTS[1], conceptId: "c-other" },
  ];
  api.detail.mockResolvedValue({ ...lesson, segments: segs });
};

describe("a transfer set", () => {
  beforeEach(() => {
    withConcepts();
    api.concept.mockResolvedValue({ id: "c-prop", name: "Proportion" });
    api.review.mockResolvedValue(reviewOf({ checks: [check(1), check(2), ...SET] }));
  });

  it("is headed by its concept and draws its three parts as the frame does", async () => {
    await open(3);

    const set = await screen.findByRole("region", { name: "Proportion · transfer question" });
    expect(within(set).getByText("One idea, two unlike situations")).toBeInTheDocument();
    expect(within(set).getByText("Situation one").closest("div")).toHaveTextContent(
      "A recipe for 4 uses 200 g of rice. How much for 6?",
    );
    expect(within(set).getByText("Situation two").closest("div")).toHaveTextContent(
      "On a map 2 cm is 5 km. How far is 7 cm?",
    );
    expect(within(set).getByText("The question").closest("div")).toHaveTextContent(
      "What is the same about how you'd work out both?",
    );
    expect(api.concept).toHaveBeenCalledWith("c-prop");
  });

  it("puts the fourth item, which the frame does not draw, under the set as an ordinary check", async () => {
    await open(3);

    const set = await screen.findByRole("region", { name: "Proportion · transfer question" });
    expect(within(set).getByText("Written with this set")).toBeInTheDocument();
    expect(within(set).getByRole("button", { name: /Which step went wrong/ })).toBeInTheDocument();
  });

  it("is not drawn a second time in the lists", async () => {
    await open(3);

    await screen.findByRole("region", { name: "Proportion · transfer question" });
    expect(screen.getAllByText("A recipe for 4 uses 200 g of rice. How much for 6?")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Which step went wrong/ })).toHaveLength(1);
  });

  /* The one press still accepts them with every other check: the count is true. */
  it("is counted in what the one press accepts", async () => {
    await open(3);

    expect(await screen.findByRole("button", { name: "Accept all 6 checks" })).toBeInTheDocument();
  });

  it("keeps each part's answer one tap away", async () => {
    await open(3);

    const set = await screen.findByRole("region", { name: "Proportion · transfer question" });
    expect(within(set).queryByText("Right for application_a")).toBeNull();
    fireEvent.click(within(set).getAllByRole("button", { name: "Show the answer" })[0]);
    expect(within(set).getByText("Right for application_a")).toBeInTheDocument();
  });

  /* Held (rule 10): no route approves a set apart, and none changes a part. */
  it("offers no set approval and no way to change a part", async () => {
    await open(3);

    await screen.findByRole("region", { name: "Proportion · transfer question" });
    expect(screen.queryByRole("button", { name: /work as a set/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /change one/i })).toBeNull();
    expect(screen.queryByText(/stand or change together/i)).toBeNull();
  });
});

describe("a transfer set's heading", () => {
  it("falls back to the section it came from when the concept can't be read - never an id", async () => {
    withConcepts();
    api.concept.mockRejectedValue(new Error("down"));
    api.review.mockResolvedValue(reviewOf({ checks: [check(1), ...SET] }));
    await open(3);

    expect(await screen.findByRole("region", { name: "Part 1 · transfer question" })).toBeInTheDocument();
    expect(screen.queryByText(/c-prop/)).toBeNull();
  });
});

describe("a lesson with no transfer set", () => {
  it("draws no set and asks for no concept", async () => {
    withConcepts();
    await open(3);

    await screen.findAllByRole("button", { name: /question \d\?/ });
    expect(screen.queryByText("One idea, two unlike situations")).toBeNull();
    expect(api.concept).not.toHaveBeenCalled();
  });
});
