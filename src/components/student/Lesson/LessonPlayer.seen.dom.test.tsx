import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * What the engine is told the child actually saw, and did with it - backend's
 * 5 Oct answers.
 *
 * - B45: every `time_on_segment` says which text version was on screen.
 * - B41: `hint_used` when the child moves on with the whole hint on screen,
 *   and never for a hint they closed.
 * - B42: the adaptations the child saw applied, counted where they reach the
 *   screen, with the moment the last one did.
 */

const { trackEvent, signalArgs, runtimeArgs } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  signalArgs: [] as unknown[][],
  runtimeArgs: [] as unknown[][],
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
    return { offeredBreak: null, reason: null, forSegmentId: null, plan: null };
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

const seg = (id: string, body: Record<string, string> = {}) => ({
  id,
  modalities: ["text", "audio"],
  text: { heading: id, body: { default: `Body of ${id}.`, ...body } },
  audio: { title: id, transcript: `Transcript of ${id}.` },
});

const lesson = (...segments: ReturnType<typeof seg>[]): Lesson =>
  ({ id: "l-1", title: "Fractions", segments }) as unknown as Lesson;

const RESHAPED = { simplify: "Short.", expand: "Longer, with more said." };
const TWO = lesson(seg("seg-1", RESHAPED), seg("seg-2", RESHAPED));

const HINT = "Look at the bottom number first.";

const sent = (type: string) =>
  trackEvent.mock.calls
    .filter(([t]) => t === type)
    .map(([, payload]) => payload as Record<string, unknown>);

const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const prev = () =>
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));

