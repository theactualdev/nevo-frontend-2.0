import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { ADJUSTMENT_ACTIONS } from "@/lib/constants";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * The support the engine offers mid-segment, as of design's and backend's
 * 1 Oct answers.
 *
 * - D29: the hint can be closed, with a control that says so.
 * - B20: the engine hears that a hint or a guided prompt was on screen.
 * - B19: a guided prompt can be answered - the option, never the words - and
 *   the answer route, not the player, puts it on the signal stream.
 * - B12/D26: a picture that would not load is told to the engine.
 * - D25: the engine's density is spacing, set on the way into a segment.
 */

const { trackEvent, answer, runtime } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  answer: vi.fn(),
  runtime: {
    value: {
      offeredBreak: null,
      reason: null,
      forSegmentId: null,
      plan: null,
    } as {
      offeredBreak: null;
      reason: null;
      forSegmentId: string | null;
      plan: AdaptationPlan | null;
    },
  },
}));

vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => runtime.value,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({
    sessionId: "33333333-3333-4333-8333-333333333333",
    report: vi.fn(),
  }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    getSession: () => ({ userId: "44444444-4444-4444-8444-444444444444" }),
  };
});
vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: { ...actual.intelligenceApi, answerGuidedQuestion: answer },
  };
});

const seg = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  modalities: ["text"],
  text: { heading: `Heading ${id}`, body: { default: `Body of ${id}.` } },
  ...extra,
});

const lesson = (...segments: ReturnType<typeof seg>[]): Lesson =>
  ({ id: "l-1", title: "Photosynthesis", segments }) as unknown as Lesson;

const TWO = lesson(seg("seg-1"), seg("seg-2"));

const HINT = "Start with where the light lands: the leaf.";

const sent = (type: string) =>
  trackEvent.mock.calls
    .filter(([t]) => t === type)
    .map(([, payload]) => payload as Record<string, unknown>);

const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const prev = () =>
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));

beforeEach(() => {
  trackEvent.mockReset();
  answer.mockReset();
  answer.mockResolvedValue({ recorded: true, promptId: "p-1" });
  runtime.value = { offeredBreak: null, reason: null, forSegmentId: null, plan: null };
});

afterEach(() => {
  cleanup();
});

// ── D29 ────────────────────────────────────────────────────────────────────

describe("the hint card, closed by the child", () => {
  const hinted = (): AdaptationPlan => ({
    lessonId: "l-1",
    segments: [],
    adjustment: ADJUSTMENT_ACTIONS.OFFER_HINT,
    hint: HINT,
  });

  it("has a labelled control, 44px and a pointer, not a faint X", () => {
    render(<LessonPlayer lesson={TWO} plan={hinted()} />);

    const close = screen.getByRole("button", { name: "Close hint" });
    expect(close.textContent).toBe("Close");
    expect(close.className).toMatch(/\bh-11\b/);
    expect(close.className).toMatch(/\bcursor-pointer\b/);
  });

  it("hides the hint for that segment, and keeps it hidden on a return", () => {
    const plan: AdaptationPlan = {
      lessonId: "l-1",
      segments: [
        { segmentId: "seg-1", startModality: "text", adjustment: "offer_hint", hint: HINT },
      ],
    };
    render(<LessonPlayer lesson={TWO} plan={plan} />);

    fireEvent.click(screen.getByRole("button", { name: "Close hint" }));
    expect(screen.queryByText(HINT)).toBeNull();

    next();
    prev();

    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("stops guiding the forward chevron once it is closed", () => {
    render(<LessonPlayer lesson={TWO} plan={hinted()} />);
    expect(screen.getByRole("button", { name: "Next" }).className).toMatch(
      /glow-guide/,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close hint" }));

    expect(screen.getByRole("button", { name: "Next" }).className).not.toMatch(
      /glow-guide/,
    );
  });
});

// ── B20 ────────────────────────────────────────────────────────────────────

describe("hint_offered", () => {
  it("is sent once when the hint is on screen", () => {
    const { rerender } = render(
      <LessonPlayer
        lesson={TWO}
        plan={{ lessonId: "l-1", segments: [], adjustment: "offer_hint", hint: HINT }}
      />,
    );
    rerender(
      <LessonPlayer
        lesson={TWO}
        plan={{ lessonId: "l-1", segments: [], adjustment: "offer_hint", hint: HINT }}
      />,
    );

    expect(sent("hint_offered")).toEqual([{ segmentId: "seg-1" }]);
  });

  it("is not sent for an instruction with no hint to show", () => {
    render(
      <LessonPlayer
        lesson={TWO}
        plan={{ lessonId: "l-1", segments: [], adjustment: "offer_hint" }}
      />,
    );

    expect(sent("hint_offered")).toEqual([]);
  });

  it("is never paired with a hint_used the child did not do", () => {
    render(
      <LessonPlayer
        lesson={TWO}
        plan={{ lessonId: "l-1", segments: [], adjustment: "offer_hint", hint: HINT }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close hint" }));

    expect(sent("hint_used")).toEqual([]);
  });
});

// ── B19 / B20 ──────────────────────────────────────────────────────────────

describe("guided prompts", () => {
  const PROMPTS = [
    { id: "p-1", prompt: "Where does the plant get its energy?", options: ["The sun", "The soil"] },
    { id: "p-2", prompt: "What does the leaf do with it?" },
  ];
  const panel = (extra: Partial<AdaptationPlan> = {}): AdaptationPlan => ({
    lessonId: "l-1",
    segments: [],
    adjustment: ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL,
    guidedPrompts: PROMPTS,
    ...extra,
  });
  const openPanel = () =>
    fireEvent.click(screen.getByRole("button", { name: "Which part is unclear?" }));

  it("are shown instead of the bare questions when both arrive", () => {
    render(
      <LessonPlayer
        lesson={TWO}
        plan={panel({ guidedQuestions: ["A bare question?"] })}
        live
      />,
    );
    openPanel();

    expect(screen.getByText(PROMPTS[0].prompt)).toBeInTheDocument();
    expect(screen.queryByText("A bare question?")).toBeNull();
  });

  it("say they were shown, once each, when the panel opens", () => {
    render(<LessonPlayer lesson={TWO} plan={panel()} live />);
    expect(sent("guided_question_shown")).toEqual([]);

    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    openPanel();

    expect(sent("guided_question_shown")).toEqual([
      { segmentId: "seg-1", promptId: "p-1" },
      { segmentId: "seg-1", promptId: "p-2" },
    ]);
  });

  it("send the option picked, and no words, to the answer route", async () => {
    render(<LessonPlayer lesson={TWO} plan={panel()} live />);
    openPanel();

    fireEvent.click(screen.getByRole("button", { name: PROMPTS[0].prompt }));
    fireEvent.click(screen.getByRole("button", { name: "The sun" }));
    await act(async () => {});

    expect(answer).toHaveBeenCalledTimes(1);
    expect(answer).toHaveBeenCalledWith({
      studentId: "44444444-4444-4444-8444-444444444444",
      sessionId: "33333333-3333-4333-8333-333333333333",
      promptId: "p-1",
      option: "The sun",
      outcome: "moved_on",
    });
    // The route puts the answer on the stream; sending it here as well
    // would be one reply read twice.
    expect(sent("guided_question_answered")).toEqual([]);
  });

  it("say a prompt was left when the panel closes on it unanswered", () => {
    render(<LessonPlayer lesson={TWO} plan={panel()} live />);
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: PROMPTS[0].prompt }));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(answer).toHaveBeenCalledTimes(1);
    expect(answer.mock.calls[0][0]).toMatchObject({
      promptId: "p-1",
      outcome: "abandoned",
    });
    expect(answer.mock.calls[0][0]).not.toHaveProperty("option");
  });

  it("say nothing about a prompt the child never opened", () => {
    render(<LessonPlayer lesson={TWO} plan={panel()} live />);
    openPanel();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(answer).not.toHaveBeenCalled();
  });

  it("leave a prompt without options as a question, not a dead control", () => {
    // 37b draws no field to answer in, so none is invented.
    render(<LessonPlayer lesson={TWO} plan={panel()} live />);
    openPanel();

    expect(screen.queryByRole("button", { name: PROMPTS[1].prompt })).toBeNull();
    expect(screen.getByText(PROMPTS[1].prompt)).toBeInTheDocument();
    expect(document.querySelector("textarea, input")).toBeNull();
  });

  it("send nothing from a demo lesson", () => {
    render(<LessonPlayer lesson={TWO} plan={panel()} />);
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: PROMPTS[0].prompt }));
    fireEvent.click(screen.getByRole("button", { name: "The sun" }));

    expect(answer).not.toHaveBeenCalled();
  });
});

