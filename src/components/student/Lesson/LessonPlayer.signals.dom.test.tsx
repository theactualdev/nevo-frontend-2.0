import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import type { AdaptationPlan, Lesson } from "@/lib/types";
import { offendingCalls } from "@/test/signalCatalogue";

/**
 * What the player tells the engine, and what it no longer decides for it.
 *
 * Every test here is a signal that was missing, mislabelled or invented: time
 * on a segment that included breaks and the review entry, offers whose fate
 * was never sent, answers sent without the answer, a session that never said
 * how it ended, and a client timer offering breaks the engine had not decided.
 */

const { trackEvent, signalArgs, runtimeArgs, runtime } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  signalArgs: [] as unknown[][],
  runtimeArgs: [] as unknown[][],
  runtime: {
    value: {
      offeredBreak: null,
      reason: null,
      forSegmentId: null,
      plan: null,
    } as {
      offeredBreak: string | null;
      reason: null;
      forSegmentId: string | null;
      plan: AdaptationPlan | null;
    },
  },
}));

vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: (...args: unknown[]) => {
    signalArgs.push(args);
    return { trackEvent };
  },
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: (...args: unknown[]) => {
    runtimeArgs.push(args);
    return runtime.value;
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ sessionId: null, report: vi.fn() }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));

const seg = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  modalities: ["text", "audio"],
  text: { heading: id, body: { default: `Body of ${id}.` } },
  audio: { title: id, transcript: `Transcript of ${id}.` },
  ...extra,
});

const lesson = (...segments: ReturnType<typeof seg>[]): Lesson =>
  ({ id: "l-1", title: "Fractions", segments }) as unknown as Lesson;

const THREE = lesson(seg("seg-1"), seg("seg-2"), seg("seg-3"));

/** Every `trackEvent` of one type, in order. */
const sent = (type: string) =>
  trackEvent.mock.calls
    .filter(([t]) => t === type)
    .map(([, payload]) => payload as Record<string, unknown>);

const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
/** The offer pills open a beat after they mount. */
const beat = () =>
  act(() => {
    vi.advanceTimersByTime(1600);
  });

let now = 0;
beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  trackEvent.mockReset();
  signalArgs.length = 0;
  runtimeArgs.length = 0;
  runtime.value = { offeredBreak: null, reason: null, forSegmentId: null, plan: null };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  /*
   * EVERY PAYLOAD EVERY TEST HERE DROVE OUT OF THE PLAYER, unmount included,
   * held to the keys the catalogue declares. The source scan in
   * `signals.catalogue.test.ts` cannot read a call whose type is a variable -
   * the suggestion outcomes, the density chips - and these tests reach them.
   */
  expect(offendingCalls(trackEvent.mock.calls)).toEqual([]);
});

describe("time on a segment", () => {
  it("does not count a break as time on the segment", () => {
    const plan: AdaptationPlan = {
      lessonId: "l-1",
      segments: [
        { segmentId: "seg-1", startModality: "text", breakAfter: "movement" },
      ],
    };
    render(<LessonPlayer lesson={THREE} plan={plan} />);

    now = 10_000;
    next(); // the planned break takes over
    now = 70_000;
    fireEvent.click(screen.getByRole("button", { name: "I'm done" }));

    const [first] = sent("time_on_segment");
    expect(first?.segmentId).toBe("seg-1");
    // Ten seconds on the segment, not the minute spent stretching after it.
    expect(first?.durationMs).toBe(10_000);
  });

  it("does not count the review entry screen", () => {
    render(<LessonPlayer lesson={THREE} plan={null} review />);

    now = 30_000;
    fireEvent.click(screen.getByRole("button", { name: "Begin review" }));
    now = 35_000;
    next();

    expect(sent("time_on_segment")[0]?.durationMs).toBe(5_000);
  });
});

