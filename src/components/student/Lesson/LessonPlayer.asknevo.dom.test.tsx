import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { LessonAskNevo } from "@/app/student/lessons/[lessonId]/LessonAskNevo";
import { LessonProvider } from "@/context/LessonContext";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import { clearSession, setSession } from "@/lib/auth/session";
import type { CalculationVariant } from "@/lib/api/variants";
import type { Lesson } from "@/lib/types";

/**
 * ASK NEVO IN THE LESSON (Lydia, 4 Nov, reversing her 17 Oct item 29 and IA
 * 31): the corner pill on every screen of the player, but closed and gone
 * while an answer is being taken - a check's sheet open, a calculation step
 * being answered, the after-lesson questions - where the Socratic panel is
 * the help. The real player, inside the lesson's provider, with the layout's
 * own `LessonAskNevo` beside it.
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const SEG_1 = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";
const SEG_2 = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";

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
vi.mock("next/navigation", () => ({
  usePathname: () => "/student/lessons/lesson-1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
const ask = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, askNevoApi: { ask: (...a: unknown[]) => ask(...a) } };
});
// The lesson's own provider, so the player publishes the lesson it is in.
vi.mock("@/hooks", async () => {
  const { useContext } = await import("react");
  const { LessonContext } = await import("@/context/LessonContext");
  return {
    useAuth: () => ({ user: { id: "stu-1" } }),
    useLesson: () => useContext(LessonContext),
    useSignals: () => ({ trackEvent: vi.fn(), flush: vi.fn() }),
  };
});
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ offeredBreak: null, reason: null, plan: null }),
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
vi.mock("@/lib/api/scheduler", () => ({
  schedulerApi: { recordReview: vi.fn().mockResolvedValue({}) },
}));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: {
      ...actual.lessonsApi,
      saveAttempt: vi.fn().mockResolvedValue({}),
      attempts: vi.fn().mockResolvedValue([]),
    },
  };
});
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const QUICK_CHECK = {
  id: "cp-inline",
  question: "Which number is on top?",
  options: [
    { id: "a", label: "The numerator", value: "a" },
    { id: "b", label: "The denominator", value: "b" },
  ],
  correctId: "a",
  correctNote: "Yes.",
  recoveryNote: "Not quite.",
  conceptId: "concept-1",
  holds: true,
};

const text = (heading: string) => ({
  modalities: ["text"],
  text: { heading, body: { default: `Body of ${heading}.` } },
});

const WITH_CHECK = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  title: "Fractions",
  segments: [
    { id: SEG_1, ...text("Numerators"), quickCheck: QUICK_CHECK },
    { id: SEG_2, ...text("Denominators") },
  ],
  assessment: {
    questions: [
      {
        id: "cp-1",
        prompt: "Question 1?",
        options: [
          { id: "2", label: "Two", value: 2 },
          { id: "3", label: "Three", value: 3 },
        ],
        correctId: "2",
      },
    ],
  },
} as unknown as Lesson;

const WITH_CALC = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  title: "Fractions",
  segments: [
    {
      id: SEG_1,
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
        steps: [
          {
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
            hint: "",
            confirmationText: "",
            visualUpdate: "",
            assembles: "1/4 + 2/4 = ?/4",
            equationState: "1/4 + 2/4 = ?/4",
            unit: null,
            narrationAudio: null,
          },
        ],
        completionStatement: "",
      } as unknown as CalculationVariant),
    },
    { id: SEG_2, ...text("After") },
  ],
} as unknown as Lesson;

const CALC_PLAN = {
  lessonId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  segments: [{ segmentId: SEG_1, startModality: "interactive" }],
};

const play = (lesson: Lesson, plan: unknown = null) =>
  render(
    <LessonProvider>
      <LessonPlayer lesson={lesson} plan={plan as never} live />
      <LessonAskNevo />
    </LessonProvider>,
  );

/**
 * The mobile circle and the desktop pill: jsdom draws both (no media queries).
 * Counted whether or not a sheet over them hides them from a screen reader:
 * gone means not there at all, not merely covered.
 */
const launchers = () =>
  screen.queryAllByRole("button", { name: /ask nevo/i, hidden: true });
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const tap = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

beforeAll(() => {
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  window.localStorage.clear();
  progress.sessionId = SESSION;
  progress.opened = null;
  ask.mockReset().mockResolvedValue({ answer: "…", threadId: null });
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "stu-1",
    role: "student",
  });
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("Ask Nevo in the lesson player", () => {
  it("is there while a section is being read", async () => {
    play(WITH_CHECK);

    await waitFor(() => expect(launchers().length).toBeGreaterThan(0));
  });

  it("goes while a check's sheet is open, and is back when it closes", async () => {
    play(WITH_CHECK);
    await waitFor(() => expect(launchers().length).toBeGreaterThan(0));

    next();
    await screen.findByRole("button", { name: /The numerator/ });
    expect(launchers()).toEqual([]);

    tap("The numerator");
    tap("Continue");
    await waitFor(() => expect(launchers().length).toBeGreaterThan(0));
  });

  it("goes for the after-lesson questions", async () => {
    play(WITH_CHECK);
    next();
    tap(await screen.findByRole("button", { name: /The numerator/ }).then((b) => b.textContent ?? ""));
    tap("Continue");
    next();

    await screen.findByRole("button", { name: "Start" });
    expect(launchers()).toEqual([]);
  });

  it("is there on the player's own completion screen", async () => {
    play({
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      title: "Fractions",
      segments: [{ id: SEG_1, ...text("Numerators") }],
    } as unknown as Lesson);
    next();

    await waitFor(() => expect(launchers().length).toBeGreaterThan(0));
    expect(screen.queryByText("Body of Numerators.")).toBeNull();
  });

  it("is there on a review session's entry", async () => {
    render(
      <LessonProvider>
        <LessonPlayer lesson={WITH_CHECK} plan={null} live review />
        <LessonAskNevo />
      </LessonProvider>,
    );

    await screen.findByRole("button", { name: "Leave for now" });
    await waitFor(() => expect(launchers().length).toBeGreaterThan(0));
  });

  it("goes while a calculation step is being answered, and is back once it is solved", async () => {
    play(WITH_CALC, CALC_PLAN);
    await screen.findByText("What are the denominators?");
    expect(launchers()).toEqual([]);

    tap("4 and 4");
    tap("Check my answer");

    await waitFor(() => expect(launchers().length).toBeGreaterThan(0));
  });

  it("asks with the lesson's id, as on the completion screen", async () => {
    play(WITH_CHECK);
    await waitFor(() => expect(launchers().length).toBeGreaterThan(0));
    fireEvent.click(launchers()[0]);
    const box = await screen.findByRole("textbox");
    fireEvent.change(box, { target: { value: "What is a numerator?" } });
    fireEvent.keyDown(box, { key: "Enter" });

    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(ask.mock.calls[0][0]).toMatchObject({
      contextIds: { lessonId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    });
  });
});
