import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * Where a teacher's note sits, and what must not happen to it.
 *
 * Design, 23 Sep: *"never rewritten, summarised or adapted."* The player's
 * whole job is adapting text - reading density switches the body, chunking
 * breaks it up - so the load-bearing test here is that the note is untouched
 * by the thing every other word on this screen is subject to.
 */

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock("@/hooks", () => ({
  useBreakMonitor: () => ({ due: false, dismiss: vi.fn() }),
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ sessionId: null, report: vi.fn() }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ suggestion: null, breakSuggestion: null }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));

const { note } = vi.hoisted(() => ({ note: vi.fn() }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: note }));

const NOTE = "Take your time on question 3. We did this on Tuesday.";
const FULL = "One idea here. A second idea here. A third idea here.";
const SHORT = "The short version.";

const LESSON: Lesson = {
  id: "photo-1",
  title: "Photosynthesis",
  segments: [
    {
      id: "seg-1",
      modalities: ["text"],
      text: { heading: "Inside a leaf", body: { default: FULL, simplify: SHORT } },
    },
    {
      id: "seg-2",
      modalities: ["text"],
      text: { heading: "Next", body: { default: FULL } },
    },
  ],
} as unknown as Lesson;

const PLAN: AdaptationPlan = { lessonId: "photo-1", segments: [] };

const noteOnScreen = () => screen.queryByText(NOTE);
const next = () => screen.getByRole("button", { name: /next/i });

beforeEach(() => {
  trackEvent.mockReset();
  note.mockReturnValue({ text: NOTE, author: null });
});

afterEach(() => {
  cleanup();
});

describe("where it sits", () => {
  it("is on the lesson screen when the lesson was set as work", () => {
    render(<LessonPlayer lesson={LESSON} plan={PLAN} assignmentId="a-1" />);

    expect(noteOnScreen()).toBeInTheDocument();
  });

  it("is not there for a lesson opened from the library", () => {
    // No assignment, no note - the truth about it rather than an empty card.
    note.mockReturnValue(null);

    render(<LessonPlayer lesson={LESSON} plan={PLAN} />);

    expect(noteOnScreen()).toBeNull();
  });

  it("appears once, not above every segment", () => {
    /*
     * A note is about the work as a whole. Repeating it on each segment turns
     * a person's message into chrome - read once, then ignored.
     */
    render(<LessonPlayer lesson={LESSON} plan={PLAN} assignmentId="a-1" />);
    expect(noteOnScreen()).toBeInTheDocument();

    fireEvent.click(next());

    expect(noteOnScreen()).toBeNull();
  });
});

describe("what must not happen to it", () => {
  it("is not reshaped when the reading density changes", () => {
    /*
     * THE DECISIVE ONE. Simplify swaps the segment body for a shorter authored
     * version; a teacher's sentence is not a variant of anything, so it has to
     * come through unchanged while the lesson around it does not.
     */
    render(<LessonPlayer lesson={LESSON} plan={PLAN} assignmentId="a-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Simplify" }));

    // The lesson adapted...
    expect(screen.getByText(SHORT)).toBeInTheDocument();
    // ...and the note did not.
    expect(noteOnScreen()).toBeInTheDocument();
  });

  it("is not broken into parts when the child asks for Slower", () => {
    render(<LessonPlayer lesson={LESSON} plan={PLAN} assignmentId="a-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Slower" }));

    expect(noteOnScreen()).toBeInTheDocument();
    expect(noteOnScreen()?.textContent).toBe(NOTE);
  });
});

describe("who it is from", () => {
  it("signs it with the teacher who set the work", () => {
    note.mockReturnValue({ text: NOTE, author: "Ms Adeyemi" });

    render(<LessonPlayer lesson={LESSON} plan={PLAN} assignmentId="a-1" />);

    expect(screen.getByText("— Ms Adeyemi")).toBeInTheDocument();
  });

  it("still shows the words when the name cannot be resolved", () => {
    /*
     * Backend returns null rather than a placeholder for a deleted or unnamed
     * account, on the principle this whole surface was built around. A note
     * without a name is UNSIGNED, never withheld - a person still typed it to
     * this child.
     */
    note.mockReturnValue({ text: NOTE, author: null });

    render(<LessonPlayer lesson={LESSON} plan={PLAN} assignmentId="a-1" />);

    expect(noteOnScreen()).toBeInTheDocument();
    expect(screen.getByText("— Your teacher")).toBeInTheDocument();
  });
});
