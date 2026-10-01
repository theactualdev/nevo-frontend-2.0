import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ObservedInteractionSequence } from "./ObservedInteractionSequence";

/**
 * AN SSO CHILD'S BASELINE WAS NEVER DELIVERED.
 *
 * Everyone else's parked vector is sent from the PIN step, with the run's own
 * id as proof. An SSO child skips that step, so theirs was parked with no
 * owner and nothing was ever allowed to send it; it expired after seven days.
 * The sequence now parks it under the SSO child's id and flushes it as the run
 * ends. Nobody else gets that: any other "current session" at this point
 * could be the previous child's on a shared tablet.
 */

const auth = vi.hoisted(() => ({
  user: null as null | { id: string; method?: "sso" | "manual" },
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ user: auth.user }),
  useSignals: () => ({ trackEvent: vi.fn(), flush: vi.fn() }),
}));
vi.mock("@/hooks/useNextLessonHref", () => ({
  useNextLessonHref: () => "/student/lessons/x",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { flushPendingBaseline } = vi.hoisted(() => ({
  flushPendingBaseline: vi.fn(async () => true),
}));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ flushPendingBaseline }));

const profiling = vi.hoisted(() => ({ owner: undefined as unknown }));
vi.mock("@/components/student/Profiling/ProfilingFlow", () => ({
  ProfilingFlow: ({
    onDone,
    ownerUserId,
  }: {
    onDone: (run: string | null) => void;
    ownerUserId?: string | null;
  }) => {
    profiling.owner = ownerUserId;
    return (
      <button type="button" onClick={() => onDone("run-1")}>
        finish the baseline
      </button>
    );
  },
}));
vi.mock("./TransitionScreen", () => ({
  TransitionScreen: ({ onDone }: { onDone: () => void }) => (
    <button type="button" onClick={onDone}>
      begin
    </button>
  ),
}));
vi.mock("./LearningNotice", () => ({ LearningNotice: () => <p>notice</p> }));

const finishTheBaseline = () => {
  fireEvent.click(screen.getByText("begin"));
  fireEvent.click(screen.getByText("finish the baseline"));
};

beforeEach(() => {
  flushPendingBaseline.mockClear();
  profiling.owner = undefined;
});

afterEach(() => {
  cleanup();
});

describe("ObservedInteractionSequence — an SSO child's baseline", () => {
  it("is parked under the SSO child's own id", () => {
    auth.user = { id: "child-sso", method: "sso" };
    render(<ObservedInteractionSequence />);

    fireEvent.click(screen.getByText("begin"));

    expect(profiling.owner).toBe("child-sso");
  });

  it("is sent as the run ends, as this run's", () => {
    auth.user = { id: "child-sso", method: "sso" };
    render(<ObservedInteractionSequence />);

    finishTheBaseline();

    expect(flushPendingBaseline).toHaveBeenCalledWith("child-sso", "run-1");
  });

  it("is left to the PIN step for everyone else", () => {
    // A signed-in user without `method: "sso"` may be a session the previous
    // child left behind - the one thing this must never send to.
    auth.user = { id: "someone-earlier" };
    render(<ObservedInteractionSequence />);

    finishTheBaseline();

    expect(profiling.owner).toBeNull();
    expect(flushPendingBaseline).not.toHaveBeenCalled();
  });
});
