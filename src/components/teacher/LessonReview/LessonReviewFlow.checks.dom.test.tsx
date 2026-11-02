import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type {
  CheckReviewItem,
  GuidedStepsReviewItem,
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
 * SCRUM-291, the checks step (Lydia, 26 Oct: "Build it on the key points
 * step's pattern"), after the key points and before the rewrites.
 *
 * What is pinned: the server decides what needs a teacher - a check whose
 * answer came with the lesson (`teacherReviewed` at upload, Teslim 294584b)
 * is shown and never signed, and nothing assumes every check needs one; one
 * press signs the checks and then their guiding questions, each with the hash
 * of what was shown; the press waits for the key points, as the server does;
 * a check with no answer never holds anything; and the live step names what
 * is really left.
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

const guided = (n: number, over: Partial<GuidedStepsReviewItem> = {}): GuidedStepsReviewItem => ({
  segmentId: `s-${n}`,
  segmentTitle: `Part ${n}`,
  questionId: `q-${n}`,
  questionPrompt: `What do leaves need, question ${n}?`,
  reviewStatus: "pending_review",
  steps: [
    {
      id: `g-${n}-1`,
      prompt: "Where does a plant get its energy?",
      answerType: "boolean",
      options: [
        { value: true, label: "From the sun" },
        { value: false, label: "From the soil" },
      ],
      answerKey: true,
      explanation: "Think about what a plant turns towards.",
    },
  ],
  answerLeakageStepIds: [],
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

describe("where the checks step sits", () => {
  it("comes after the key points and before the rewrites", async () => {
    await open(3);

    const steps = within(screen.getByRole("navigation", { name: "Lesson review steps" }));
    const labels = steps.getAllByRole("button").map((b) => b.textContent ?? "");
    const at = (name: string) => labels.findIndex((l) => l.includes(name));
    expect(at("Key points")).toBeLessThan(at("Checks"));
    expect(at("Checks")).toBeLessThan(at("Rewrites"));
    expect(screen.getByText(/Step 3 of 5 · the checks/)).toBeInTheDocument();
  });
});

describe("reading what the lesson asks", () => {
  it("opens a check to its choices, with the answer marked", async () => {
    await open(3);
    fireEvent.click(screen.getByRole("button", { name: /question 1\?/ }));

    const right = screen.getByText("Light").closest("li")!;
    expect(within(right).getByText("The answer")).toBeInTheDocument();
    expect(within(screen.getByText("Salt").closest("li")!).queryByText("The answer")).toBeNull();
  });

  it("shows the answer itself where there are no choices", async () => {
    api.review.mockResolvedValue(
      reviewOf({
        checks: [check(1, { questionAnswerType: "numeric", questionOptions: [], questionAnswerKey: 6 })],
      }),
    );
    await open(3);
    fireEvent.click(screen.getByRole("button", { name: /question 1\?/ }));

    expect(screen.getByText("The answer:").parentElement).toHaveTextContent("The answer: 6");
  });

  it("shows the guiding questions under the check they lead to, each with its answer", async () => {
    api.review.mockResolvedValue(reviewOf({ guidedSteps: [guided(1)] }));
    await open(3);
    fireEvent.click(screen.getByRole("button", { name: /question 1\?/ }));

    expect(screen.getByText("If a child misses it, Nevo asks")).toBeInTheDocument();
    expect(screen.getByText("Where does a plant get its energy?")).toBeInTheDocument();
    const sun = screen.getByText("From the sun").closest("li")!;
    expect(within(sun).getByText("The answer")).toBeInTheDocument();
    expect(
      screen.getByText("If they get it wrong: Think about what a plant turns towards."),
    ).toBeInTheDocument();
  });
});

describe("what the server says needs a teacher", () => {
  it("signs nothing for checks that came with their answer in the file", async () => {
    api.review.mockResolvedValue(
      reviewOf({
        checks: [check(1, { teacherReviewed: true }), check(2, { teacherReviewed: true })],
      }),
    );
    await open(3);

    expect(screen.getByText("Answers from your file - nothing to accept")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("asks only about the ones Nevo wrote, beside the ones from the file", async () => {
    api.review.mockResolvedValue(
      reviewOf({ checks: [check(1), check(2, { teacherReviewed: true })] }),
    );
    await open(3);

    expect(screen.getByText("Answers Nevo wrote - yours to accept")).toBeInTheDocument();
    expect(screen.getByText("Answers from your file - nothing to accept")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept the check" })).toBeEnabled();
  });

  it("lists a check with no answer apart, and never asks to sign it", async () => {
    api.review.mockResolvedValue(
      reviewOf({
        checks: [check(1, { markable: false, questionAnswerKey: null })],
      }),
    );
    await open(3);

    expect(screen.getByText("Nevo can’t mark these")).toBeInTheDocument();
    expect(
      screen.getByText("Nevo has no answer to mark this against, so it never stops a child."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("says so plainly when a lesson has no checks", async () => {
    api.review.mockResolvedValue(reviewOf({ checks: [], guidedSteps: [] }));
    await open(3);

    expect(
      screen.getByText("This lesson has no checks, so there is nothing to accept here."),
    ).toBeInTheDocument();
  });
});

describe("the one press", () => {
  it("signs the checks, then their guiding questions, each with the hash it was shown", async () => {
    api.review.mockResolvedValue(reviewOf({ guidedSteps: [guided(1)] }));
    api.approveAllChecks.mockResolvedValue(
      reviewOf({
        guidedSteps: [guided(1)],
        checks: [check(1, { teacherReviewed: true }), check(2, { teacherReviewed: true })],
        checksApproval: signoff("checks", HASH_C),
      }),
    );
    api.approveAllGuidedSteps.mockResolvedValue(
      reviewOf({
        guidedSteps: [guided(1, { reviewStatus: "approved" })],
        checks: [check(1, { teacherReviewed: true }), check(2, { teacherReviewed: true })],
        checksApproval: signoff("checks", HASH_C),
        guidedStepsApproval: signoff("guided_steps", HASH_G),
      }),
    );
    await open(3);
    fireEvent.click(screen.getByRole("button", { name: "Accept all 2 checks" }));

    await waitFor(() => expect(api.approveAllGuidedSteps).toHaveBeenCalledWith("l-1", HASH_G));
    expect(api.approveAllChecks).toHaveBeenCalledWith("l-1", HASH_C);
    expect(api.approveAllChecks.mock.invocationCallOrder[0]).toBeLessThan(
      api.approveAllGuidedSteps.mock.invocationCallOrder[0],
    );
    // On to the rewrites.
    expect(await screen.findByText(/Step 4 of 5/)).toBeInTheDocument();
  });

  it("signs only the guiding questions where every check came with its answer", async () => {
    api.review.mockResolvedValue(
      reviewOf({
        checks: [check(1, { teacherReviewed: true })],
        guidedSteps: [guided(1)],
      }),
    );
    api.approveAllGuidedSteps.mockResolvedValue(
      reviewOf({
        checks: [check(1, { teacherReviewed: true })],
        guidedSteps: [guided(1, { reviewStatus: "approved" })],
        guidedStepsApproval: signoff("guided_steps", HASH_G),
      }),
    );
    await open(3);
    fireEvent.click(screen.getByRole("button", { name: "Accept the guiding questions" }));

    await waitFor(() => expect(api.approveAllGuidedSteps).toHaveBeenCalledWith("l-1", HASH_G));
    expect(api.approveAllChecks).not.toHaveBeenCalled();
  });

  it("waits for the key points, as the server does", async () => {
    api.review.mockResolvedValue(reviewOf({ keyPointApproval: null }));
    await open(3);

    expect(screen.getByRole("button", { name: "Accept all 2 checks" })).toBeDisabled();
    expect(
      screen.getByText("Accept the key points in step 2 first, then the checks."),
    ).toBeInTheDocument();
  });

  it("says the server's refusal in words when it sends only a code", async () => {
    api.approveAllChecks.mockRejectedValue(
      new ApiError(409, "x", { detail: { code: "key_points_approval_required" } }),
    );
    await open(3);
    fireEvent.click(screen.getByRole("button", { name: "Accept all 2 checks" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Accept the key points first, then the checks.",
    );
  });

  it("re-reads and says so when the lesson changed underneath", async () => {
    api.approveAllChecks.mockRejectedValue(
      new ApiError(409, "changed", { detail: { code: "review_content_changed" } }),
    );
    await open(3);
    fireEvent.click(screen.getByRole("button", { name: "Accept all 2 checks" }));

    expect(await screen.findByText(/The lesson changed while you had it open/)).toBeInTheDocument();
    expect(api.review).toHaveBeenCalledTimes(2);
    expect(api.approveAllGuidedSteps).not.toHaveBeenCalled();
  });

  it("names who accepted them once they are signed", async () => {
    api.review.mockResolvedValue(
      reviewOf({
        checks: [check(1, { teacherReviewed: true })],
        checksApproval: signoff("checks", HASH_C),
      }),
    );
    await open(3);

    expect(screen.getByText("Approved by Ms. Adeyemi · 27 October")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });
});

describe("a guiding question that may give the answer away", () => {
  it("wants a look at the top, without holding the press", async () => {
    api.review.mockResolvedValue(
      reviewOf({ guidedSteps: [guided(1, { answerLeakageStepIds: ["g-1-1"] })] }),
    );
    await open(3);

    expect(screen.getByText("Nevo wants your eyes on these")).toBeInTheDocument();
    expect(screen.getByText("1 flagged above - check or accept, your call.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept all 2 checks" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Looks right" }));
    expect(screen.getByText("You read this one.")).toBeInTheDocument();
  });
});

describe("live, with checks", () => {
  it("names the checks as what is left, and goes to them", async () => {
    api.review.mockResolvedValue(reviewOf({ rewriteCount: 0 }));
    await open(5);

    expect(
      screen.getByText("Accept the checks, and it goes into your library ready to assign."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to the checks" }));
    expect(screen.getByText(/Step 3 of 5 · the checks/)).toBeInTheDocument();
  });

  it("lists everything still waiting, in step order", async () => {
    api.review.mockResolvedValue(reviewOf({ keyPointApproval: null, rewriteCount: 2 }));
    await open(5);

    expect(
      screen.getByText(
        "Accept the key points, the checks and the rewrites, and it goes into your library ready to assign.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to the key points" })).toBeInTheDocument();
  });
});
