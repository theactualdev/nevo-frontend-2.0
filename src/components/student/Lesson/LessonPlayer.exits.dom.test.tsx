import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { LESSON_STATUS } from "@/lib/api/lessons";
import { clearSession, setSession } from "@/lib/auth/session";
import type { Lesson } from "@/lib/types";

/**
 * How a child leaves a lesson, and what they are told on the way out.
 *
 * Each of these was a small lie or a wrong door: "Leave for now" went to
 * Lessons where the IA sends a child Home; the leave dialog and the
 * completion screen said "Your progress is saved" whether or not anything had
 * landed; the completion button had become "Back to home" where the frame
 * says "Back to lessons"; a child who stopped at a module boundary resumed in
 * the module they had finished; "Take a break first" rested in place instead
 * of taking the break; an unknown place was written over the real one; and a
 * review's outcome never reached the scheduler.
 */

const progress = vi.hoisted(() => ({
  report: vi.fn(),
  positionSaved: false,
  completionSaved: false,
  completionFailed: false,
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ sessionId: null, ...progress }),
}));

const { push, trackEvent, recordReview } = vi.hoisted(() => ({
  push: vi.fn(),
  trackEvent: vi.fn(),
  recordReview: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ suggestion: null, breakSuggestion: null }),
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({
  useAssignmentNote: () => null,
}));
vi.mock("@/lib/api/scheduler", () => ({
  schedulerApi: { recordReview: (...a: unknown[]) => recordReview(...a) },
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const segment = (id: string, heading: string, extra = {}) => ({
  id,
  modalities: ["text"] as const,
  text: { heading, body: { default: `Body of ${heading}.` } },
  ...extra,
});

const LESSON = {
  id: "frac-3",
  title: "Fractions Lesson 3",
  segments: [
    segment("seg-1", "Numerators"),
    segment("seg-2", "Denominators"),
    segment("seg-3", "Equivalence"),
  ],
} as unknown as Lesson;

/** Two modules: the boundary sits between seg-2 and seg-3. */
const MODULAR = {
  ...LESSON,
  modules: [
    { id: "m-1", title: "Introduction", segmentIds: ["seg-1", "seg-2"] },
    { id: "m-2", title: "Practice", segmentIds: ["seg-3"] },
  ],
} as unknown as Lesson;

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const writes = () => progress.report.mock.calls;

beforeEach(() => {
  progress.report.mockReset();
  progress.positionSaved = false;
  progress.completionSaved = false;
  progress.completionFailed = false;
  push.mockReset();
  trackEvent.mockReset();
  recordReview.mockReset().mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("leaving part way", () => {
  it("goes Home, where the IA sends 'Leave for now'", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));
    fireEvent.click(screen.getByRole("button", { name: /leave for now/i }));

    expect(push).toHaveBeenCalledWith("/student/dashboard");
  });

  it("does not say progress is saved when the newest place has not landed", () => {
    progress.positionSaved = false;
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));

    expect(screen.queryByText(/progress is saved/i)).toBeNull();
    expect(screen.queryByText(/pick up where you left off/i)).toBeNull();
    // Still a choice the child can make either way.
    expect(screen.getByRole("button", { name: /keep learning/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /leave for now/i })).toBeTruthy();
  });

  it("says so, in the frame's words, once it has", () => {
    progress.positionSaved = true;
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));

    expect(screen.getByText("Your progress is saved")).toBeTruthy();
    expect(screen.getByText("You can pick up where you left off")).toBeTruthy();
  });
});

describe("finishing", () => {
  const finish = () => {
    render(<LessonPlayer lesson={LESSON} plan={null} />);
    next();
    next();
    next();
  };

  it("offers 'Back to lessons', as the frame draws it, and goes there", () => {
    finish();

    fireEvent.click(screen.getByRole("button", { name: "Back to lessons" }));

    expect(push).toHaveBeenCalledWith("/student/lessons");
    expect(screen.queryByRole("button", { name: /back to home/i })).toBeNull();
  });

  it("does not say progress is saved while the completion is in flight", () => {
    finish();

    expect(screen.queryByText(/progress is saved/i)).toBeNull();
  });

  it("says it once the completion has landed", () => {
    progress.completionSaved = true;
    finish();

    expect(screen.getByText("Your progress is saved.")).toBeTruthy();
  });
});

describe("a place that could not be read", () => {
  it("is not written over by the segment the lesson opened on", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} placeUnknown />);

    expect(writes()).toEqual([]);
  });

  it("is written once the child actually moves", () => {
    render(<LessonPlayer lesson={LESSON} plan={null} placeUnknown />);

    next();

    expect(writes().at(-1)).toEqual([
      LESSON_STATUS.IN_PROGRESS,
      { segment: 1 },
    ]);
  });

  it("is still written on open when it was known", () => {
    // Without this, a guard that wrote nothing at all would pass both above.
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    expect(writes()[0]?.[0]).toBe(LESSON_STATUS.IN_PROGRESS);
  });
});

describe("a module boundary", () => {
  const toBoundary = () => {
    render(<LessonPlayer lesson={MODULAR} plan={null} />);
    next();
    next();
    expect(screen.getByText("Section complete")).toBeTruthy();
  };

  it("writes the place it opens onto, so leaving here resumes in the next module", () => {
    toBoundary();

    expect(writes().at(-1)).toEqual([
      LESSON_STATUS.IN_PROGRESS,
      { segment: 2, module: 1 },
    ]);
  });

  it("sends 'Take a break first' to the break module and back into the next module", () => {
    toBoundary();

    fireEvent.click(screen.getByRole("button", { name: "Take a break first" }));

    // The break module, not a rest state on the boundary.
    expect(screen.queryByText("Section complete")).toBeNull();
    expect(screen.queryByText("Take your time")).toBeNull();
    expect(trackEvent).toHaveBeenCalledWith(
      "break_start",
      expect.objectContaining({ trigger: "module_boundary" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /I.m back/i }));

    expect(screen.getByRole("group", { name: /Module 2 of 2/ })).toBeTruthy();
    expect(screen.getByText("Equivalence")).toBeTruthy();
  });
});

describe("a review session's outcome", () => {
  const REVIEW = {
    ...LESSON,
    segments: [
      segment("seg-1", "Numerators", {
        quickCheck: {
          question: "Which number is on top?",
          options: [
            { id: "a", label: "The numerator" },
            { id: "b", label: "The denominator" },
          ],
          correctId: "a",
          correctNote: "Yes.",
          recoveryNote: "Not quite.",
          conceptId: "concept-1",
        },
      }),
      segment("seg-2", "Denominators"),
    ],
  } as unknown as Lesson;

  it("is sent from the inline checks, which are all a review has", async () => {
    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      userId: "stu-1",
      role: "student",
    });
    render(
      <LessonPlayer
        lesson={REVIEW}
        plan={null}
        review
        reviewConceptId="concept-1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /begin|start|ready/i }));

    // Wrong first, then right - recall is judged on the FIRST answer.
    next();
    fireEvent.click(
      await screen.findByRole("button", { name: /The denominator/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: /The numerator/ }));
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
    next();

    await waitFor(() =>
      expect(recordReview).toHaveBeenCalledWith({
        studentId: "stu-1",
        conceptId: "concept-1",
        recallSuccessful: false,
      }),
    );
  });
});
