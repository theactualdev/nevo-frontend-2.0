import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import type { AdaptationPlan, Lesson } from "@/lib/types";
import {
  declaredKeys,
  offendingCalls,
  requiredKeys,
  undeclaredValues,
} from "@/test/signalCatalogue";

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
/** The break offer pill opens a beat after it mounts. */
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
   * the density chips - and these tests reach them.
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

    expect(screen.queryByText("Want a break?")).toBeNull();
    expect(sent("break_suggested")).toEqual([]);
  });

  it("offers the engine's break in the drawn words, and says it was shown and taken", () => {
    runtime.value = { ...runtime.value, offeredBreak: "movement", forSegmentId: "seg-1" };
    render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();

    expect(screen.getByText("Want a break?")).toBeInTheDocument();
    expect(sent("break_suggested")).toEqual([
      { breakType: "movement", trigger: "engine_offer" },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Take a break" }));
    expect(sent("break_taken")).toEqual([
      { breakType: "movement", trigger: "engine_offer" },
    ]);
    // The break it led to says who asked, start and end.
    expect(sent("break_start")).toEqual([
      { breakType: "movement", trigger: "engine_offer" },
    ]);
    now = 42_000;
    fireEvent.click(screen.getByRole("button", { name: "I'm done" }));
    expect(sent("break_end")).toEqual([
      { breakType: "movement", trigger: "engine_offer", durationMs: 42_000 },
    ]);
  });

  it("says when the child turns it down, which used to leave no trace", () => {
    runtime.value = { ...runtime.value, offeredBreak: "movement", forSegmentId: "seg-1" };
    render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(sent("break_declined")).toEqual([
      { breakType: "movement", trigger: "engine_offer" },
    ]);
    expect(sent("break_taken")).toEqual([]);
    expect(screen.queryByText("Want a break?")).toBeNull();
  });

  it("says nothing was answered when the child moves on past it", () => {
    runtime.value = { ...runtime.value, offeredBreak: "movement", forSegmentId: "seg-1" };
    render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();

    next();

    // No answer is not "Not now" - that is the line the type exists to draw.
    expect(sent("break_declined")).toEqual([]);
  });

  it("names the plan's offer as the plan's, not the engine's", () => {
    const plan: AdaptationPlan = {
      lessonId: "l-1",
      segments: [
        { segmentId: "seg-1", startModality: "text", offerBreak: "movement" },
      ],
    };
    render(<LessonPlayer lesson={THREE} plan={plan} />);
    beat();

    expect(sent("break_suggested")).toEqual([
      { breakType: "movement", trigger: "affect_offer" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(sent("break_declined")).toEqual([
      { breakType: "movement", trigger: "affect_offer" },
    ]);
  });

  it("asks at the foot of the lesson, Not now before Take a break", () => {
    runtime.value = { ...runtime.value, offeredBreak: "movement", forSegmentId: "seg-1" };
    render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();

    const ask = screen.getByText("Want a break?");
    const notNow = screen.getByRole("button", { name: "Not now" });
    const take = screen.getByRole("button", { name: "Take a break" });
    const after = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    // Below the lesson's content, above the chevrons - not under the top bar.
    expect(after(screen.getByText("Body of seg-1."), ask)).toBe(true);
    expect(after(take, screen.getByRole("button", { name: "Next" }))).toBe(true);
    expect(after(notNow, take)).toBe(true);
    // Design dropped every line but the question (frame 38, 6 Oct).
    for (const gone of [
      /short break/i,
      /tricky/i,
      /something different/i,
      /progress is saved/i,
    ]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
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
    expect(screen.getByText("Want a break?")).toBeInTheDocument();
  });

  it("does not carry an answer about the last segment onto this one", () => {
    runtime.value = { ...runtime.value, offeredBreak: "movement", forSegmentId: "seg-0" };
    render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();

    expect(screen.queryByText("Want a break?")).toBeNull();
  });
});

describe("every break event, against the catalogue", () => {
  /*
   * THE CATALOGUE'S KEYS AND NO OTHERS (B37). `break_suggested` and
   * `break_taken` carried `{ segmentId, breakType }` where the catalogue
   * declared `{ trigger }`, `break_start` added the type and the segment, and
   * `break_end` had no `trigger` at all. The type is back since 8 Oct (B89),
   * declared now with its closed set: `micro|movement|consolidation|full`.
   * This walks every break event a lesson can send - offered, turned down,
   * taken, started, ended, and one the plan puts in on the way out - and
   * holds each to exactly what `GET /api/signals/catalogue` says it carries.
   */
  const conforms = (calls: unknown[][]) => {
    for (const [type, payload] of calls) {
      const sentKeys = Object.keys(payload as object);
      const t = String(type);
      expect(sentKeys.filter((k) => !declaredKeys(t)?.has(k)), t).toEqual([]);
      expect(requiredKeys(t).filter((k) => !sentKeys.includes(k)), t).toEqual([]);
      expect(undeclaredValues(t, payload as Record<string, unknown>), t).toEqual([]);
    }
  };
  const breakEvents = () =>
    trackEvent.mock.calls.filter(([t]) => String(t).startsWith("break_"));

  it("sends exactly the declared keys, each of them", () => {
    runtime.value = { ...runtime.value, offeredBreak: "movement", forSegmentId: "seg-1" };
    const { rerender } = render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    next();
    runtime.value = { ...runtime.value, offeredBreak: "full", forSegmentId: "seg-2" };
    rerender(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();
    fireEvent.click(screen.getByRole("button", { name: "Take a break" }));
    fireEvent.click(screen.getByRole("button", { name: "I'm back" }));

    expect(breakEvents().map(([t, p]) => [t, (p as { breakType: string }).breakType])).toEqual([
      ["break_suggested", "movement"],
      ["break_declined", "movement"],
      ["break_suggested", "full"],
      ["break_taken", "full"],
      ["break_start", "full"],
      ["break_end", "full"],
    ]);
    conforms(breakEvents());
  });

  it("names the plan's own break by its type, start and end", () => {
    const plan: AdaptationPlan = {
      lessonId: "l-1",
      segments: [
        { segmentId: "seg-1", startModality: "text", breakAfter: "consolidation" },
      ],
    };
    render(<LessonPlayer lesson={THREE} plan={plan} />);

    next(); // the planned break takes over on the way out
    now = 30_000;
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(sent("break_start")).toEqual([
      { breakType: "consolidation", trigger: "adaptation_plan" },
    ]);
    expect(sent("break_end")).toEqual([
      { breakType: "consolidation", trigger: "adaptation_plan", durationMs: 30_000 },
    ]);
    conforms(breakEvents());
  });
});

describe("the engine's recommendation, now there is no offer (21 Oct)", () => {
  /*
   * SCRUM-271 amended: the separate suggestion pill is gone, and the
   * recommendation is a quiet marker in the format group with nothing to
   * take, turn down or leave. So no `modality_suggestion_*` goes up, the
   * engine is told nothing was offered or declined, and a pick - the
   * child's own - sends no `modality_manual_switch`: the server writes that
   * for a choice it stores (Teslim, 21 Oct).
   */
  const recommends = (segmentId: string): typeof runtime.value => ({
    offeredBreak: null,
    reason: null,
    forSegmentId: segmentId,
    plan: {
      lessonId: "l-1",
      segments: [
        {
          segmentId,
          startModality: "text",
          formats: ["text", "audio"],
          recommendedFormat: "audio",
        },
      ],
    },
  });

  it("sends no offer events, whatever the child does with the marker", () => {
    runtime.value = recommends("seg-1");
    render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();

    fireEvent.click(screen.getByRole("button", { name: "Audio" }));
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    next();

    const types = trackEvent.mock.calls.map(([t]) => t as string);
    expect(types.filter((t) => t.startsWith("modality_suggestion"))).toEqual([]);
    expect(types).not.toContain("modality_manual_switch");
  });

  it("tells the engine nothing was offered and nothing declined", () => {
    runtime.value = recommends("seg-1");
    render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();
    // A pick against the recommendation is not a decline of it.
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    next();

    const state = runtimeArgs.at(-1)![4] as Record<string, unknown>;
    expect(state.sessionDeclineCount).toBe(0);
    expect(state.declinedModalities).toEqual([]);
    expect(state.sameSegmentSuggestionShown).toBe(false);
    expect(state.segmentsSinceLastSuggestion).toBeNull();
  });
});

describe("what became of a switch the child took (B73/B104)", () => {
  /** Picks audio on seg-1 at `at` ms, in the format group. */
  const takeSwitch = (at: number) => {
    const view = render(<LessonPlayer lesson={THREE} plan={null} live />);
    now = at;
    fireEvent.click(screen.getByRole("button", { name: "Audio" }));
    return view;
  };

  it("goes up as the segment switched on is left, with the time measured in the new modality", () => {
    takeSwitch(5_000);
    expect(sent("modality_switch_outcome")).toEqual([]);

    now = 12_000;
    next();

    // From, to, and seven seconds on screen since the switch. No `outcome`
    // and no score: those are judgements of the child (rule 3).
    expect(sent("modality_switch_outcome")).toEqual([
      { segmentId: "seg-1", from: "text", to: "audio", timeOnSegment: 7_000 },
    ]);
  });

  it("goes up once per switch, not on every pass through the segment", () => {
    takeSwitch(5_000);
    now = 12_000;
    next();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    next();

    expect(sent("modality_switch_outcome")).toHaveLength(1);
  });

  it("goes up when the lesson ends on that segment", () => {
    const { unmount } = takeSwitch(2_000);
    now = 3_500;

    unmount();

    expect(sent("modality_switch_outcome")).toEqual([
      { segmentId: "seg-1", from: "text", to: "audio", timeOnSegment: 1_500 },
    ]);
  });

  it("is not sent for a segment the child left in the format it opened in", () => {
    const { unmount } = render(<LessonPlayer lesson={THREE} plan={null} live />);
    // The pill already on screen is no switch.
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    next();
    unmount();

    expect(sent("modality_switch_outcome")).toEqual([]);
  });
});

/*
 * ENGAGEMENT_SIGNAL, ONLY WHAT THE CLIENT SEES AS IT IS (B105, 9 Oct). Three
 * of the six indicators: the page going hidden, how long it stayed hidden,
 * and a move back to an earlier segment. The other three need a baseline or
 * a cutoff this client would have to invent, and are never sent.
 */
describe("engagement_signal (B105)", () => {
  const setVisibility = (state: "hidden" | "visible") => {
    Object.defineProperty(document, "visibilityState", {
      value: state,
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
  };
  afterEach(() => {
    // Back to jsdom's own getter on the prototype.
    delete (document as { visibilityState?: unknown }).visibilityState;
  });

  it("says the page went hidden mid-lesson, and how long for as it comes back", () => {
    render(<LessonPlayer lesson={THREE} plan={null} />);

    now = 10_000;
    setVisibility("hidden");
    expect(sent("engagement_signal")).toEqual([
      { indicator: "task_switch", value: 1 },
    ]);

    now = 52_000;
    setVisibility("visible");
    expect(sent("engagement_signal")).toEqual([
      { indicator: "task_switch", value: 1 },
      { indicator: "return_after_pause", value: 42_000 },
    ]);
  });

  it("says each time it happens, once", () => {
    render(<LessonPlayer lesson={THREE} plan={null} />);

    setVisibility("hidden");
    setVisibility("hidden"); // the same hiding, said twice by the browser
    setVisibility("visible");
    setVisibility("hidden");
    setVisibility("visible");

    expect(sent("engagement_signal").map((e) => e.indicator)).toEqual([
      "task_switch",
      "return_after_pause",
      "task_switch",
      "return_after_pause",
    ]);
  });

  it("says nothing of a return it did not see go", () => {
    render(<LessonPlayer lesson={THREE} plan={null} />);

    setVisibility("visible");

    expect(sent("engagement_signal")).toEqual([]);
  });

  it("says nothing before a review has begun", () => {
    render(<LessonPlayer lesson={THREE} plan={null} review />);

    setVisibility("hidden");
    setVisibility("visible");

    expect(sent("engagement_signal")).toEqual([]);
  });

  it("counts a move back to an earlier segment, and not a move on", () => {
    render(<LessonPlayer lesson={THREE} plan={null} />);

    next();
    next();
    expect(sent("engagement_signal")).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));

    expect(sent("engagement_signal")).toEqual([
      { indicator: "navigation_fragmentation", value: 1 },
    ]);
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
      { segmentId: "seg-1", questionId: "cp-1", source: "checkpoint" },
    ]);
    // The miss is still the player's own reading for the adapt request.
    const state = runtimeArgs.at(-1)![4] as Record<string, unknown>;
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
