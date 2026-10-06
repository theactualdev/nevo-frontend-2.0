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
 */

const { trackEvent, flushPendingBaseline, readPendingBaseline } = vi.hoisted(
  () => ({
    trackEvent: vi.fn(),
    flushPendingBaseline: vi.fn(),
    readPendingBaseline: vi.fn(),
  }),
);
vi.mock("@/hooks", () => ({
  useAuth: () => ({ user: { id: "child-sso", method: "sso" } }),
  useSignals: () => ({ trackEvent, flush: vi.fn() }),
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
  ProfilingFlow: ({ onDone }: { onDone: (run: string | null) => void }) => (
    <button type="button" onClick={() => onDone("run-1")}>
      finish the baseline
    </button>
  ),
}));
vi.mock("./TransitionScreen", () => ({
  TransitionScreen: ({ onDone }: { onDone: () => void }) => (
    <button type="button" onClick={onDone}>
      begin
    </button>
  ),
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
