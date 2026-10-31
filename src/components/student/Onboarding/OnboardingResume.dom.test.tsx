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
 * three done goes straight to Module 4, a child with all four is told it is
 * already done (design 5bb9ee2) and goes on.
 *
 * And a Module 4 with no question bank moves the child on, never to a dead
 * end, with no placement filled in here - Teslim's 19 Oct no-question-bank
 * exception, as Olayinka ruled 19 Oct - without bouncing them between Home
 * and this route while the server's gate still refuses their lessons. Only
 * the server says there is no bank (Teslim's answers, 21 Oct): nothing to
 * ask while readiness still holds Module 4 owed is the nothing-state.
 */

const {
  replace,
  readiness,
  next,
  flushPendingBaseline,
  trackEvent,
  flush,
  report,
  finish,
} = vi.hoisted(() => ({
  replace: vi.fn(),
  readiness: vi.fn(),
  next: vi.fn(),
  flushPendingBaseline: vi.fn(),
  trackEvent: vi.fn(),
  flush: vi.fn(),
  report: vi.fn(),
  /** The way back Module 4's finish names, for the button that sends it. */
  finish: { navigatesTo: "" },
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
vi.mock("@/lib/api/clientErrors", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/clientErrors")>()),
  reportProbeNothingToAsk: report,
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
    lessonId,
  }: {
    onDone: (outcome: "sat" | "absent" | "failed", navigatesTo?: string) => void;
    stretchFirst: boolean;
    openings?: { item: { itemId: string } }[];
    lessonId?: string;
  }) => (
    <div
      data-testid="module-four"
      data-stretch-first={String(stretchFirst)}
      data-items={openings ? openings.map((o) => o.item.itemId).join(",") : "unread"}
      data-lesson={lessonId ?? "(none)"}
    >
      <button onClick={() => onDone("sat")}>after probe</button>
      <button onClick={() => onDone("sat", finish.navigatesTo)}>
        after probe, the server naming the way back
      </button>
      <button onClick={() => onDone("absent")}>nothing to probe</button>
      <button onClick={() => onDone("failed")}>probe failed</button>
    </div>
  ),
}));

const HOME = "/student/dashboard";
/** Where the nothing-state's "Go to my lessons" goes. */
const LESSONS = "/student/lessons";
/** The nothing-state's one way out (design 5bb9ee2). */
const NOTHING = "Go to my lessons";
/** "Already done"'s one way on (design 5bb9ee2). */
const ON = "Continue to Nevo";

/** The nothing-state: the frame's words and its one way out, nothing else. */
function expectNothingState() {
  expect(screen.getByRole("heading").textContent).toBe(
    "Nothing to do here right now",
  );
  expect(document.body.textContent).toContain(
    "You can go on to Nevo and come back any time.",
  );
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
    NOTHING,
  ]);
}

/**
 * "You've already done this part" - shown, with nothing taken yet - and then
 * its one way on, pressed.
 */
async function carryOn() {
  const on = await screen.findByRole("button", { name: ON });
  expect(screen.getByRole("heading").textContent).toBe(
    "You've already done this part",
  );
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(replace).not.toHaveBeenCalled();
  fireEvent.click(on);
}

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
/**
 * The three done, no subject with anything to ask, and Module 4 NOT held as
 * unavailable: still owed, as far as readiness says.
 */
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

/**
 * The three done and Module 4 held as unavailable - no bank - while readiness
 * does not yet say complete: what the one-time move on, and its loop guard,
 * are for.
 */
