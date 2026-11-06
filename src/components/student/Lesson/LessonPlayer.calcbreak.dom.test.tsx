import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { CALC_BREAK_COPY } from "./CalculationBreak";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import { clearSession, setSession } from "@/lib/auth/session";
import type { CalculationVariant } from "@/lib/api/variants";
import type { AdaptationPlan, Lesson } from "@/lib/types";
import { offendingCalls } from "@/test/signalCatalogue";

/**
 * "TAKE A BREAK" ON A CALCULATION (Calculation Solver Frame, `break-mid`;
 * audit, 2 Nov, launch-level). A calculation holds a child at its step until
 * it is solved, and had no break unless the engine offered one. Lydia, 23 Oct:
 * a hold is not live until the break is reachable from it at all times.
 *
 * The frame: "Take a break" in the top bar; taken, a card above the
 * calculation, which waits beneath it untouched, until "I'm ready to keep
 * going". The child's own break, recorded as the check's is: on the sitting
 * where there is one, as our own `break_start` and `break_end` where not.
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";

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

const { trackEvent, controlBreak } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  controlBreak: vi.fn(),
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: {
      ...actual.lessonsApi,
      saveAttempt: vi.fn().mockResolvedValue({}),
      attempts: vi.fn().mockResolvedValue([]),
      controlBreak: (...a: unknown[]) => controlBreak(...a),
    },
  };
});

const calculation = calculationFromVariant({
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
        { value: "4 and 4", label: "4 and 4" },
        { value: "1 and 2", label: "1 and 2" },
      ],
      answer: "4 and 4",
      targets: [],
      hint: "Look at the bottom number of each fraction.",
      confirmationText: "",
      visualUpdate: "",
      assembles: "1/4 + 2/4 = ?",
      equationState: "1/4 + 2/4 = ?/4",
      unit: null,
      narrationAudio: null,
    },
  ],
  completionStatement: "",
} as unknown as CalculationVariant);

const LESSON = {
  id: "l-1",
  title: "Fractions",
  segments: [
    {
      id: "calc-1",
      modalities: ["text", "interactive"],
      text: { heading: "Adding", body: { default: "Add them." } },
      calculationVariant: "co_construction",
      calculation,
    },
    {
      id: "after",
      modalities: ["text"],
      text: { heading: "After", body: { default: "Done." } },
    },
  ],
} as unknown as Lesson;

const PLAN: AdaptationPlan = {
  lessonId: "l-1",
  segments: [{ segmentId: "calc-1", startModality: "interactive" }],
};

const sent = (type: string) =>
  trackEvent.mock.calls
    .filter(([t]) => t === type)
    .map(([, payload]) => payload as Record<string, unknown>);
const pill = () => screen.getByRole("button", { name: CALC_BREAK_COPY.take });
const ready = () => screen.getByRole("button", { name: CALC_BREAK_COPY.ready });
const option = () => screen.getByRole("button", { name: "4 and 4" });
const open = () => render(<LessonPlayer lesson={LESSON} plan={PLAN} live />);

beforeEach(() => {
  progress.sessionId = SESSION;
  trackEvent.mockReset();
  controlBreak.mockReset().mockResolvedValue({ status: "paused" });
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
  vi.restoreAllMocks();
  expect(offendingCalls(trackEvent.mock.calls)).toEqual([]);
});

describe("the calculation's way to a break", () => {
  it("is in the top bar while the calculation is worked, before a step is answered", () => {
    open();

    expect(pill().closest("header")).not.toBeNull();
    expect(option()).toBeInTheDocument();
  });

  it("is not on a section that is not a calculation", () => {
    render(
      <LessonPlayer
        lesson={{ ...LESSON, segments: [LESSON.segments[1]] } as Lesson}
        plan={null}
        live
      />,
    );

    expect(
      screen.queryByRole("button", { name: CALC_BREAK_COPY.take }),
    ).toBeNull();
  });
});

describe("taking it", () => {
  it("puts the frame's card above the calculation, which waits beneath it untouched", () => {
    open();
    fireEvent.click(pill());

    const card = screen.getByRole("region", { name: CALC_BREAK_COPY.label });
    expect(card.textContent).toContain(CALC_BREAK_COPY.body);
    expect(document.activeElement).toBe(ready());
    // Still there, as the child left it, and taking nothing.
    expect(option().closest("[inert]")).not.toBeNull();
    expect(
      card.compareDocumentPosition(option()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("starts the child's own break on the sitting, and returns it when they are ready", async () => {
    open();
    fireEvent.click(pill());
    expect(controlBreak).toHaveBeenCalledExactlyOnceWith(
      "l-1",
      SESSION,
      "start",
    );

    fireEvent.click(ready());
    await act(async () => {});

    expect(controlBreak).toHaveBeenLastCalledWith("l-1", SESSION, "return");
    // The server records it: nothing of ours, or it would count twice.
    expect(sent("break_start")).toEqual([]);
    expect(sent("break_end")).toEqual([]);
  });

  it("is recorded as our own break where there is no sitting", () => {
    progress.sessionId = null;
    let now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    open();

    fireEvent.click(pill());
    now += 4_000;
    fireEvent.click(ready());

    expect(controlBreak).not.toHaveBeenCalled();
    expect(sent("break_start")).toEqual([
      { breakType: "micro", trigger: "student_request" },
    ]);
    expect(sent("break_end")).toEqual([
      { breakType: "micro", trigger: "student_request", durationMs: 4_000 },
    ]);
  });

  it("gives the calculation back when they are ready, just as it was", () => {
    open();
    fireEvent.click(pill());
    fireEvent.click(ready());

    expect(
      screen.queryByRole("region", { name: CALC_BREAK_COPY.label }),
    ).toBeNull();
    expect(option().closest("[inert]")).toBeNull();
  });

  it("is one break at a time", () => {
    open();
    fireEvent.click(pill());
    fireEvent.click(pill());

    expect(controlBreak).toHaveBeenCalledTimes(1);
    expect(
      screen.getAllByRole("region", { name: CALC_BREAK_COPY.label }),
    ).toHaveLength(1);
  });

  it("is never counted as time on the section", () => {
    progress.sessionId = null;
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { unmount } = open();

    now = 1_000;
    fireEvent.click(pill());
    now = 31_000;
    fireEvent.click(ready());
    now = 32_000;
    unmount();

    const [timing] = sent("time_on_segment");
    expect(timing).toMatchObject({ segmentId: "calc-1", durationMs: 2_000 });
  });

  it("ends with the lesson, so the sitting is never left paused behind the child", async () => {
    const { unmount } = open();
    fireEvent.click(pill());

    unmount();
    await act(async () => {});

    expect(controlBreak).toHaveBeenLastCalledWith("l-1", SESSION, "return");
  });
});
