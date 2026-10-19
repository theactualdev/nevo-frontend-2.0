import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import { clearSession, setSession } from "@/lib/auth/session";
import type { CalculationVariant } from "@/lib/api/variants";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * A calculation's answers, written for the server to mark (Lydia, 17 Oct:
 * "Answer two things wrong deliberately, let the support rise on its own").
 *
 * The engine takes the error streak that offers a hint and opens the Socratic
 * panel from the answers the server has marked, and overwrites any count the
 * app sends. No calculation step was ever written, so a child getting
 * calculation steps wrong could never make support rise. Each committed step
 * is written now, each wrong try its own answer, timed as it was measured
 * (rule 4), with the solved calculation after them - and nothing for the
 * signed-out walkthrough.
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const SEG = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";

const progress = vi.hoisted(() => ({
  report: vi.fn(),
  sessionId: null as string | null,
  completionSaved: false,
  completionFailed: false,
  saved: null as unknown,
  opened: null as unknown,
  localId: "local-1",
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ ...progress }),
}));

const { trackEvent, saveAttempt } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  saveAttempt: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({
    offeredBreak: null,
    reason: null,
    forSegmentId: null,
    plan: null,
  }),
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
vi.mock("@/lib/api/scheduler", () => ({
  schedulerApi: { recordReview: vi.fn().mockResolvedValue({}) },
}));
vi.mock("@/lib/api/scaffolds", () => ({
  scaffoldsApi: { attempt: vi.fn().mockResolvedValue({}) },
}));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: {
      ...actual.lessonsApi,
      saveAttempt: (...a: unknown[]) => saveAttempt(...a),
      attempts: vi.fn().mockResolvedValue([]),
    },
  };
});
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const step = (over: Record<string, unknown> = {}) => ({
  stepId: "s1",
  stepNumber: 1,
  prompt: "What are the denominators?",
  expectedInput: "selection",
  input: "choice",
  options: [
    { value: "same", label: "4 and 4" },
    { value: "differ", label: "1 and 2" },
  ],
  answer: "same",
  targets: [],
  hint: "Look at the bottom number of each fraction.",
  confirmationText: "",
  visualUpdate: "",
  assembles: "1/4 + 2/4 = ?/4",
  equationState: "1/4 + 2/4 = ?/4",
  unit: null,
  narrationAudio: null,
  ...over,
});

const NUMBER = (over: Record<string, unknown> = {}) =>
  step({
    stepId: "s2",
    prompt: "So what is 1 + 2?",
    expectedInput: "numeric",
    input: "number",
    options: [],
    answer: "3",
    hint: "",
    assembles: "1/4 + 2/4 = 3/4",
    equationState: "1/4 + 2/4 = 3/4",
    ...over,
  });

const BUILD = (over: Record<string, unknown> = {}) =>
  step({
    stepId: "b1",
    prompt: "Build the total.",
    expectedInput: "drag",
    input: "tap",
    options: [
      { value: "1/4", label: "1/4" },
      { value: "2/4", label: "2/4" },
    ],
    answer: 2,
    tapCount: 2,
    hint: "",
    ...over,
  });

const lessonWith = (steps: ReturnType<typeof step>[]): Lesson =>
  ({
    id: "l-1",
    title: "Fractions",
    segments: [
      {
        id: SEG,
        modalities: ["text", "interactive"],
        text: { heading: "Adding", body: { default: "Add them." } },
        calculationVariant: "co_construction",
        calculation: calculationFromVariant({
          type: "co_construction",
          conceptId: "c-1",
          fullEquation: "1/4 + 2/4 = 3/4",
          expression: "1/4 + 2/4",
          answer: "3/4",
          scaffold: null,
          manipulative: { kind: "fraction_bar", parts: 4, rows: 1, labels: [] },
          steps,
          completionStatement: "",
        } as unknown as CalculationVariant),
      },
      {
        id: "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d",
        modalities: ["text"],
        text: { heading: "After", body: { default: "Done." } },
      },
    ],
  }) as unknown as Lesson;

