import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ObservedInteractionSequence } from "./ObservedInteractionSequence";
import {
  clearOnboardingDraft,
  startOnboardingDraft,
} from "@/lib/auth/onboarding";
import { ApiError } from "@/lib/api/client";
import { clearSession } from "@/lib/auth/session";

/**
 * Module 4 IN the sequence, against the probe contract as deployed - the
 * real module, with only the server and the 15-second stretch stood in for.
 *
 * Teslim's 19 Oct no-question-bank exception, and Olayinka's ruling the same
 * day: "Build module 4 so an unavailable probe moves the child on, never to a
 * dead end." So a child whose probe has nothing to ask goes from the PIN
 * straight to Complete, which maps the three they did - never through a
 * stretch for a module that will not run, and never past a fourth quest map
 * stop that then disappears. Before the PIN nothing can be known: there is no
 * account to ask with, so the profiling run maps four.
 */

const { push, bindFirstPin, myDashboard, myConsentGate, readiness, next, answer, stretched } =
  vi.hoisted(() => ({
    push: vi.fn(),
    bindFirstPin: vi.fn(),
    myDashboard: vi.fn(),
    myConsentGate: vi.fn(),
    readiness: vi.fn(),
    next: vi.fn(),
    answer: vi.fn(),
    stretched: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ user: null }),
  useSignals: () => ({ trackEvent: vi.fn(), flush: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ authApi: {} }));
vi.mock("@/lib/auth/firstPin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/firstPin")>();
  return { ...actual, bindFirstPin };
});
vi.mock("@/lib/api/students", () => ({ studentsApi: { myDashboard } }));
vi.mock("@/lib/api/consents", () => ({ consentsApi: { myConsentGate } }));
vi.mock("@/lib/api/probe", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/probe")>()),
  probeApi: { readiness, next, answer },
}));
vi.mock("@/lib/profiling/pendingBaseline", () => ({
  flushPendingBaseline: vi.fn(async () => {}),
  readPendingBaseline: () => null,
}));

vi.mock("./TransitionScreen", () => ({
  TransitionScreen: ({ onDone }: { onDone: () => void }) => (
    <button onClick={onDone}>after transition</button>
  ),
}));
/*
 * The first three modules in one button - with the map they draw, so the
 * count they were handed can be read.
 */
vi.mock("@/components/student/Profiling/ProfilingFlow", async () => {
  const { useContext } = await import("react");
  const { QuestSegments } = await import(
    "@/components/student/Profiling/QuestMap"
  );
  function ProfilingFlow({
    onDone,
    segments,
  }: {
    onDone: (run: string) => void;
    segments?: number;
  }) {
    return (
      <QuestSegments.Provider value={segments ?? null}>
        <Segments />
        <button onClick={() => onDone("run-1")}>after profiling</button>
      </QuestSegments.Provider>
    );
  }
  function Segments() {
    return <p data-testid="run-segments">{String(useContext(QuestSegments))}</p>;
  }
  return { ProfilingFlow };
});
vi.mock("./PinCreationScreen", () => ({
  PinCreationScreen: ({
    storePin,
    onComplete,
  }: {
    storePin: (pin: string) => Promise<void>;
    onComplete: () => void;
  }) => (
    <button onClick={() => void storePin("1234").then(onComplete, () => {})}>
      set pin
    </button>
  ),
}));
vi.mock("./YoureInScreen", () => ({
  YoureInScreen: ({ onDone }: { onDone: () => void }) => (
    <button onClick={onDone}>you are in</button>
  ),
}));
// The 15-second stretch, as one button - and a record that it was ever drawn.
vi.mock("@/components/student/Profiling/StretchInterstitial", () => ({
  StretchInterstitial: ({ onDone }: { onDone: () => void }) => {
    stretched();
    return <button onClick={onDone}>take a breath</button>;
  },
}));

const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

const MATHS = { subjectId: "sub-maths", name: "Mathematics", probeAvailable: true };
const ART = { subjectId: "sub-art", name: "Art", probeAvailable: false };
const Q1 = {
  subjectId: "sub-maths",
  itemId: "item-1",
  question: "Which animal lives in water?",
  options: [
    { value: "opt-fish", label: "Fish" },
    { value: "opt-cat", label: "Cat" },
  ],
  asked: 1,
  maxQuestions: 8,
};
const EMPTY = { finished: true, noItems: true, subjectId: "sub-maths" };
// `entryPoint` is withheld from a student since d461b60: always null.
const FINISHED = { finished: true, subjectId: "sub-maths", entryPoint: null, asked: 1 };

/** What a child who has just made their account reads: the three are in. */
function ready(subjects: (typeof MATHS)[]) {
  return {
    complete: false,
    modules: [
      { id: "grid_span", completed: true },
      { id: "pattern_flanker", completed: true },
      { id: "sentence_dot", completed: true },
      { id: "domain_probe", completed: false },
    ],
    subjects,
    nextModule: "domain_probe",
  };
}

