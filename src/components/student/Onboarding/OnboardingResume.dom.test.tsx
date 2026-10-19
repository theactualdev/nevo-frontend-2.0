import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { OnboardingResume } from "./OnboardingResume";
import { ApiError } from "@/lib/api/client";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * Finishing onboarding for a child who already has an account, as Lydia ruled
 * 17 Oct (SCRUM-244): all four modules before any lesson. The server's
 * readiness says what is left and nothing is inferred here - a child with the
 * three done goes straight to Module 4, a child with all four goes Home.
 */

const { replace, readiness, flushPendingBaseline, trackEvent, flush } =
  vi.hoisted(() => ({
    replace: vi.fn(),
    readiness: vi.fn(),
    flushPendingBaseline: vi.fn(),
    trackEvent: vi.fn(),
    flush: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useSignals: () => ({ trackEvent, flush }),
}));
vi.mock("@/lib/api/probe", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/probe")>()),
  probeApi: { readiness },
}));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ flushPendingBaseline }));
vi.mock("@/components/student/Profiling/ProfilingFlow", () => ({
  ProfilingFlow: ({
    onDone,
    ownerUserId,
  }: {
    onDone: (run: string | null) => void;
    ownerUserId?: string | null;
  }) => (
    <button data-owner={ownerUserId ?? ""} onClick={() => onDone("run-r")}>
      after profiling
    </button>
  ),
}));
vi.mock("@/components/student/Profiling/DomainProbeModule", () => ({
  DomainProbeStep: ({
    onDone,
    stretchFirst,
  }: {
    onDone: (outcome: "sat" | "absent") => void;
    stretchFirst: boolean;
  }) => (
    <div data-testid="module-four" data-stretch-first={String(stretchFirst)}>
      <button onClick={() => onDone("sat")}>after probe</button>
      <button onClick={() => onDone("absent")}>nothing to probe</button>
    </div>
  ),
}));

const HOME = "/student/dashboard";

function ready(done: Record<string, boolean>) {
  const modules = ["grid_span", "pattern_flanker", "sentence_dot", "domain_probe"].map(
    (id) => ({ id, completed: done[id] ?? false }),
  );
  return {
    complete: modules.every((m) => m.completed),
    modules,
    subjects: [],
    nextModule: modules.find((m) => !m.completed)?.id ?? null,
  };
}
const THREE_DONE = ready({ grid_span: true, pattern_flanker: true, sentence_dot: true });
const ALL_DONE = ready({
  grid_span: true,
  pattern_flanker: true,
  sentence_dot: true,
  domain_probe: true,
});

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok-child",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });
  flushPendingBaseline.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  clearSession();
  vi.clearAllMocks();
});

describe("where the server's answer starts a child", () => {
  it("sends a child with all four done Home, and asks nothing", async () => {
    readiness.mockResolvedValue(ALL_DONE);
    render(<OnboardingResume />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    expect(screen.queryByTestId("module-four")).toBeNull();
    expect(screen.queryByRole("button", { name: "after profiling" })).toBeNull();
  });

  it("takes a child with the three done straight to Module 4, then Home", async () => {
    readiness.mockResolvedValue(THREE_DONE);
    render(<OnboardingResume />);

    const four = await screen.findByTestId("module-four");
    expect(screen.queryByRole("button", { name: "after profiling" })).toBeNull();
    // Straight in: they have not just finished a module, so no stretch.
    expect(four).toHaveAttribute("data-stretch-first", "false");
    expect(replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "after probe" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
  });

  it("runs the baseline for a child missing any of the first three, as theirs, then Module 4", async () => {
    readiness.mockResolvedValue(
      ready({ grid_span: true, pattern_flanker: true, sentence_dot: false }),
    );
    render(<OnboardingResume />);

    const run = await screen.findByRole("button", { name: "after profiling" });
    // Parked under their own id: they are signed in, and nothing else may
    // claim the trials.
    expect(run).toHaveAttribute("data-owner", "student-1");
    expect(screen.queryByTestId("module-four")).toBeNull();

    fireEvent.click(run);

    expect(flushPendingBaseline).toHaveBeenCalledWith("student-1", "run-r");
    // Module 3 has just ended, so the stretch comes first.
    expect(await screen.findByTestId("module-four")).toHaveAttribute(
      "data-stretch-first",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "after probe" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
  });

  it("says the baseline was submitted only once it was", async () => {
    readiness.mockResolvedValue(ready({}));
    flushPendingBaseline.mockResolvedValue(false);
    render(<OnboardingResume />);

    fireEvent.click(await screen.findByRole("button", { name: "after profiling" }));
    await act(async () => {});

    expect(trackEvent).not.toHaveBeenCalledWith("baseline_submitted");
  });

  it("says so when it was", async () => {
    readiness.mockResolvedValue(ready({}));
    render(<OnboardingResume />);

    fireEvent.click(await screen.findByRole("button", { name: "after profiling" }));

    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith("baseline_submitted"));
  });
});

describe("the nothing-state, where nothing can be finished here", () => {
  it("is a way Home, not an automatic one, when Module 4 had nothing to ask", async () => {
    // The server never records Module 4 then, so this must not say it is done.
    readiness.mockResolvedValue(THREE_DONE);
    render(<OnboardingResume />);

    fireEvent.click(await screen.findByRole("button", { name: "nothing to probe" }));

    const home = screen.getByRole("button", { name: "Home" });
    expect(replace).not.toHaveBeenCalled();
    expect(document.body.textContent).toBe("Home");
    fireEvent.click(home);
    expect(replace).toHaveBeenCalledWith(HOME);
  });

  it("is the same when readiness cannot be read", async () => {
    readiness.mockRejectedValue(new ApiError(0, "offline"));
    render(<OnboardingResume />);

    expect(await screen.findByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.queryByTestId("module-four")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("a visitor with no session", () => {
  it("is sent to the child's door, and nothing is read", async () => {
    clearSession();
    render(<OnboardingResume />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/auth/login"));
    expect(readiness).not.toHaveBeenCalled();
  });
});
