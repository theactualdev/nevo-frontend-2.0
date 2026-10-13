import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ObservedInteractionSequence } from "./ObservedInteractionSequence";

/**
 * `baseline_submitted` SAYS THE BASELINE WAS SUBMITTED, SO IT WAITS FOR THAT.
 *
 * It fired when the vector was parked, which is several screens - and an
 * account - before anything is sent. Since 1 Oct the event reaches the engine,
 * so a submit that later failed, or never came, left the engine told
 * otherwise. Now it is tracked only once the submit has succeeded for this
 * run's vector, and not at all if the stream that owns it has gone.
 *
 * Walked on the SSO path, which delivers as the run ends; the PIN-step paths
 * go through the same delivery.
 *
 * AND IT GOES ON THE `profiling` STREAM (B43, 5 Oct), with the run's module
 * markers: the baseline is the assessment, not the account coming into
 * existence. Each stream is its own mock here, so a marker on the wrong one
 * shows.
 */

const {
  trackEvent,
  onboardingTrack,
  streams,
  flushPendingBaseline,
  readPendingBaseline,
  flowProps,
  entryProps,
} = vi.hoisted(() => ({
  /** The `profiling` stream's. */
  trackEvent: vi.fn(),
  onboardingTrack: vi.fn(),
  /** Every `useSignals` call, as `[sessionId, sessionType]`. */
  streams: [] as [string | null, string | undefined][],
  flushPendingBaseline: vi.fn(),
  readPendingBaseline: vi.fn(),
  flowProps: { current: null as Record<string, unknown> | null },
  entryProps: { current: null as Record<string, unknown> | null },
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ user: { id: "child-sso", method: "sso" } }),
  useSignals: (sessionId: string | null, _lesson?: string, type?: string) => {
    streams.push([sessionId, type]);
    return {
      trackEvent: type === "profiling" ? trackEvent : onboardingTrack,
      flush: vi.fn(),
    };
  },
}));
vi.mock("@/hooks/useNextLessonHref", () => ({
  useNextLessonHref: () => "/student/lessons/x",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/profiling/pendingBaseline", () => ({
  flushPendingBaseline,
  readPendingBaseline,
}));
vi.mock("@/components/student/Profiling/ProfilingFlow", () => ({
  ProfilingFlow: (props: { onDone: (run: string | null) => void }) => {
    flowProps.current = props;
    return (
      <button type="button" onClick={() => props.onDone("run-1")}>
        finish the baseline
      </button>
    );
  },
}));
vi.mock("./TransitionScreen", () => ({
  TransitionScreen: (props: { onDone: () => void }) => {
    entryProps.current = props;
    return (
      <button type="button" onClick={props.onDone}>
        begin
      </button>
    );
  },
}));
vi.mock("./LearningNotice", () => ({ LearningNotice: () => <p>notice</p> }));

const parkedBy = (sessionId: string) => ({
  sessionId,
  trials: [{ dimension: "wmc" }],
  capturedAt: 0,
  ownerUserId: "child-sso",
});
const submittedEvents = () =>
  trackEvent.mock.calls.filter(([type]) => type === "baseline_submitted");
const finishTheBaseline = async () => {
  fireEvent.click(screen.getByText("begin"));
  fireEvent.click(screen.getByText("finish the baseline"));
  await act(async () => {});
};

beforeEach(() => {
  trackEvent.mockReset();
  onboardingTrack.mockReset();
  streams.length = 0;
  flowProps.current = null;
  entryProps.current = null;
  flushPendingBaseline.mockReset();
  readPendingBaseline.mockReset();
  readPendingBaseline.mockReturnValue(parkedBy("run-1"));
});

afterEach(() => {
  cleanup();
});

describe("baseline_submitted", () => {
  it("is tracked once this run's vector has been submitted", async () => {
    flushPendingBaseline.mockResolvedValue(true);
    render(<ObservedInteractionSequence />);

    await finishTheBaseline();

    // No payload: the catalogue declares none, and the module list it
    // carried came from the feature vector, which is gone.
    expect(submittedEvents()).toEqual([["baseline_submitted"]]);
  });

  it("goes on the profiling stream, not the onboarding one (B43)", async () => {
    flushPendingBaseline.mockResolvedValue(true);
    render(<ObservedInteractionSequence />);

    await finishTheBaseline();

    expect(submittedEvents()).toHaveLength(1);
    expect(
      onboardingTrack.mock.calls.map(([type]) => type),
    ).not.toContain("baseline_submitted");
  });

  it("is not tracked while the submit is still on its way", async () => {
    flushPendingBaseline.mockReturnValue(new Promise(() => {}));
    render(<ObservedInteractionSequence />);

    await finishTheBaseline();

    expect(submittedEvents()).toHaveLength(0);
  });

  it("is not tracked when the submit fails", async () => {
    flushPendingBaseline.mockResolvedValue(false);
    render(<ObservedInteractionSequence />);

    await finishTheBaseline();

    expect(submittedEvents()).toHaveLength(0);
  });

  it("is not tracked for a vector some other run parked", async () => {
    flushPendingBaseline.mockResolvedValue(true);
    readPendingBaseline.mockReturnValue(parkedBy("an-earlier-run"));
    render(<ObservedInteractionSequence />);

    await finishTheBaseline();

    expect(submittedEvents()).toHaveLength(0);
  });

  it("is not tracked once the stream that owns it has gone", async () => {
    let land: (ok: boolean) => void = () => {};
    flushPendingBaseline.mockReturnValue(
      new Promise<boolean>((r) => {
        land = r;
      }),
    );
    const { unmount } = render(<ObservedInteractionSequence />);
    await finishTheBaseline();

    unmount();
    await act(async () => land(true));

    expect(submittedEvents()).toHaveLength(0);
  });
});

describe("the baseline's own stream (B43)", () => {
  it("is a profiling stream, beside the onboarding one", () => {
    render(<ObservedInteractionSequence />);

    const types = new Set(streams.map(([, type]) => type));
    expect(types).toEqual(new Set(["onboarding", "profiling"]));
    const ids = new Map(streams.map(([id, type]) => [type, id]));
    expect(ids.get("profiling")).not.toBe(ids.get("onboarding"));
  });

  it("is the one the run's module markers are handed, under the run's own id", () => {
    render(<ObservedInteractionSequence />);
    fireEvent.click(screen.getByText("begin"));

    const profilingId = streams.find(([, type]) => type === "profiling")?.[0];
    expect(flowProps.current?.track).toBe(trackEvent);
    expect(flowProps.current?.runId).toBe(profilingId);
  });

  it("leaves entry on the onboarding stream", () => {
    // The transition is the account coming into existence, not a measure.
    render(<ObservedInteractionSequence />);

    expect(entryProps.current?.track).toBe(onboardingTrack);
  });
});