const PLAN: AdaptationPlan = {
  lessonId: "l-1",
  segments: [{ segmentId: SEG, startModality: "interactive" }],
};

const tap = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));
const pick = (label: string) => {
  tap(label);
  tap("Check my answer");
};
const enter = (value: string) => {
  fireEvent.change(screen.getByRole("textbox"), { target: { value } });
  tap("Check my answer");
};
const placePiece = () =>
  fireEvent.click(screen.getAllByRole("button", { name: "+ 1/4" })[0]);

/** Every body written for one problem, in the order written. */
const written = (problemId: string) =>
  saveAttempt.mock.calls
    .filter(([, body]) => (body as { problemId: string }).problemId === problemId)
    .map(([, body]) => body as Record<string, unknown>);

/** What this device holds of stu-1's answers - see `pendingProgress`. */
const heldAnswers = () =>
  Object.values(
    JSON.parse(
      window.localStorage.getItem("nevo.lesson.pendingAnswers.stu-1") ?? "{}",
    ),
  ) as { sessionId: string | null; body: Record<string, unknown> }[];

const clock = { now: 1_000 };
let now: { mockRestore: () => void } | undefined;

beforeEach(() => {
  window.localStorage.clear();
  progress.sessionId = SESSION;
  trackEvent.mockReset();
  saveAttempt.mockReset().mockResolvedValue({});
  clock.now = 1_000;
  now = vi.spyOn(performance, "now").mockImplementation(() => clock.now);
});

afterEach(() => {
  now?.mockRestore();
  cleanup();
  clearSession();
});

describe("each calculation step the child commits", () => {
  it("is written, a wrong try and the right one each its own answer, timed as it was measured", () => {
    render(<LessonPlayer lesson={lessonWith([NUMBER()])} plan={PLAN} live />);

    clock.now = 4_000;
    enter("5");
    clock.now = 6_500;
    enter("3");

    const [wrong, right] = written("s2");
    expect(written("s2")).toHaveLength(2);
    expect(wrong).toEqual({
      sessionId: SESSION,
      problemId: "s2",
      segmentId: SEG,
      source: "calculation",
      // As typed: the server marks it, never the solver's tick.
      answer: "5",
      // From the step being put to the child.
      responseTimeMs: 3_000,
      clientAttemptId: expect.any(String),
    });
    expect(right).toEqual({
      sessionId: SESSION,
      problemId: "s2",
      segmentId: SEG,
      source: "calculation",
      answer: "3",
      // From the miss, where the step was put back to the child.
      responseTimeMs: 2_500,
      clientAttemptId: expect.any(String),
    });
    // Two answers, never one sent twice.
    expect(wrong.clientAttemptId).not.toBe(right.clientAttemptId);
    // No verdict and no key: the server marks it.
    expect(Object.keys(wrong)).not.toContain("correct");
  });

  it("sends a choice step's option value, the one the child picked", () => {
    render(<LessonPlayer lesson={lessonWith([step()])} plan={PLAN} live />);

    pick("1 and 2");
    pick("4 and 4");

    expect(written("s1").map((b) => b.answer)).toEqual(["differ", "same"]);
  });

  it("sends a finished build as the count the step stores, in the type it is stored in", () => {
    render(
      <LessonPlayer lesson={lessonWith([BUILD(), BUILD({ stepId: "b2", answer: "2" })])} plan={PLAN} live />,
    );

    placePiece();
    placePiece();
    // Building it is not answering it (Lydia, 17 Oct, item 4).
    expect(written("b1")).toEqual([]);
    tap("That's the total");
    placePiece();
    placePiece();
    tap("That's the total");

    // A number as a number, text as text: a step with options is matched as
    // text, and 2 is not "2" there.
    expect(written("b1")).toEqual([
      expect.objectContaining({ source: "calculation", segmentId: SEG, answer: 2 }),
    ]);
    expect(written("b2")).toEqual([expect.objectContaining({ answer: "2" })]);
  });

  it("writes nothing for a build the server cannot mark as a count", () => {
    // 17b's bar: two quarters built, stored as "2/4". The two pieces are not
    // that answer, and filing them would mark a right build wrong.
    render(
      <LessonPlayer lesson={lessonWith([BUILD({ answer: "2/4" })])} plan={PLAN} live />,
    );

    placePiece();
    placePiece();
    tap("That's the total");

    expect(written("b1")).toEqual([]);
  });

  it("says a hint was on screen for the step, and only for that step", () => {
    render(
      <LessonPlayer lesson={lessonWith([step(), NUMBER()])} plan={PLAN} live />,
    );

    tap("Need a hint?");
    pick("1 and 2");
    pick("4 and 4");
    enter("3");

    // Both tries on the hinted step had it; the next step did not.
    expect(written("s1").map((b) => b.hintCount)).toEqual([1, 1]);
    expect(written("s2")[0]).not.toHaveProperty("hintCount");
  });
});

