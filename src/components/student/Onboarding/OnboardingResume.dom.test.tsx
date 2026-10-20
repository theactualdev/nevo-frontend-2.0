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
 *
 * And a Module 4 with nothing to ask moves the child on, never to a dead end,
 * with no placement filled in here - Teslim's 19 Oct no-question-bank
 * exception, as Olayinka ruled 19 Oct - without bouncing them between Home
 * and this route while the server's gate still refuses their lessons.
 */

const { replace, readiness, next, flushPendingBaseline, trackEvent, flush } =
  vi.hoisted(() => ({
    replace: vi.fn(),
    readiness: vi.fn(),
    next: vi.fn(),
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
  probeApi: { readiness, next },
}));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ flushPendingBaseline }));
vi.mock("@/components/student/Profiling/ProfilingFlow", () => ({
  ProfilingFlow: ({
    onDone,
    ownerUserId,
    segments,
  }: {
    onDone: (run: string | null) => void;
    ownerUserId?: string | null;
    segments?: number;
  }) => (
    <button
      data-owner={ownerUserId ?? ""}
      data-segments={String(segments)}
      onClick={() => onDone("run-r")}
    >
      after profiling
    </button>
  ),
}));
vi.mock("@/components/student/Profiling/DomainProbeModule", () => ({
  DomainProbeStep: ({
    onDone,
    stretchFirst,
    openings,
  }: {
    onDone: (outcome: "sat" | "absent" | "failed") => void;
    stretchFirst: boolean;
    openings?: { item: { itemId: string } }[];
  }) => (
    <div
      data-testid="module-four"
      data-stretch-first={String(stretchFirst)}
      data-items={openings ? openings.map((o) => o.item.itemId).join(",") : "unread"}
    >
      <button onClick={() => onDone("sat")}>after probe</button>
      <button onClick={() => onDone("absent")}>nothing to probe</button>
      <button onClick={() => onDone("failed")}>probe failed</button>
    </div>
  ),
}));

const HOME = "/student/dashboard";

const MATHS = { subjectId: "sub-maths", name: "Mathematics", probeAvailable: true };
const ART = { subjectId: "sub-art", name: "Art", probeAvailable: false };
const Q1 = {
  subjectId: "sub-maths",
  itemId: "item-1",
  question: "Which animal lives in water?",
  options: [{ value: "opt-fish", label: "Fish" }],
};
const EMPTY = { finished: true, noItems: true, subjectId: "sub-maths" };

function ready(
  done: Record<string, boolean>,
  subjects: (typeof MATHS)[] = [MATHS],
) {
  const modules = ["grid_span", "pattern_flanker", "sentence_dot", "domain_probe"].map(
    (id) => ({ id, completed: done[id] ?? false }),
  );
  return {
    complete: modules.every((m) => m.completed),
    modules,
    subjects,
    nextModule: modules.find((m) => !m.completed)?.id ?? null,
  };
}
const BASELINE_DONE = { grid_span: true, pattern_flanker: true, sentence_dot: true };
const THREE_DONE = ready(BASELINE_DONE);
const ALL_DONE = ready({ ...BASELINE_DONE, domain_probe: true });
/** The three done, and no subject with anything to ask. */
const NOTHING_TO_ASK = ready(BASELINE_DONE, [ART]);

/**
 * Readiness as the server sends it since Teslim's 19 Oct contract, for a
 * child with no question bank in any subject: Module 4 `completed: true,
 * status: "unavailable"`, and no suggested subject.
 */
function readyNoBank(done: Record<string, boolean>) {
  const modules = ["grid_span", "pattern_flanker", "sentence_dot"].map((id) => ({
    id,
    completed: done[id] ?? false,
    status: done[id] ? ("completed" as const) : ("pending" as const),
  }));
  const all = [
    ...modules,
    { id: "domain_probe", completed: true, status: "unavailable" as const },
  ];
  return {
    complete: all.every((m) => m.completed),
    modules: all,
    subjects: [{ ...ART }],
    nextModule: all.find((m) => !m.completed)?.id ?? null,
    probeSubjectId: null,
    probePolicy: "one_available_subject" as const,
  };
}

function signIn(userId = "student-1") {
  setSession({
    token: "tok-child",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId,
    role: "student",
  });
}

/**
 * Another arrival, as the gate makes one: `client.ts` leaves with
 * `location.assign`, a full load, so nothing in memory carries over - the
 * module registry is reset before the route is mounted again. The tab's
 * `sessionStorage` is all that survives, as it would.
 */