// ── B12 ────────────────────────────────────────────────────────────────────

describe("a picture that would not load", () => {
  it("is sent as media_load_failed, in the contract's three fields", () => {
    const pictured = lesson(
      seg("seg-1", {
        modalities: ["visual"],
        text: undefined,
        visual: {
          heading: "The leaf",
          illustration: { src: "https://cdn.example/leaf.png", alt: "A leaf" },
        },
      }),
    );
    render(<LessonPlayer lesson={pictured} plan={null} />);

    fireEvent.error(screen.getByRole("img", { name: "A leaf" }));

    expect(sent("media_load_failed")).toEqual([
      { segmentId: "seg-1", channel: "image", reason: "load_error" },
    ]);
  });
});

// ── D25 ────────────────────────────────────────────────────────────────────

describe("the engine's density level", () => {
  const group = () => screen.getByRole("group", { name: /segment/i });
  const spaced = (densityLevel: "low" | "high"): AdaptationPlan => ({
    lessonId: "l-1",
    segments: [
      { segmentId: "seg-1", startModality: "text", densityLevel },
      { segmentId: "seg-2", startModality: "text" },
    ],
  });

  it("is spacing on the segment, and never words", () => {
    render(<LessonPlayer lesson={TWO} plan={spaced("low")} />);

    expect(group().className).toMatch(/\[&_article>\*\+\*\]:mt-8/);
    expect(document.body.textContent).not.toMatch(/\b(low|density)\b/i);
  });

  it("is the segment as drawn when the engine gave none", () => {
    render(<LessonPlayer lesson={TWO} plan={spaced("high")} />);

    next();

    expect(group().className).not.toMatch(/article/);
  });

  it("waits for the next segment rather than shifting under the child", () => {
    const { rerender } = render(<LessonPlayer lesson={TWO} plan={null} live />);
    expect(group().className).not.toMatch(/article/);

    // The mid-lesson answer lands after the segment has drawn.
    runtime.value = {
      ...runtime.value,
      forSegmentId: "seg-1",
      plan: {
        lessonId: "l-1",
        segments: [
          { segmentId: "seg-1", startModality: "text", densityLevel: "low" },
          { segmentId: "seg-2", startModality: "text", densityLevel: "high" },
        ],
      },
    };
    rerender(<LessonPlayer lesson={TWO} plan={null} live />);
    expect(group().className).not.toMatch(/article/);

    next();

    expect(group().className).toMatch(/\[&_article>\*\+\*\]:mt-3/);
  });
});