describe("the solved calculation", () => {
  it("is written as its own answer, keyed on the segment, after its steps", async () => {
    render(
      <LessonPlayer lesson={lessonWith([step(), NUMBER()])} plan={PLAN} live />,
    );

    clock.now = 3_000;
    pick("4 and 4");
    clock.now = 9_000;
    enter("3");

    await waitFor(() => expect(written(SEG)).toHaveLength(1));
    expect(written(SEG)[0]).toEqual({
      sessionId: SESSION,
      problemId: SEG,
      segmentId: SEG,
      source: "calculation",
      // The solution that assembled - the problem the server keys on the
      // segment is answered with it.
      answer: "3/4",
      // The whole calculation, from its first step being put to the child.
      responseTimeMs: 8_000,
      clientAttemptId: expect.any(String),
    });
    // The server judges it from the steps' answers, so it goes last.
    const order = saveAttempt.mock.calls.map(
      ([, body]) => (body as { problemId: string }).problemId,
    );
    expect(order).toEqual(["s1", "s2", SEG]);
  });

  it("waits for the last step's answer to land before it goes", async () => {
    // Sent together, the server could judge the solve before it held the
    // last step - and miss a hint used on it.
    let land: (value: unknown) => void = () => {};
    saveAttempt.mockImplementation((_lesson: string, body: { problemId: string }) =>
      body.problemId === "s2"
        ? new Promise((resolve) => {
            land = resolve;
          })
        : Promise.resolve({}),
    );
    render(<LessonPlayer lesson={lessonWith([NUMBER()])} plan={PLAN} live />);

    enter("3");
    await Promise.resolve();
    await Promise.resolve();

    expect(written("s2")).toHaveLength(1);
    expect(written(SEG)).toEqual([]);
    land({});
    await waitFor(() => expect(written(SEG)).toHaveLength(1));
  });
});

describe("what is never written", () => {
  it("is anything at all from the signed-out walkthrough", async () => {
    render(<LessonPlayer lesson={lessonWith([step(), NUMBER()])} plan={PLAN} />);

    pick("1 and 2");
    pick("4 and 4");
    enter("3");
    await Promise.resolve();

    expect(saveAttempt).not.toHaveBeenCalled();
  });
});

describe("with no session to write under", () => {
  it("holds each answer on the device, timed as it was measured", async () => {
    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      userId: "stu-1",
      role: "student",
    });
    progress.sessionId = null;
    render(<LessonPlayer lesson={lessonWith([NUMBER()])} plan={PLAN} live />);

    clock.now = 2_200;
    enter("5");
    clock.now = 3_000;
    enter("3");

    expect(saveAttempt).not.toHaveBeenCalled();
    await waitFor(() => expect(heldAnswers()).toHaveLength(3));
    expect(heldAnswers().map((a) => a.body)).toEqual([
      expect.objectContaining({
        problemId: "s2",
        source: "calculation",
        answer: "5",
        responseTimeMs: 1_200,
      }),
      expect.objectContaining({
        problemId: "s2",
        source: "calculation",
        answer: "3",
        responseTimeMs: 800,
      }),
      expect.objectContaining({
        problemId: SEG,
        source: "calculation",
        answer: "3/4",
        responseTimeMs: 2_000,
      }),
    ]);
  });
});