async function arriveAgain() {
  cleanup();
  replace.mockClear();
  vi.resetModules();
  const { OnboardingResume: Fresh } = await import("./OnboardingResume");
  return render(<Fresh />);
}

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  signIn();
  flushPendingBaseline.mockResolvedValue(true);
  next.mockResolvedValue(Q1);
});

afterEach(() => {
  cleanup();
  clearSession();
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

describe("where the server's answer starts a child", () => {
  it("sends a child with all four done Home, and asks nothing", async () => {
    readiness.mockResolvedValue(ALL_DONE);
    render(<OnboardingResume />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    expect(screen.queryByTestId("module-four")).toBeNull();
    expect(screen.queryByRole("button", { name: "after profiling" })).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  it("takes a child with the three done straight to Module 4, with the item it read, then Home", async () => {
    readiness.mockResolvedValue(THREE_DONE);
    render(<OnboardingResume />);

    const four = await screen.findByTestId("module-four");
    expect(screen.queryByRole("button", { name: "after profiling" })).toBeNull();
    // Straight in: they have not just finished a module, so no stretch.
    expect(four).toHaveAttribute("data-stretch-first", "false");
    // What was read to find out it would run is what it shows.
    expect(four).toHaveAttribute("data-items", "item-1");
    expect(next).toHaveBeenCalledTimes(1);
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
    // Module 4 will run, so the map has its stop.
    expect(run).toHaveAttribute("data-segments", "4");
    expect(screen.queryByTestId("module-four")).toBeNull();

    fireEvent.click(run);

    expect(flushPendingBaseline).toHaveBeenCalledWith("student-1", "run-r");
    // Module 3 has just ended, so the stretch comes first.
    const four = await screen.findByTestId("module-four");
    expect(four).toHaveAttribute("data-stretch-first", "true");
    expect(four).toHaveAttribute("data-items", "item-1");
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

describe("a Module 4 with nothing to ask moves the child on (Olayinka, 19 Oct)", () => {
  it("sends a child with only Module 4 left and no subject with items straight Home", async () => {
    readiness.mockResolvedValue(NOTHING_TO_ASK);
    render(<OnboardingResume />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    // Replaced, not pushed: Back does not return here. Nothing was drawn on
    // the way - no Module 4, no screen to dismiss - and nothing was asked.
    expect(screen.queryByTestId("module-four")).toBeNull();
    expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  it("does the same when the only subject answers with no items", async () => {
    readiness.mockResolvedValue(THREE_DONE);
    next.mockResolvedValue(EMPTY);
    render(<OnboardingResume />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    expect(screen.queryByTestId("module-four")).toBeNull();
    expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
  });

  it("maps three for a child who still has the baseline to do, then moves them on after it", async () => {
    readiness.mockResolvedValue(ready({ grid_span: true }, [ART]));
    render(<OnboardingResume />);

    const run = await screen.findByRole("button", { name: "after profiling" });
    // "A child who will do three sees three segments" (design, 9 Oct).
    expect(run).toHaveAttribute("data-segments", "3");

    fireEvent.click(run);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    expect(screen.queryByTestId("module-four")).toBeNull();
    // The baseline went first, and said so on the stream before it closed.
    expect(trackEvent).toHaveBeenCalledWith("baseline_submitted");
    expect(flush).toHaveBeenCalled();
  });

  it("maps three when the server holds the probe as unavailable, then moves them on", async () => {
    // `completed: true` with `status: "unavailable"` is nothing asked, not
    // a module sat: three stops (design, 9 Oct), and Module 4 never shows.
    readiness.mockResolvedValue(readyNoBank({ grid_span: true }));
    render(<OnboardingResume />);

    const run = await screen.findByRole("button", { name: "after profiling" });
    expect(run).toHaveAttribute("data-segments", "3");

    fireEvent.click(run);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    expect(screen.queryByTestId("module-four")).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  it("sends a child with the three done and the probe unavailable Home, asking nothing", async () => {
    readiness.mockResolvedValue(readyNoBank(BASELINE_DONE));
    render(<OnboardingResume />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    expect(screen.queryByTestId("module-four")).toBeNull();
    expect(screen.queryByRole("button", { name: "after profiling" })).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  it("moves on when Module 4 finds nothing after all", async () => {
    // The plan could not be read before the baseline; the step read it again
    // after, and there was nothing.
    readiness.mockResolvedValue(ready({}));
    next.mockRejectedValue(new ApiError(0, "offline"));
    render(<OnboardingResume />);

    fireEvent.click(await screen.findByRole("button", { name: "after profiling" }));
    const four = await screen.findByTestId("module-four");
    expect(four).toHaveAttribute("data-items", "unread");
    fireEvent.click(screen.getByRole("button", { name: "nothing to probe" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
  });

  it("fills in nothing on the device: no placement, no completion, no local pass", async () => {
    readiness.mockResolvedValue(NOTHING_TO_ASK);
    // The session, and nothing else.
    const before = { ...window.localStorage };
    render(<OnboardingResume />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));

    expect({ ...window.localStorage }).toEqual(before);
    const kept = Object.keys(window.sessionStorage);
    expect(kept).toHaveLength(1);
    expect(kept[0]).not.toMatch(/placement|entry|domain_probe|complete/i);
    expect(trackEvent).not.toHaveBeenCalled();
  });
});

describe("the loop guard, while the server still refuses the lesson", () => {
  it("leaves a child who comes back on the nothing-state, Home offered, not taken", async () => {
    // Home, a lesson, 409 `onboarding_required`, here: moved on. Home, the
    // lesson, 409, here again - and this time they stay.
    readiness.mockResolvedValue(NOTHING_TO_ASK);
    render(<OnboardingResume />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));

    await arriveAgain();

    const home = await screen.findByRole("button", { name: "Home" });
    expect(document.body.textContent).toBe("Home");
    await act(async () => {});
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId("module-four")).toBeNull();

    fireEvent.click(home);
    expect(replace).toHaveBeenCalledWith(HOME);
  });

  it("keeps them there on every arrival after", async () => {
    readiness.mockResolvedValue(NOTHING_TO_ASK);
    render(<OnboardingResume />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    await arriveAgain();
    await screen.findByRole("button", { name: "Home" });

    await arriveAgain();

    expect(await screen.findByRole("button", { name: "Home" })).toBeInTheDocument();
    await act(async () => {});
    expect(replace).not.toHaveBeenCalled();
  });

  it("still asks the server on every arrival, and runs Module 4 the day it can", async () => {
    readiness.mockResolvedValue(NOTHING_TO_ASK);
    render(<OnboardingResume />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));

    readiness.mockResolvedValue(THREE_DONE);
    await arriveAgain();

    expect(await screen.findByTestId("module-four")).toHaveAttribute(
      "data-items",
      "item-1",
    );
    expect(readiness).toHaveBeenCalledTimes(2);
  });

  it("is each child's own on a shared tablet", async () => {
    readiness.mockResolvedValue(NOTHING_TO_ASK);
    render(<OnboardingResume />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));

    clearSession();
    signIn("student-2");
    await arriveAgain();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
  });

  it("is not used up by a read that failed", async () => {
    readiness.mockRejectedValue(new ApiError(0, "offline"));
    render(<OnboardingResume />);
    await screen.findByRole("button", { name: "Home" });

    readiness.mockResolvedValue(NOTHING_TO_ASK);
    await arriveAgain();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
  });
});

describe("the nothing-state, where a read failed", () => {
  it("is a way Home, not an automatic one, when readiness cannot be read", async () => {
    readiness.mockRejectedValue(new ApiError(0, "offline"));
    render(<OnboardingResume />);

    const home = await screen.findByRole("button", { name: "Home" });
    expect(document.body.textContent).toBe("Home");
    expect(screen.queryByTestId("module-four")).toBeNull();
    await act(async () => {});
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(home);
    expect(replace).toHaveBeenCalledWith(HOME);
  });

  it("is the same when Module 4's first item cannot be read", async () => {
    // Not "nothing to ask": a broken read is not moved past as though the
    // bank were empty.
    readiness.mockResolvedValue(THREE_DONE);
    next.mockRejectedValue(new ApiError(0, "offline"));
    render(<OnboardingResume />);

    expect(await screen.findByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.queryByTestId("module-four")).toBeNull();
    await act(async () => {});
    expect(replace).not.toHaveBeenCalled();
  });

  it("is the same when Module 4 itself says its read failed", async () => {
    readiness.mockResolvedValue(ready({}));
    next.mockRejectedValue(new ApiError(0, "offline"));
    render(<OnboardingResume />);

    fireEvent.click(await screen.findByRole("button", { name: "after profiling" }));
    fireEvent.click(await screen.findByRole("button", { name: "probe failed" }));

    expect(await screen.findByRole("button", { name: "Home" })).toBeInTheDocument();
    await act(async () => {});
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