const NO_BANK = { ...readyNoBank(BASELINE_DONE), complete: false };

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
async function arriveAgain(props: { returnTo?: string } = {}) {
  cleanup();
  replace.mockClear();
  vi.resetModules();
  const { OnboardingResume: Fresh } = await import("./OnboardingResume");
  return render(<Fresh {...props} />);
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
  it("tells a child with all four done it is already done, asks nothing, and sends them Home", async () => {
    readiness.mockResolvedValue(ALL_DONE);
    render(<OnboardingResume />);

    await carryOn();
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

/*
 * Design 5bb9ee2, 28 Oct, BP-M4-AFTER-PIN: "a returning sign-in can land
 * here; neither state is a dead end". The frame's "already done" is drawn as
 * the backend's 409; the probe has none, so it is shown on readiness holding
 * Module 4 `completed` (Hub, 28 Oct).
 */
describe("Module 4 already done (design 5bb9ee2)", () => {
  it("is said after the baseline run when the server already holds Module 4, then on", async () => {
    readiness.mockResolvedValue(ready({ grid_span: true, domain_probe: true }));
    render(<OnboardingResume returnTo="/student/lessons/les-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "after profiling" }));

    await carryOn();
    expect(screen.queryByTestId("module-four")).toBeNull();
    expect(next).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/student/lessons/les-1"),
    );
  });

  it("says the frame's words, never a conflict", async () => {
    readiness.mockResolvedValue(ALL_DONE);
    render(<OnboardingResume />);

    await screen.findByRole("button", { name: ON });
    expect(document.body.textContent).toContain(
      "Your answers from before are saved, so there's nothing to do again here. You can carry straight on to Nevo.",
    );
    expect(document.body.textContent).not.toMatch(/conflict|409/i);
  });

  it("is not said to a child who has just sat Module 4: they go straight on", async () => {
    readiness.mockResolvedValue(THREE_DONE);
    render(<OnboardingResume />);

    fireEvent.click(await screen.findByRole("button", { name: "after probe" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    expect(screen.queryByRole("button", { name: ON })).toBeNull();
  });
});

describe("a Module 4 with no bank moves the child on (Olayinka, 19 Oct)", () => {
  it("sends a child with only Module 4 left and no subject with items Home, once readiness read again says no bank", async () => {
    readiness.mockResolvedValueOnce(NOTHING_TO_ASK).mockResolvedValue(NO_BANK);
    render(<OnboardingResume />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    // Replaced, not pushed: Back does not return here. Nothing was drawn on
    // the way - no Module 4, no screen to dismiss - and nothing was asked.
    expect(screen.queryByTestId("module-four")).toBeNull();
    expect(screen.queryByRole("button", { name: NOTHING })).toBeNull();
    expect(next).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("does the same when the only subject answers with no items and the re-read says no bank", async () => {
    readiness.mockResolvedValueOnce(THREE_DONE).mockResolvedValue(NO_BANK);
    next.mockResolvedValue(EMPTY);
    render(<OnboardingResume />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    expect(screen.queryByTestId("module-four")).toBeNull();
    expect(screen.queryByRole("button", { name: NOTHING })).toBeNull();
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
    // Readiness says complete, but Module 4 was never sat: not "already done".
    expect(screen.queryByRole("button", { name: ON })).toBeNull();
    expect(screen.queryByTestId("module-four")).toBeNull();
    expect(screen.queryByRole("button", { name: "after profiling" })).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  it("moves on when Module 4 finds no bank after all", async () => {
    // The plan could not be read before the baseline; the step read it again
    // after, and the server held the probe as unavailable.
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
    readiness.mockResolvedValue(NO_BANK);
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

/*
 * Teslim's answers, 21 Oct: a finish before any question "is not a no-bank
 * signal", and "an empty subject alone must not waive module 4". Olayinka's
 * order on them: readiness read again and followed, and when it still says
 * available with nothing to ask, flagged to backend - not a move on.
 */
describe("nothing to ask while readiness holds Module 4 owed (Teslim, 21 Oct)", () => {
  it("is the nothing-state, its way to the lessons offered not taken, and reported - not a move on", async () => {
    readiness.mockResolvedValue(NOTHING_TO_ASK);
    render(<OnboardingResume />);

    const home = await screen.findByRole("button", { name: NOTHING });
    expectNothingState();
    await act(async () => {});
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId("module-four")).toBeNull();
    // Read, read once again, and reported once.
    expect(readiness).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({ subjectIds: [], status: undefined });

    fireEvent.click(home);
    expect(replace).toHaveBeenCalledWith(LESSONS);
  });

  it("is the same when the only subject answers with no items, on both reads", async () => {
    readiness.mockResolvedValue(THREE_DONE);
    next.mockResolvedValue(EMPTY);
    render(<OnboardingResume />);

    expect(await screen.findByRole("button", { name: NOTHING })).toBeInTheDocument();
    await act(async () => {});
    expect(replace).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledWith({ subjectIds: ["sub-maths"], status: undefined });
  });

  it("does not spend the one-time move on, so a later no-bank answer still moves the child on", async () => {
    readiness.mockResolvedValue(NOTHING_TO_ASK);
    render(<OnboardingResume />);
    await screen.findByRole("button", { name: NOTHING });

    readiness.mockResolvedValue(NO_BANK);
    await arriveAgain();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    expect(screen.queryByRole("button", { name: NOTHING })).toBeNull();
  });

  it("maps four for a child with the baseline to do, then plans Module 4 again after the run", async () => {
    readiness.mockResolvedValue(ready({ grid_span: true }, [ART]));
    render(<OnboardingResume />);

    const run = await screen.findByRole("button", { name: "after profiling" });
    // Owed is four: only the server's `unavailable` makes a run of three.
    expect(run).toHaveAttribute("data-segments", "4");

    fireEvent.click(run);

    // Module 4, read again by the step itself - not a move on.
    const four = await screen.findByTestId("module-four");
    expect(four).toHaveAttribute("data-stretch-first", "true");
    expect(four).toHaveAttribute("data-items", "unread");
    await act(async () => {});
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("the loop guard, while the server still refuses the lesson", () => {
  it("leaves a child who comes back on the nothing-state, its way to the lessons offered, not taken", async () => {
    // Home, a lesson, 409 `onboarding_required`, here: moved on. Home, the
    // lesson, 409, here again - and this time they stay.
    readiness.mockResolvedValue(NO_BANK);
    render(<OnboardingResume />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));

    await arriveAgain();

    const home = await screen.findByRole("button", { name: NOTHING });
    expectNothingState();
    await act(async () => {});
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId("module-four")).toBeNull();

    fireEvent.click(home);
    expect(replace).toHaveBeenCalledWith(LESSONS);
  });

  it("keeps them there on every arrival after", async () => {
    readiness.mockResolvedValue(NO_BANK);
    render(<OnboardingResume />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    await arriveAgain();
    await screen.findByRole("button", { name: NOTHING });

    await arriveAgain();

    expect(await screen.findByRole("button", { name: NOTHING })).toBeInTheDocument();
    await act(async () => {});
    expect(replace).not.toHaveBeenCalled();
  });

  it("still asks the server on every arrival, and runs Module 4 the day it can", async () => {
    readiness.mockResolvedValue(NO_BANK);
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
    readiness.mockResolvedValue(NO_BANK);
    render(<OnboardingResume />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));

    clearSession();
    signIn("student-2");
    await arriveAgain();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    expect(screen.queryByRole("button", { name: NOTHING })).toBeNull();
  });

  it("is not used up by a read that failed", async () => {
    readiness.mockRejectedValue(new ApiError(0, "offline"));
    render(<OnboardingResume />);
    await screen.findByRole("button", { name: NOTHING });

    readiness.mockResolvedValue(NO_BANK);
    await arriveAgain();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
  });
});

describe("the nothing-state, where a read failed", () => {
  it("is a way to the lessons, not an automatic one, when readiness cannot be read", async () => {
    readiness.mockRejectedValue(new ApiError(0, "offline"));
    render(<OnboardingResume />);

    const home = await screen.findByRole("button", { name: NOTHING });
    expectNothingState();
    expect(screen.queryByTestId("module-four")).toBeNull();
    await act(async () => {});
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(home);
    expect(replace).toHaveBeenCalledWith(LESSONS);
  });

  it("is the same when Module 4's first item cannot be read", async () => {
    // Not "nothing to ask": a broken read is not moved past as though the
    // bank were empty.
    readiness.mockResolvedValue(THREE_DONE);
    next.mockRejectedValue(new ApiError(0, "offline"));
    render(<OnboardingResume />);

    expect(await screen.findByRole("button", { name: NOTHING })).toBeInTheDocument();
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

    expect(await screen.findByRole("button", { name: NOTHING })).toBeInTheDocument();
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

  it("is sent there even with a lesson to go back to", async () => {
    clearSession();
    render(<OnboardingResume returnTo="/student/lessons/les-1" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/auth/login"));
    expect(replace).not.toHaveBeenCalledWith("/student/lessons/les-1");
  });
});

/*
 * BACK TO THE LESSON THEY TAPPED START ON, from the 20 Oct production run: a
 * child sent here by a lesson's refusal finished the probe and landed on
 * Home. Every way out that means "onboarding is done" goes back; the
 * nothing-state's own button goes to the lessons.
 */
describe("the way back to the page that was refused", () => {
  const LESSON = "/student/lessons/les-1?assignment=asg-1";

  it("goes back for a child with all four done on arrival, once they carry on", async () => {
    readiness.mockResolvedValue(ALL_DONE);
    render(<OnboardingResume returnTo={LESSON} />);
    await carryOn();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(LESSON));
    expect(replace).not.toHaveBeenCalledWith(HOME);
  });

  it("goes back once Module 4 is sat", async () => {
    readiness.mockResolvedValue(THREE_DONE);
    render(<OnboardingResume returnTo={LESSON} />);

    fireEvent.click(await screen.findByRole("button", { name: "after probe" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(LESSON));
    expect(replace).not.toHaveBeenCalledWith(HOME);
  });

  it("says already done, then goes back, when the server already holds Module 4", async () => {
    // The three and the probe held, readiness not yet saying complete.
    readiness.mockResolvedValue({ ...ALL_DONE, complete: false });
    render(<OnboardingResume returnTo={LESSON} />);
    await carryOn();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(LESSON));
    expect(next).not.toHaveBeenCalled();
  });

  it("goes back on the one-time move on, and offers the lessons the next time", async () => {
    readiness.mockResolvedValue(NO_BANK);
    render(<OnboardingResume returnTo={LESSON} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(LESSON));

    // The lesson refused again: here again, and this time they stay.
    await arriveAgain({ returnTo: LESSON });

    const home = await screen.findByRole("button", { name: NOTHING });
    await act(async () => {});
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(home);
    expect(replace).toHaveBeenCalledWith(LESSONS);
  });

  it("goes back once, then Home, while the lesson still refuses a child readiness calls done", async () => {
    /*
     * 21 Oct on-screen check: readiness `complete: true`, the lesson's read
     * still 409 `onboarding_required` - lesson, here, lesson, here, every few
     * seconds, for ever. The second arrival goes Home, as before the way back.
     */
    readiness.mockResolvedValue(ALL_DONE);
    render(<OnboardingResume returnTo={LESSON} />);
    await carryOn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(LESSON));

    await arriveAgain({ returnTo: LESSON });

    await carryOn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    expect(replace).not.toHaveBeenCalledWith(LESSON);
    // Home, not the nothing-state: readiness says onboarding is done.
    expect(screen.queryByRole("button", { name: NOTHING })).toBeNull();
  });

  it("goes Home the next time after Module 4 is sat, if the lesson still refuses", async () => {
    readiness.mockResolvedValue(THREE_DONE);
    render(<OnboardingResume returnTo={LESSON} />);
    fireEvent.click(await screen.findByRole("button", { name: "after probe" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(LESSON));

    readiness.mockResolvedValue(ALL_DONE);
    await arriveAgain({ returnTo: LESSON });

    await carryOn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    expect(replace).not.toHaveBeenCalledWith(LESSON);
  });

  it("keeps its first answer through a re-render before the page has left", async () => {
    // The claim is spent when it is read: the effect running again on the
    // same arrival must not read it twice and turn the way back into Home.
    readiness.mockResolvedValue(ALL_DONE);
    const { rerender } = render(<OnboardingResume returnTo={LESSON} />);
    await carryOn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(LESSON));

    rerender(<OnboardingResume returnTo={LESSON} />);
    await act(async () => {});

    expect(replace).not.toHaveBeenCalledWith(HOME);
  });

  it("still goes back to another lesson the child is refused", async () => {
    readiness.mockResolvedValue(ALL_DONE);
    render(<OnboardingResume returnTo={LESSON} />);
    await carryOn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(LESSON));

    await arriveAgain({ returnTo: "/student/lessons/les-2" });

    await carryOn();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/student/lessons/les-2"),
    );
  });

  it("still goes back for another child on the same tablet", async () => {
    readiness.mockResolvedValue(ALL_DONE);
    render(<OnboardingResume returnTo={LESSON} />);
    await carryOn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(LESSON));

    clearSession();
    signIn("student-2");
    await arriveAgain({ returnTo: LESSON });

    await carryOn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(LESSON));
  });

  it("goes Home when the way back cannot be recorded", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    readiness.mockResolvedValue(ALL_DONE);
    try {
      render(<OnboardingResume returnTo={LESSON} />);
      await carryOn();

      await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
      expect(replace).not.toHaveBeenCalledWith(LESSON);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("goes Home when there is nothing to go back to", async () => {
    readiness.mockResolvedValue(ALL_DONE);
    render(<OnboardingResume />);

    await carryOn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
  });

  it("keeps the nothing-state's button to the lessons, a lesson to go back to or not", async () => {
    readiness.mockRejectedValue(new ApiError(0, "offline"));
    render(<OnboardingResume returnTo={LESSON} />);

    const home = await screen.findByRole("button", { name: NOTHING });
    await act(async () => {});
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(home);
    expect(replace).toHaveBeenCalledWith(LESSONS);
    expect(replace).not.toHaveBeenCalledWith(LESSON);
  });
});

/*
 * SCRUM-266, Teslim 21 Oct. Readiness read for the lesson a child was refused
 * "returns a preferred matching probeSubjectId, lessonProbeStatus ... and
 * returnTo", and the probe is asked about that lesson. "ProbeFinished returns
 * navigatesTo for the remembered lesson. The frontend still has to follow
 * that destination." In that order: the finish's way back, readiness's, the
 * refused page, Home - each checked, and still once per tab.
 */
describe("the lesson a child was refused, and the server's way back", () => {
  const L1 = "9c1e77aa-1111-4222-8333-444455556666";
  const L2 = "7d2f1e4b-1111-4222-8333-999988887777";
  const L1_PAGE = `/student/lessons/${L1}`;
  const L1_LINK = `${L1_PAGE}?assignment=asg-1`;
  const L2_PAGE = `/student/lessons/${L2}`;

  /** Readiness, read for a lesson whose subject the probe can ask. */
  const forLesson = (base: ReturnType<typeof ready>, returnTo: string | null) => ({
    ...base,
    probeSubjectId: "sub-maths",
    lessonProbeStatus: "available" as const,
    returnTo,
  });

  it("reads readiness for the lesson, asks about it, and hands it to Module 4 - and sends no lesson for a page that is not one", async () => {
    readiness.mockResolvedValue(forLesson(THREE_DONE, L1_PAGE));
    render(<OnboardingResume returnTo={L1_LINK} />);

    const four = await screen.findByTestId("module-four");
    expect(readiness.mock.calls).toEqual([[L1]]);
    expect(next.mock.calls).toEqual([["sub-maths", L1]]);
    expect(four).toHaveAttribute("data-lesson", L1);

    // Home refused, and a lesson id the server would refuse: no lesson.
    for (const page of ["/student/dashboard", "/student/lessons/les-1"]) {
      readiness.mockClear();
      next.mockClear();
      readiness.mockResolvedValue(THREE_DONE);
      await arriveAgain({ returnTo: page });

      const plain = await screen.findByTestId("module-four");
      expect(readiness.mock.calls).toEqual([[]]);
      expect(next.mock.calls).toEqual([["sub-maths"]]);
      expect(plain).toHaveAttribute("data-lesson", "(none)");
    }
  });

  it("follows the way back Module 4's finish names, ahead of readiness's and the refused page", async () => {
    readiness.mockResolvedValue(forLesson(THREE_DONE, L2_PAGE));
    finish.navigatesTo = L1_PAGE;
    render(<OnboardingResume returnTo="/student/dashboard" />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "after probe, the server naming the way back",
      }),
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith(L1_PAGE));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("skips a way back it would not follow, for the next in line", async () => {
    // A full URL - the server sends a bare path - and any address off the
    // student app are not followed; readiness's way back is.
    readiness.mockResolvedValue(forLesson(THREE_DONE, L2_PAGE));
    finish.navigatesTo = `https://evil.example${L1_PAGE}`;
    render(<OnboardingResume returnTo="/student/dashboard" />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "after probe, the server naming the way back",
      }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith(L2_PAGE));

    // Neither the server's: the refused page.
    readiness.mockResolvedValue(forLesson(THREE_DONE, "/teacher/classes"));
    finish.navigatesTo = "/student/onboarding/continue";
    await arriveAgain({ returnTo: L1_LINK });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "after probe, the server naming the way back",
      }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith(L1_LINK));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("goes back where readiness says when nothing else names a way, ahead of the refused page", async () => {
    readiness.mockResolvedValue({ ...ALL_DONE, returnTo: L2_PAGE });
    render(<OnboardingResume returnTo="/student/dashboard" />);

    await carryOn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(L2_PAGE));
    expect(replace).not.toHaveBeenCalledWith("/student/dashboard");

    // The same lesson the child was refused: their link, assignment and all.
    readiness.mockResolvedValue({ ...ALL_DONE, returnTo: L1_PAGE });
    await arriveAgain({ returnTo: L1_LINK });
    await carryOn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(L1_LINK));
  });

  it("still goes back once, then Home, when the lesson the server names still refuses", async () => {
    readiness.mockResolvedValue(forLesson(THREE_DONE, null));
    finish.navigatesTo = L1_PAGE;
    render(<OnboardingResume />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "after probe, the server naming the way back",
      }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith(L1_PAGE));

    // The lesson refuses again: back here, readiness naming the same lesson.
    readiness.mockResolvedValue({ ...ALL_DONE, returnTo: L1_PAGE });
    await arriveAgain({ returnTo: L1_PAGE });

    await carryOn();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(HOME));
    expect(replace).not.toHaveBeenCalledWith(L1_PAGE);
  });

  it("keeps the nothing-state's button to the lessons, whatever the server names", async () => {
    readiness.mockResolvedValue({ ...NOTHING_TO_ASK, returnTo: L1_PAGE });
    render(<OnboardingResume returnTo={L1_LINK} />);

    const home = await screen.findByRole("button", { name: NOTHING });
    await act(async () => {});
    fireEvent.click(home);
    expect(replace.mock.calls).toEqual([[LESSONS]]);
  });
});
