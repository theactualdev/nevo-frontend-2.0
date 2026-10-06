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
import {
  clearSession,
  getRememberedProfile,
  getSession,
} from "@/lib/auth/session";

/**
 * The last screens of onboarding, walked end to end with each earlier screen
 * reduced to the one button that moves it on.
 *
 * The child arrives from 05 Entry, which matched them on their school code and
 * Student ID and left that pair in the draft. The PIN step binds the PIN to
 * that pair through `bindFirstPin` (`POST /student-entry/pin`, B64). These
 * tests drive the path both ways, stored and refused. The real binding,
 * against the real PIN screen, is
 * `ObservedInteractionSequence.firstPin.dom.test.tsx`.
 */

const { push, bindFirstPin, myDashboard, myConsentGate } = vi.hoisted(() => ({
  push: vi.fn(),
  bindFirstPin: vi.fn(),
  myDashboard: vi.fn(),
  myConsentGate: vi.fn(),
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
vi.mock("@/lib/profiling/pendingBaseline", () => ({
  flushPendingBaseline: vi.fn(async () => {}),
  readPendingBaseline: () => null,
}));

vi.mock("./TransitionScreen", () => ({
  TransitionScreen: ({ onDone }: { onDone: () => void }) => (
    <button onClick={onDone}>after transition</button>
  ),
}));
vi.mock("@/components/student/Profiling/ProfilingFlow", () => ({
  ProfilingFlow: ({ onDone }: { onDone: (run: string) => void }) => (
    <button onClick={() => onDone("run-1")}>after profiling</button>
  ),
}));
/*
 * The PIN screen's own contract, in one button: store, and move on only if the
 * store resolved. A rejection keeps the child here, which the real screen
 * shows as its not-saved line.
 */
vi.mock("./PinCreationScreen", () => ({
  PinCreationScreen: ({
    storePin,
    onComplete,
  }: {
    storePin: (pin: string) => Promise<void>;
    onComplete: () => void;
  }) => (
    <button
      onClick={() =>
        void storePin("1234").then(onComplete, () => {
          /* not saved: stay on the PIN step */
        })
      }
    >
      set pin
    </button>
  ),
}));
vi.mock("./YoureInScreen", () => ({
  YoureInScreen: ({
    onDone,
    deviceRemembered,
  }: {
    onDone: () => void;
    deviceRemembered: boolean;
  }) => (
    <div>
      <p>remembered:{String(deviceRemembered)}</p>
      <button onClick={onDone}>you are in</button>
    </div>
  ),
}));

const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

/** What 05 left behind for a matched child. */
const MATCHED = {
  name: "Amara",
  age: 11,
  schoolCode: "K7DQ",
  admissionNumber: "BGA/2031",
};

beforeEach(() => {
  vi.clearAllMocks();
  clearSession();
  window.localStorage.clear();
  startOnboardingDraft(MATCHED);
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
    student: {},
    assignments: [
      { status: "assigned", availableFrom: null, lesson: { id: "L-7" } },
    ],
    recentProgress: [],
  });
  myConsentGate.mockResolvedValue({ blocked: false });
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
  fireEvent.click(screen.getByRole("button", { name: "after profiling" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "set pin" }));
}

async function walkToYoureIn() {
  walkToPin();
  await screen.findByRole("button", { name: "you are in" });
}

describe("the first PIN", () => {
  it("is bound to the pair 05 matched the child on, and nothing else", async () => {
    await walkToYoureIn();

    expect(bindFirstPin).toHaveBeenCalledWith(
      { schoolCode: "K7DQ", admissionNumber: "BGA/2031" },
      "1234",
    );
  });

  it("keeps the child on the PIN step when the server refuses it", async () => {
    // Nothing celebrates, nobody is signed in, and the device remembers
    // nobody. Nor is the baseline delivered: there is no session to send it on.
    bindFirstPin.mockRejectedValue(new ApiError(422, "refused"));

    walkToPin();
    await act(async () => {});

    expect(screen.getByRole("button", { name: "set pin" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "you are in" })).toBeNull();
    expect(getSession()).toBeNull();
    expect(getRememberedProfile()).toBeNull();
  });

  it("asks for nothing when the run did not start on 05", async () => {
    // A typed URL straight into the sequence: there is nobody to attach a
    // PIN to, and guessing would attach it to the wrong child.
    startOnboardingDraft({ name: "Amara" });

    walkToPin();
    await act(async () => {});

    expect(bindFirstPin).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "you are in" })).toBeNull();
  });
});

describe("You're In, once the PIN is bound", () => {
  it("signs the child in with the session the binding returned", async () => {
    await walkToYoureIn();

    expect(getSession()).toMatchObject({ userId: "student-9", role: "student" });
  });

  it("reads their lessons once the account exists", async () => {
    await walkToYoureIn();

    await waitFor(() => expect(myDashboard).toHaveBeenCalled());
  });

  it("hands them into their first lesson, not the Lessons tab", async () => {
    await walkToYoureIn();
    await waitFor(() => expect(myDashboard).toHaveBeenCalled());
    // Let the read land before the hand-off, as the celebration's hold does.
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "you are in" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/student/lessons/L-7"),
    );
  });

  it("is remembered by the tablet, with the school code they typed", async () => {
    await walkToYoureIn();

    expect(screen.getByText("remembered:true")).toBeInTheDocument();
    expect(getRememberedProfile()).toMatchObject({
      schoolCode: "K7DQ",
      loginIdentifier: "NV-A1B2C3",
    });
  });

  it("says the tablet will not know them when no identifier came back", async () => {
    bindFirstPin.mockResolvedValue({
      userId: "student-9",
      loginIdentifier: null,
      session: {
        accessToken: "tok-s",
        tokenType: "bearer",
        expiresAt: future(),
        userId: "student-9",
        role: "student",
      },
    });

    await walkToYoureIn();

    expect(screen.getByText("remembered:false")).toBeInTheDocument();
    expect(getRememberedProfile()).toBeNull();
  });
});

describe("where the learning notice sits (D10, 1 Oct)", () => {
  it("comes after the baseline and before the PIN", () => {
    // The parent consents, the child is informed. Placed after, the notice
    // says what the activities just done were for.
    render(<ObservedInteractionSequence />);
    fireEvent.click(screen.getByRole("button", { name: "after transition" }));

    expect(screen.queryByText(/get to know how you learn/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "after profiling" }));

    expect(screen.getByText(/get to know how you learn/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "set pin" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("button", { name: "set pin" })).toBeInTheDocument();
  });
});