/** A promise the test settles when it chooses to. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearSession();
  window.localStorage.clear();
  startOnboardingDraft({
    name: "Amara",
    ageBand: "upper_primary",
    schoolCode: "K7DQ",
    admissionNumber: "BGA/2031",
  });
  bindFirstPin.mockResolvedValue({
    userId: "student-9",
    loginIdentifier: "NV-A1B2C3",
    session: {
      accessToken: "tok-s",
      tokenType: "bearer",
      expiresAt: future(),
      userId: "student-9",
      role: "student",
    },
  });
  myDashboard.mockResolvedValue({
    student: { id: "student-9", ageBand: "upper_primary" },
    assignments: [],
    recentProgress: [],
  });
  myConsentGate.mockResolvedValue({ blocked: false });
  readiness.mockResolvedValue(ready([MATHS]));
  next.mockResolvedValue(Q1);
});

afterEach(() => {
  cleanup();
  clearSession();
  window.localStorage.clear();
  clearOnboardingDraft();
});

/** Walk the sequence to the PIN step and set one. */
function walkToPin() {
  render(<ObservedInteractionSequence />);
  fireEvent.click(screen.getByRole("button", { name: "after transition" }));
  // Before the PIN there is no account to ask with: the run maps four.
  expect(screen.getByTestId("run-segments")).toHaveTextContent("4");
  fireEvent.click(screen.getByRole("button", { name: "after profiling" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "set pin" }));
}

describe("an unavailable probe moves the child on (Olayinka, 19 Oct)", () => {
  it("goes from the PIN to Complete with three stops when the subject answers with no items", async () => {
    const first = deferred<typeof EMPTY>();
    next.mockReturnValue(first.promise);
    walkToPin();

    // Finding out: readiness, then the first item - and no map while it does.
    await waitFor(() => expect(next).toHaveBeenCalledWith("sub-maths"));
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "take a breath" })).toBeNull();

    await act(async () => first.resolve(EMPTY));

    expect(
      await screen.findByText("All set. Nevo is ready for you."),
    ).toBeInTheDocument();
    const map = screen.getByRole("progressbar");
    expect(map).toHaveAttribute("aria-valuemax", "3");
    expect(map).toHaveAttribute("aria-valuenow", "3");
    // No stretch for a module that was never going to run.
    expect(stretched).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Let's finish setting up" }));
    expect(screen.getByRole("button", { name: "you are in" })).toBeInTheDocument();
  });

  it("does the same when no subject has items, drawing no fourth stop while it reads", async () => {
    const reading = deferred<ReturnType<typeof ready>>();
    readiness.mockReturnValue(reading.promise);
    walkToPin();

    await waitFor(() => expect(readiness).toHaveBeenCalled());
    expect(screen.queryByRole("progressbar")).toBeNull();

    await act(async () => reading.resolve(ready([ART])));

    expect(
      await screen.findByText("All set. Nevo is ready for you."),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "3");
    expect(next).not.toHaveBeenCalled();
    expect(stretched).not.toHaveBeenCalled();
  });

  it("goes to Complete with three stops when the server holds the probe as unavailable", async () => {
    // Teslim's 19 Oct contract: no bank arrives as `completed: true, status:
    // "unavailable"`. Nothing was asked, so it is not a fourth stop.
    readiness.mockResolvedValue({
      complete: true,
      modules: [
        { id: "grid_span", completed: true, status: "completed" },
        { id: "pattern_flanker", completed: true, status: "completed" },
        { id: "sentence_dot", completed: true, status: "completed" },
        { id: "domain_probe", completed: true, status: "unavailable" },
      ],
      subjects: [ART],
      nextModule: null,
      probeSubjectId: null,
      probePolicy: "one_available_subject",
    });
    walkToPin();

    expect(
      await screen.findByText("All set. Nevo is ready for you."),
    ).toBeInTheDocument();
    const map = screen.getByRole("progressbar");
    expect(map).toHaveAttribute("aria-valuemax", "3");
    expect(map).toHaveAttribute("aria-valuenow", "3");
    expect(next).not.toHaveBeenCalled();
    expect(stretched).not.toHaveBeenCalled();
  });

  it("goes the same way when a read fails, and claims nothing for it", async () => {
    readiness.mockRejectedValue(new ApiError(0, "offline"));
    walkToPin();

    expect(
      await screen.findByText("All set. Nevo is ready for you."),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "3");
    expect(stretched).not.toHaveBeenCalled();
  });
});

describe("a probe that will run", () => {
  it("stretches with four stops, then shows the item it read, and asks for it no second time", async () => {
    answer.mockResolvedValue(FINISHED);
    walkToPin();

    const stretch = await screen.findByRole("button", { name: "take a breath" });
    expect(next).toHaveBeenCalledTimes(1);
    fireEvent.click(stretch);

    expect(await screen.findByText("Which animal lives in water?")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "4");
    expect(next).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Fish" }));

    expect(
      await screen.findByText("All set. Nevo is ready for you."),
    ).toBeInTheDocument();
    const map = screen.getByRole("progressbar");
    expect(map).toHaveAttribute("aria-valuemax", "4");
    expect(map).toHaveAttribute("aria-valuenow", "4");
  });
});
