import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import type { AdaptationPlan, Lesson } from "@/lib/types";
import catalogue from "@/lib/api/signals.catalogue.json";

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
    expect(sent("break_suggested")).toEqual([{ trigger: "engine_offer" }]);

    fireEvent.click(screen.getByRole("button", { name: "Take a break" }));
    expect(sent("break_taken")).toEqual([{ trigger: "engine_offer" }]);
    // The break it led to says who asked, start and end.
    expect(sent("break_start")).toEqual([{ trigger: "engine_offer" }]);
    now = 42_000;
    fireEvent.click(screen.getByRole("button", { name: "I'm done" }));
    expect(sent("break_end")).toEqual([
      { trigger: "engine_offer", durationMs: 42_000 },
    ]);
  });

  it("says when the child turns it down, which used to leave no trace", () => {
    runtime.value = { ...runtime.value, offeredBreak: "movement", forSegmentId: "seg-1" };
    render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(sent("break_declined")).toEqual([{ trigger: "engine_offer" }]);
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

    expect(sent("break_suggested")).toEqual([{ trigger: "affect_offer" }]);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(sent("break_declined")).toEqual([{ trigger: "affect_offer" }]);
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
   * declares `{ trigger }`, `break_start` added the type and the segment, and
   * `break_end` had no `trigger` at all. This walks every break event a
   * lesson can send - offered, turned down, taken, started, ended - and holds
   * each to exactly what `GET /api/signals/catalogue` says it carries.
   */
  const declared = new Map(
    (catalogue as { eventType: string; payload: string[] }[]).map((e) => [
      e.eventType,
      e.payload,
    ]),
  );

  it("sends exactly the declared keys, each of them", () => {
    runtime.value = { ...runtime.value, offeredBreak: "movement", forSegmentId: "seg-1" };
    const { rerender } = render(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    next();
    runtime.value = { ...runtime.value, offeredBreak: "movement", forSegmentId: "seg-2" };
    rerender(<LessonPlayer lesson={THREE} plan={null} live />);
    beat();
    fireEvent.click(screen.getByRole("button", { name: "Take a break" }));
    fireEvent.click(screen.getByRole("button", { name: "I'm done" }));

    const breakEvents = trackEvent.mock.calls.filter(([t]) =>
      String(t).startsWith("break_"),
    );
    expect(breakEvents.map(([t]) => t)).toEqual([
      "break_suggested",
      "break_declined",
      "break_suggested",
      "break_taken",
      "break_start",
      "break_end",
    ]);
    for (const [type, payload] of breakEvents) {
      // `[key]` in the catalogue is an optional key.
      const keys = declared.get(type) ?? [];
      const required = keys.filter((k) => !k.startsWith("["));
      const allowed = keys.map((k) => k.replace(/^\[|\]$/g, ""));
      const sentKeys = Object.keys(payload as object);
      expect(sentKeys.filter((k) => !allowed.includes(k)), type).toEqual([]);
      expect(required.filter((k) => !sentKeys.includes(k)), type).toEqual([]);
    }
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
  it("carries the checkpoint, the pick and how long it took", () => {
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
      {
        kind: "quick_check",
        segmentId: "seg-1",
        checkpointId: "cp-1",
        correct: false,
        selectedId: "b",
        responseTimeMs: 4_000,
      },
    ]);
    const state = runtimeArgs.at(-1)![3] as Record<string, unknown>;
    expect(state.consecutiveErrors).toBe(1);
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
