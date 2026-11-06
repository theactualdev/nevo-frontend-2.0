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
 * C24, Checks Review - Level Tags (1397ec4; Lydia's test 6), as far as the
 * server goes on 5 Nov (backend #8).
 *
 * What is pinned: the level a check asks for shows under its answer, in the
 * frame's words; a check with no level shows nothing (rule 5); a check whose
 * level Nevo inferred is in what the one press accepts, so the list is not
 * called "Answers Nevo wrote"; and nothing offers to change a level or sign it
 * off apart from its answer, because no route does either (rule 10, held).
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

const openCheck = (n: number) =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`question ${n}\\?`) }));

describe("the level a check asks for", () => {
  it("shows under the answer in the opened check, in the frame's words", async () => {
    api.review.mockResolvedValue(
      reviewOf({
        checks: [
          check(1, { masteryLevel: "knowledge", masteryLevelAuthoredBy: "nevo" }),
          check(2, { masteryLevel: "application", masteryLevelAuthoredBy: "nevo" }),
        ],
      }),
    );
    await open(3);
    openCheck(1);
    openCheck(2);

    expect(screen.getAllByText("The level")).toHaveLength(2);
    expect(screen.getByText("Knowing & understanding")).toBeInTheDocument();
    expect(screen.getByText("Application")).toBeInTheDocument();
  });

  it("names analysis as the frame does", async () => {
    api.review.mockResolvedValue(
      reviewOf({ checks: [check(1, { masteryLevel: "analysis", masteryLevelAuthoredBy: "person" })] }),
    );
    await open(3);
    openCheck(1);

    expect(screen.getByText("Analysis & evaluation")).toBeInTheDocument();
  });

  /* Lydia, 2 Nov: the one-line row is the question and its answer. */
  it("keeps the level off the one-line row", async () => {
    api.review.mockResolvedValue(
      reviewOf({ checks: [check(1, { masteryLevel: "application", masteryLevelAuthoredBy: "nevo" })] }),
    );
    await open(3);

    const row = screen.getByRole("button", { name: /question 1\?/ });
    expect(within(row).queryByText("Application")).toBeNull();
  });

  /* Rule 5: a lesson uploaded before levels has none, and none is invented. */
  it("draws nothing for a check with no level, or one the frame has no word for", async () => {
    api.review.mockResolvedValue(
      reviewOf({
        checks: [
          check(1),
          check(2, { masteryLevel: null }),
        ],
      }),
    );
    await open(3);
    openCheck(1);
    openCheck(2);

    expect(screen.queryByText("The level")).toBeNull();
    expect(screen.queryByText(/level it asks for/)).toBeNull();
  });

  it("says the step shows the level only when a check has one", async () => {
    api.review.mockResolvedValue(
      reviewOf({ checks: [check(1, { masteryLevel: "knowledge", masteryLevelAuthoredBy: "nevo" })] }),
    );
    await open(3);

    expect(
      // Lydia's words, 5 Nov.
      screen.getByText(/^For each check, the answer Nevo will mark against and the level it asks for\./),
    ).toBeInTheDocument();
  });
});

describe("what the one press accepts", () => {
  /*
   * Backend _checks_material: a check whose answer came from the file but
   * whose level Nevo inferred is in the sign-off. "Answers Nevo wrote" would
   * say something untrue about its answer.
   */
  it("is not called 'Answers Nevo wrote' when a level Nevo inferred is in it", async () => {
    api.review.mockResolvedValue(
      reviewOf({ checks: [check(1, { masteryLevel: "application", masteryLevelAuthoredBy: "nevo" })] }),
    );
    await open(3);

    expect(screen.getByText("What Nevo wrote, yours to accept")).toBeInTheDocument();
    expect(screen.queryByText("Answers Nevo wrote - yours to accept")).toBeNull();
  });

  it("keeps its old name when no level waits on it", async () => {
    api.review.mockResolvedValue(
      reviewOf({ checks: [check(1, { masteryLevel: "application", masteryLevelAuthoredBy: "person" })] }),
    );
    await open(3);

    expect(screen.getByText("Answers Nevo wrote - yours to accept")).toBeInTheDocument();
  });

  /*
   * Lydia, 5 Nov: no separate level sign-off, ever. "Change level" is ruled
   * in as an edit, and waits on Teslim's route.
   */
  it("offers no way to change a level or accept it apart from its answer", async () => {
    api.review.mockResolvedValue(
      reviewOf({ checks: [check(1, { masteryLevel: "application", masteryLevelAuthoredBy: "nevo" })] }),
    );
    await open(3);
    openCheck(1);

    expect(screen.queryByRole("button", { name: /change level/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /looks right/i })).toBeNull();
    expect(screen.queryByText(/separate calls/i)).toBeNull();
  });
});