describe("breaks are the engine's to offer", () => {
  it("offers nothing the engine did not, however long the lesson runs", () => {
    render(<LessonPlayer lesson={THREE} plan={null} live />);

    act(() => {
      vi.advanceTimersByTime(25 * 60_000);
    });

    expect(screen.queryByText("Let's take a short break")).toBeNull();
    expect(sent("break_suggested")).toEqual([]);
  });

  it("offers the engine's break in the drawn words, and says it was shown and taken", () => {
    runtime.value = { ...runtime.value, offeredBreak: "movement", forSegmentId: "seg-1" };
    render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();

    expect(screen.getByText("Let's take a short break")).toBeInTheDocument();
    expect(sent("break_suggested")).toEqual([
      { segmentId: "seg-1", breakType: "movement" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Yes, take a break" }));
    expect(sent("break_taken")).toEqual([
      { segmentId: "seg-1", breakType: "movement" },
    ]);
  });

  it("still offers the engine's next break after one was turned down", () => {
    runtime.value = { ...runtime.value, offeredBreak: "movement", forSegmentId: "seg-1" };
    const { rerender } = render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    next();
    runtime.value = { ...runtime.value, offeredBreak: "micro", forSegmentId: "seg-2" };
    rerender(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();

    // It used to be spent for the rest of the lesson after one offer.
    expect(screen.getByText("Let's take a short break")).toBeInTheDocument();
  });

  it("does not carry an answer about the last segment onto this one", () => {
    runtime.value = { ...runtime.value, offeredBreak: "movement", forSegmentId: "seg-0" };
    render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();

    expect(screen.queryByText("Let's take a short break")).toBeNull();
  });
});

describe("what became of a modality offer", () => {
  const engineSuggests = (segmentId: string): typeof runtime.value => ({
    offeredBreak: null,
    reason: null,
    forSegmentId: segmentId,
    plan: { lessonId: "l-1", segments: [], suggestModality: "audio" },
  });

  it("is sent when shown and when turned down, and the engine is told", () => {
    runtime.value = engineSuggests("seg-1");
    render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();

    expect(sent("modality_suggestion_shown")).toEqual([
      { segmentId: "seg-1", suggested: "audio" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(sent("modality_suggestion_declined")).toEqual([
      { segmentId: "seg-1", suggested: "audio" },
    ]);

    const state = runtimeArgs.at(-1)![3] as Record<string, unknown>;
    expect(state.sessionDeclineCount).toBe(1);
    expect(state.declinedModalities).toEqual(["audio"]);
  });

  it("is sent as ignored when the child moves on past it", () => {
    runtime.value = engineSuggests("seg-1");
    render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();

    next();

    expect(sent("modality_suggestion_ignored")).toEqual([
      { segmentId: "seg-1", suggested: "audio" },
    ]);
  });

  it("does not report one the player held back - the server writes that itself", () => {
    runtime.value = engineSuggests("seg-1");
    const { rerender } = render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    next();

    // The engine suggests again for the very next segment - which the player
    // never offers twice in a row.
    runtime.value = engineSuggests("seg-2");
    rerender(<LessonPlayer lesson={THREE} plan={null} live />);

    // `adaptation_suppressed` is server-written (B37); sending it doubled the
    // engine's count. The offer is still held back - it just isn't reported.
    expect(sent("adaptation_suppressed")).toEqual([]);
    expect(screen.queryByRole("button", { name: "Not now" })).toBeNull();
  });

  it("offers the engine's one load-time suggestion once, not on every other segment", () => {
    const plan: AdaptationPlan = {
      lessonId: "l-1",
      segments: [],
      suggestModality: "audio",
    };
    render(<LessonPlayer lesson={THREE} plan={plan} />);
    beat();
    expect(screen.getByRole("button", { name: "Yes, try it" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    next();
    next(); // seg-3: not consecutive, and the old copy-per-row offered here
    beat();

    expect(screen.queryByRole("button", { name: "Yes, try it" })).toBeNull();
  });
});

describe("an answer, as the engine receives it", () => {
  it("names the segment and the checkpoint, and not the pick or whether it was right", () => {
    /*
     * The catalogue's `{ segmentId, questionId }`. Correctness is decided on
     * the server against the stored answer, and the pick goes up on the
     * attempt it marks - so `correct`, `selectedId` and the rest that rode
     * here were keys the catalogue does not take.
     */
    const withCheck = lesson(
      seg("seg-1", {
        quickCheck: {
          id: "cp-1",
          question: "Which is bigger?",
          options: [
            { id: "a", label: "One half" },
            { id: "b", label: "One third" },
          ],
          correctId: "a",
          correctNote: "Yes.",
          recoveryNote: "Not quite.",
        },
      }),
      seg("seg-2"),
    );
    render(<LessonPlayer lesson={withCheck} plan={null} />);

    next(); // opens the check
    now = 4_000;
    fireEvent.click(screen.getByRole("button", { name: "One third" }));

    expect(sent("comprehension_response")).toEqual([
      { segmentId: "seg-1", questionId: "cp-1" },
    ]);
    // The miss is still the player's own reading for the adapt request.
    const state = runtimeArgs.at(-1)![3] as Record<string, unknown>;
    expect(state.consecutiveErrors).toBe(1);
  });
});

describe("a wait the system owns", () => {
  const withCheck = () =>
    lesson(
      seg("seg-1", {
        quickCheck: {
          id: "cp-1",
          question: "Which is bigger?",
          options: [
            { id: "a", label: "One half" },
            { id: "b", label: "One third" },
          ],
          correctId: "a",
          correctNote: "Yes.",
          recoveryNote: "Not quite.",
        },
      }),
      seg("seg-2"),
    );

  it("goes up once, as it ends, with how long it ran", () => {
    /*
     * The catalogue's `{ reason, durationMs }`. It went up as a start and an
     * end, each `{ reason, phase }` - two events, a key the catalogue does not
     * take, and no length on either.
     */
    render(<LessonPlayer lesson={withCheck()} plan={null} />);
    now = 1_000;
    next(); // the check opens over the player
    expect(sent("system_busy")).toEqual([]);

    now = 3_500;
    fireEvent.click(screen.getByRole("button", { name: "One half" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep going" }));

    expect(sent("system_busy")).toEqual([
      { reason: "blocked_by_modal", durationMs: 2_500 },
    ]);
  });

  it("still goes up when the child leaves the player in the middle of it", () => {
    const { unmount } = render(<LessonPlayer lesson={withCheck()} plan={null} />);
    now = 1_000;
    next();

    now = 1_800;
    unmount();

    expect(sent("system_busy")).toEqual([
      { reason: "blocked_by_modal", durationMs: 800 },
    ]);
  });

  it("goes up for a switch the child left before it finished", () => {
    /*
     * "Yes, try it" opens the switch's window and the switch itself closes
     * it, a beat later. Leaving inside that beat clears the switch, so only
     * the player's own unmount can send the wait - with no length, it would
     * have no way to go up at all.
     */
    runtime.value = {
      offeredBreak: null,
      reason: null,
      forSegmentId: "seg-1",
      plan: { lessonId: "l-1", segments: [], suggestModality: "audio" },
    };
    const { unmount } = render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();
    now = 5_000;
    fireEvent.click(screen.getByRole("button", { name: "Yes, try it" }));

    now = 5_120;
    unmount();

    expect(sent("system_busy")).toEqual([
      { reason: "modality_switch", durationMs: 120 },
    ]);
  });
});

describe("the rest of what the player sends", () => {
  it("says which segment a child tried to leave from, and nothing else", () => {
    render(<LessonPlayer lesson={THREE} plan={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));

    expect(sent("exit_attempt")).toEqual([{ segmentId: "seg-1" }]);
  });

  it("sends the feelings a child picked as the catalogue's `response`", () => {
    const plan: AdaptationPlan = {
      lessonId: "l-1",
      segments: [
        { segmentId: "seg-1", startModality: "text", breakAfter: "consolidation" },
      ],
    };
    render(<LessonPlayer lesson={THREE} plan={plan} />);
    next(); // the planned consolidation break

    fireEvent.click(screen.getByRole("button", { name: "Curious" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(sent("feeling_checkin")).toEqual([{ response: ["Curious"] }]);
  });

  it("never reports the plan's density as the child asking for it", () => {
    /*
     * `simplify_trigger` is "the child asks for the simpler wording". The
     * authored per-segment density went up as one with `source: "system"`
     * on every segment it applied to.
     */
    const plan = {
      lessonId: "l-1",
      segments: [
        { segmentId: "seg-2", startModality: "text", density: "simplify" },
      ],
    } as unknown as AdaptationPlan;
    render(<LessonPlayer lesson={THREE} plan={plan} />);

    next();

    expect(sent("simplify_trigger")).toEqual([]);
  });
});

describe("how the session ended", () => {
  const ending = () => signalArgs.at(-1)![3];

  it("is in progress until it is not", () => {
    render(<LessonPlayer lesson={THREE} plan={null} />);
    expect(ending()).toBeNull();
  });

  it("says a child left, and where from", () => {
    render(<LessonPlayer lesson={THREE} plan={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave for now" }));

    expect(ending()).toEqual({
      completionStatus: "exited",
      exitPosition: "seg-1",
    });
  });

  it("says a finished lesson was completed", () => {
    render(<LessonPlayer lesson={lesson(seg("seg-1"))} plan={null} />);

    next();

    expect(ending()).toEqual({ completionStatus: "completed" });
  });
});

describe("the step up, retired (D28)", () => {
  it("offers nothing and sends nothing, whatever arrives", () => {
    /*
     * Design, 1 Oct: "a control nothing can trigger is not a feature." A
     * stray `increase_difficulty` - which the contract never sends - now
     * resolves to no instruction at all, and no `step_up_*` type leaves.
     */
    runtime.value = {
      ...runtime.value,
      plan: {
        lessonId: "l-1",
        segments: [],
        adjustment: "increase_difficulty",
      } as unknown as AdaptationPlan,
    };
    render(<LessonPlayer lesson={THREE} plan={null} live />);

    expect(screen.queryByText(/something harder/i)).toBeNull();
    expect(
      trackEvent.mock.calls.filter(([t]) => String(t).startsWith("step_up")),
    ).toEqual([]);
  });
});
