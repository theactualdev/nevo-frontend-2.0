import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import {
  READING_PAUSE_END,
  READING_PAUSE_QUESTIONS,
} from "./ReadingPauseScreen";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * 17E'S PAUSE, AS ITS OWN SCREEN, WHEREVER THE SERVER MARKS IT (Hub, 24 Nov,
 * on the on-screen QA; 17e's kept Candidate B: "the one real pause sits at
 * its end"). Under the attention accommodation the reading goes by the
 * server's groups, and a group marked `pauseAfter` is followed by the pause:
 * between groups from "Tap to continue", and after the last one from Next,
 * before the check or the next part. Its words are the frame's, only where
 * they are true: "End of the reading" at the end alone, and "Ready for the
 * questions, or take a break first?" only when a check comes next.
 */

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock("@/hooks", () => ({
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

const THREE = "One idea here. A second idea here. A third idea here.";
const CHUNKS = [
  { id: "c1", text: "One idea here." },
  { id: "c2", text: "A second idea here." },
  { id: "c3", text: "A third idea here." },
];
const TWO_GROUPS = [
  { id: "g1", chunkIds: ["c1", "c2"], pauseAfter: true },
  { id: "g2", chunkIds: ["c3"], pauseAfter: true },
];
const QUESTION = "Which idea came first?";

const segment = (
  id: string,
  heading: string,
  over: { groups?: typeof TWO_GROUPS; check?: boolean } = {},
) => ({
  id,
  modalities: ["text"] as const,
  text: {
    heading,
    body: { default: THREE },
    readingChunks: CHUNKS,
    readingGroups: over.groups ?? TWO_GROUPS,
  },
  ...(over.check
    ? {
        quickCheck: {
          question: QUESTION,
          options: [
            { id: "a", label: "The first" },
            { id: "b", label: "The second" },
          ],
          correctId: "a",
          correctNote: "Yes.",
          recoveryNote: "Not quite.",
        },
      }
    : {}),
});

const lessonOf = (...segments: ReturnType<typeof segment>[]) =>
  ({ id: "frac-3", title: "Fractions Lesson 3", segments }) as unknown as Lesson;

const ATTENTION: AdaptationPlan = {
  lessonId: "frac-3",
  segments: [],
  accommodations: { attention: true },
};

const pauseHeading = () =>
  screen.queryByRole("heading", { name: "A good place to pause" });
const tapOn = () =>
  fireEvent.click(screen.getByRole("button", { name: "Tap to continue" }));
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const keepGoing = () =>
  fireEvent.click(screen.getByRole("button", { name: "Keep going" }));

beforeEach(() => trackEvent.mockReset());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the pause between groups", () => {
  it("is its own screen, with only the heading and its two ways on", () => {
    render(<LessonPlayer lesson={lessonOf(segment("s1", "Numerators"), segment("s2", "Denominators"))} plan={ATTENTION} />);
    tapOn();

    expect(pauseHeading()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep going" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Take a break" })).toBeInTheDocument();
    // Nothing of the lesson around it, as 17e's pp() draws it.
    expect(screen.queryByRole("heading", { name: "Numerators" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Exit lesson" })).toBeNull();
    // Neither of the end's lines: this is not the end of the reading.
    expect(screen.queryByText(READING_PAUSE_END)).toBeNull();
    expect(screen.queryByText(READING_PAUSE_QUESTIONS)).toBeNull();
  });

  it("goes back to the reading on Keep going, at the next group", () => {
    render(<LessonPlayer lesson={lessonOf(segment("s1", "Numerators"), segment("s2", "Denominators"))} plan={ATTENTION} />);
    tapOn();
    keepGoing();

    expect(pauseHeading()).toBeNull();
    expect(screen.getByRole("heading", { name: "Numerators" })).toBeInTheDocument();
    expect(screen.getByText("A third idea here.")).toBeInTheDocument();
    expect(screen.queryByText("One idea here.")).toBeNull();
  });
});

describe("the pause at the end of the reading", () => {
  it("comes on Next before the check, with the eyebrow and the questions line", () => {
    render(<LessonPlayer lesson={lessonOf(segment("s1", "Numerators", { check: true }), segment("s2", "Denominators"))} plan={ATTENTION} />);
    tapOn();
    keepGoing();
    next();

    expect(pauseHeading()).toBeInTheDocument();
    expect(screen.getByText(READING_PAUSE_END)).toBeInTheDocument();
    expect(screen.getByText(READING_PAUSE_QUESTIONS)).toBeInTheDocument();
    expect(screen.queryByText(QUESTION)).toBeNull();

    keepGoing();

    expect(screen.getByText(QUESTION)).toBeInTheDocument();
  });

  it("says nothing of questions where the next part, not a check, follows", () => {
    render(<LessonPlayer lesson={lessonOf(segment("s1", "Numerators"), segment("s2", "Denominators"))} plan={ATTENTION} />);
    tapOn();
    keepGoing();
    next();

    expect(screen.getByText(READING_PAUSE_END)).toBeInTheDocument();
    expect(screen.queryByText(READING_PAUSE_QUESTIONS)).toBeNull();

    keepGoing();

    expect(screen.getByRole("heading", { name: "Denominators" })).toBeInTheDocument();
  });

  it("comes after a reading that is one group, too", () => {
    const ONE = [{ id: "g1", chunkIds: ["c1", "c2", "c3"], pauseAfter: true }];
    render(<LessonPlayer lesson={lessonOf(segment("s1", "Numerators", { groups: ONE }), segment("s2", "Denominators"))} plan={ATTENTION} />);
    next();

    expect(pauseHeading()).toBeInTheDocument();
    expect(screen.getByText(READING_PAUSE_END)).toBeInTheDocument();
  });

  it("is not there where the server did not mark the last group", () => {
    const UNMARKED = [
      { id: "g1", chunkIds: ["c1", "c2"], pauseAfter: false },
      { id: "g2", chunkIds: ["c3"], pauseAfter: false },
    ];
    render(<LessonPlayer lesson={lessonOf(segment("s1", "Numerators", { groups: UNMARKED }), segment("s2", "Denominators"))} plan={ATTENTION} />);
    tapOn();
    next();

    expect(pauseHeading()).toBeNull();
    expect(screen.getByRole("heading", { name: "Denominators" })).toBeInTheDocument();
  });

  it("goes on to the check after a break taken from it", () => {
    vi.useFakeTimers();
    render(<LessonPlayer lesson={lessonOf(segment("s1", "Numerators", { check: true }), segment("s2", "Denominators"))} plan={ATTENTION} />);
    tapOn();
    keepGoing();
    next();
    // From the pause, not the check sheet's own Take a break.
    expect(screen.getByText(READING_PAUSE_QUESTIONS)).toBeInTheDocument();
    expect(screen.queryByText(QUESTION)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Take a break" }));

    expect(screen.getByText("Take a breath")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(screen.getByText(QUESTION)).toBeInTheDocument();
    expect(pauseHeading()).toBeNull();
  });

  it("comes once a part: tapped out of the check, Next goes on with no second pause", () => {
    render(<LessonPlayer lesson={lessonOf(segment("s1", "Numerators", { check: true }), segment("s2", "Denominators"))} plan={ATTENTION} />);
    tapOn();
    keepGoing();
    next();
    keepGoing();
    expect(screen.getByText(QUESTION)).toBeInTheDocument();

    // The tap out (Olayinka, 23 Oct): the sheet let go, back on the part.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText(QUESTION)).toBeNull();
    next();

    // A check that does not hold, once asked, gives way to the next part.
    expect(pauseHeading()).toBeNull();
    expect(screen.getByRole("heading", { name: "Denominators" })).toBeInTheDocument();
  });
});

/*
 * FOR EVERY CHILD THE ENGINE ASKS IT FOR (Hub, 24 Nov, rule 5): backend
 * 3877924's `delivery_snapshot` sets the pause for the attention accommodation
 * and for a sitting at lower depth (More support), with or without it. The
 * pause was ours to gate on attention; it is the server's to ask.
 */
describe("a child without the accommodation", () => {
  const NO_ATTENTION: AdaptationPlan = { ...ATTENTION, accommodations: { attention: false } };

  it("gets the pause wherever the server marks a group", () => {
    render(<LessonPlayer lesson={lessonOf(segment("s1", "Numerators"), segment("s2", "Denominators"))} plan={NO_ATTENTION} />);

    // Read by the server's groups, with no Next while one is left unread.
    expect(screen.queryByText("A third idea here.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    tapOn();

    expect(pauseHeading()).toBeInTheDocument();
    keepGoing();
    expect(screen.getByText("A third idea here.")).toBeInTheDocument();
    next();

    expect(pauseHeading()).toBeInTheDocument();
    expect(screen.getByText(READING_PAUSE_END)).toBeInTheDocument();
  });

  it("reads the passage whole and goes on at Next where no group is marked", () => {
    const UNMARKED = [
      { id: "g1", chunkIds: ["c1", "c2"], pauseAfter: false },
      { id: "g2", chunkIds: ["c3"], pauseAfter: false },
    ];
    render(<LessonPlayer lesson={lessonOf(segment("s1", "Numerators", { groups: UNMARKED }), segment("s2", "Denominators"))} plan={NO_ATTENTION} />);

    expect(screen.getByText("A third idea here.")).toBeInTheDocument();
    next();

    expect(pauseHeading()).toBeNull();
    expect(screen.getByRole("heading", { name: "Denominators" })).toBeInTheDocument();
  });
});