beforeEach(() => {
  trackEvent.mockReset();
  signalArgs.length = 0;
  runtimeArgs.length = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("depthShown on time_on_segment (B45)", () => {
  const depths = () => sent("time_on_segment").map((e) => e.depthShown);

  it("is standard on a segment nothing reshaped - every segment says, not only adapted ones", () => {
    render(<LessonPlayer lesson={TWO} plan={null} />);

    next();

    expect(depths()).toEqual(["standard"]);
  });

  it("is the version the child picked, as they left it", () => {
    render(<LessonPlayer lesson={TWO} plan={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Simplify" }));
    next();

    expect(depths()).toEqual(["simplified"]);
  });

  it("is the version the engine's instruction put on screen", () => {
    const plan: AdaptationPlan = {
      lessonId: "l-1",
      segments: [],
      adjustment: "expand",
    };
    render(<LessonPlayer lesson={TWO} plan={plan} />);

    next();

    expect(depths()).toEqual(["expanded"]);
  });

  it("is standard when the segment cannot deliver the instruction", () => {
    const plan: AdaptationPlan = {
      lessonId: "l-1",
      segments: [],
      adjustment: "simplify",
    };
    render(<LessonPlayer lesson={lesson(seg("seg-1"), seg("seg-2"))} plan={plan} />);

    next();

    expect(depths()).toEqual(["standard"]);
  });

  it("is standard in a modality with one version, whatever the instruction", () => {
    const plan: AdaptationPlan = {
      lessonId: "l-1",
      segments: [{ segmentId: "seg-1", startModality: "audio" }],
      adjustment: "simplify",
    };
    render(<LessonPlayer lesson={TWO} plan={plan} />);

    next();

    expect(depths()).toEqual(["standard"]);
  });

  it("belongs to the segment left, not the one arrived at", () => {
    // seg-1 is read standard; seg-2 opens simplified for the engine.
    const plan: AdaptationPlan = {
      lessonId: "l-1",
      segments: [{ segmentId: "seg-1", startModality: "audio" }],
      adjustment: "simplify",
    };
    render(<LessonPlayer lesson={TWO} plan={plan} />);

    next();
    prev();

    expect(sent("time_on_segment")).toMatchObject([
      { segmentId: "seg-1", depthShown: "standard" },
      { segmentId: "seg-2", depthShown: "simplified" },
    ]);
  });
});

describe("hint_used (B41)", () => {
  const hinted: AdaptationPlan = {
    lessonId: "l-1",
    segments: [],
    adjustment: "offer_hint",
    hint: HINT,
  };

  it("is sent when the child moves on with the whole hint on screen", () => {
    render(<LessonPlayer lesson={TWO} plan={hinted} />);

    next();

    expect(sent("hint_offered")).toEqual([{ segmentId: "seg-1" }]);
    expect(sent("hint_used")).toEqual([{ segmentId: "seg-1" }]);
  });

  it("is sent once for that hint, not on every pass through the segment", () => {
    render(<LessonPlayer lesson={TWO} plan={hinted} />);

    next();
    prev();
    next();

    expect(sent("hint_used")).toEqual([{ segmentId: "seg-1" }]);
  });

  it("is not sent for a hint the child closed and then moved past", () => {
    render(<LessonPlayer lesson={TWO} plan={hinted} />);

    fireEvent.click(screen.getByRole("button", { name: "Close hint" }));
    next();

    expect(sent("hint_offered")).toEqual([{ segmentId: "seg-1" }]);
    expect(sent("hint_used")).toEqual([]);
  });

  it("is not sent for going back, which is not moving on", () => {
    // Resumed on seg-2, where the load-time hint belongs.
    render(<LessonPlayer lesson={TWO} plan={hinted} startAt={1} />);
    expect(sent("hint_offered")).toEqual([{ segmentId: "seg-2" }]);

    prev();

    expect(sent("hint_used")).toEqual([]);
  });
});

describe("adaptations the child saw applied (B42)", () => {
  type Applied = { current: { count: number; lastAt: number | null } };
  /** The record the player keeps, as both hooks receive it. */
  const applied = () => {
    const ref = signalArgs.at(-1)![4] as Applied;
    expect(runtimeArgs.at(-1)![5]).toBe(ref);
    return ref.current;
  };
  const instructed = (adjustment: AdaptationPlan["adjustment"]): AdaptationPlan => ({
    lessonId: "l-1",
    segments: [],
    adjustment,
  });
  let now = 0;
  beforeEach(() => {
    now = 4_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
  });

  it("counts the engine's reshape once it is on screen, on the monotonic clock", () => {
    render(<LessonPlayer lesson={TWO} plan={instructed("simplify")} />);

    expect(applied()).toEqual({ count: 1, lastAt: 4_000 });
  });

  it("does not count a standing instruction again on the next segment", () => {
    render(<LessonPlayer lesson={TWO} plan={instructed("simplify")} />);

    now = 9_000;
    next();

    expect(applied()).toEqual({ count: 1, lastAt: 4_000 });
  });

  it("counts an instruction withdrawn and given again", () => {
    const { rerender } = render(
      <LessonPlayer lesson={TWO} plan={instructed("simplify")} />,
    );
    rerender(<LessonPlayer lesson={TWO} plan={instructed(null)} />);
    now = 30_000;
    rerender(<LessonPlayer lesson={TWO} plan={instructed("simplify")} />);

    expect(applied()).toEqual({ count: 2, lastAt: 30_000 });
  });

  it("counts nothing the segment could not show", () => {
    render(
      <LessonPlayer
        lesson={lesson(seg("seg-1"), seg("seg-2"))}
        plan={instructed("simplify")}
      />,
    );

    expect(applied()).toEqual({ count: 0, lastAt: null });
  });

  it("counts nothing while the child's own pick is the version on screen", () => {
    render(<LessonPlayer lesson={TWO} plan={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Simplify" }));

    expect(applied()).toEqual({ count: 0, lastAt: null });
  });

  it("counts a hint once it is on screen, and not again on a re-render", () => {
    const hinted = { ...instructed("offer_hint"), hint: HINT };
    const { rerender } = render(<LessonPlayer lesson={TWO} plan={hinted} />);
    rerender(<LessonPlayer lesson={TWO} plan={hinted} />);

    expect(applied().count).toBe(1);
  });

  it("counts a modality change from an offer the child took, and not the offer", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(
      <LessonPlayer
        lesson={TWO}
        plan={{ lessonId: "l-1", segments: [], suggestModality: "audio" }}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(applied().count).toBe(0);

    now = 7_000;
    fireEvent.click(screen.getByRole("button", { name: "Yes, try it" }));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(applied()).toEqual({ count: 1, lastAt: 7_000 });
  });
});
