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
  YoureInScreen: ({ onDone }: { onDone: () => void }) => (
    <button onClick={onDone}>you are in</button>
  ),
}));
/*
 * Module 4 in two buttons: it was sat, or it had nothing to ask. The real
 * module, against the real probe contract, is `DomainProbeModule.dom.test`.
 */
vi.mock("@/components/student/Profiling/DomainProbeModule", () => ({
  DomainProbeStep: ({
    onDone,
    stretchFirst,
  }: {
    onDone: (outcome: "sat" | "absent") => void;
    stretchFirst: boolean;
  }) => (
    <div data-stretch-first={String(stretchFirst)}>
      <button onClick={() => onDone("sat")}>after probe</button>
      <button onClick={() => onDone("absent")}>nothing to probe</button>
    </div>
  ),
}));

const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

/** What 05 left behind for a matched child. */
const MATCHED = {
  name: "Amara",
  ageBand: "upper_primary",
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
  fireEvent.click(await screen.findByRole("button", { name: "after probe" }));
  fireEvent.click(screen.getByRole("button", { name: "Let's finish setting up" }));
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

    expect(getRememberedProfile()).toMatchObject({
      schoolCode: "K7DQ",
      loginIdentifier: "NV-A1B2C3",
    });
  });

  it("goes on to You're In, remembered by nobody, when no identifier came back (D71)", async () => {
    // You're In no longer says the tablet will not know them: "a line about
    // asking for help implies something has gone wrong at the exact moment
    // nothing has." The device still refuses to remember them.
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

    expect(screen.getByRole("button", { name: "you are in" })).toBeInTheDocument();
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

describe("Module 4, the domain probe, as Lydia ruled 17 Oct (SCRUM-244)", () => {
  it("runs once the PIN has made the account, before Complete and You're In", async () => {
    // The server asks it and needs the child's account to: a school-code
    // child has none until the PIN is stored.
    render(<ObservedInteractionSequence />);
    fireEvent.click(screen.getByRole("button", { name: "after transition" }));
    fireEvent.click(screen.getByRole("button", { name: "after profiling" }));
    expect(screen.queryByRole("button", { name: "after probe" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.queryByRole("button", { name: "after probe" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "set pin" }));

    const probe = await screen.findByRole("button", { name: "after probe" });
    expect(getSession()).toMatchObject({ userId: "student-9" });
    // A module has just ended two screens back: the stretch comes first.
    expect(probe.parentElement).toHaveAttribute("data-stretch-first", "true");
    expect(screen.queryByRole("button", { name: "you are in" })).toBeNull();

    fireEvent.click(probe);
    expect(screen.getByText("All set. Nevo is ready for you.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "you are in" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Let's finish setting up" }));

    expect(screen.getByRole("button", { name: "you are in" })).toBeInTheDocument();
  });

  it("maps all four on Complete when the child sat it", async () => {
    walkToPin();
    fireEvent.click(await screen.findByRole("button", { name: "after probe" }));

    const map = screen.getByRole("progressbar");
    expect(map).toHaveAttribute("aria-valuemax", "4");
    expect(map).toHaveAttribute("aria-valuenow", "4");
  });

  it("maps the three the child did when it had nothing to ask (design, 9 Oct)", async () => {
    // "A child who will do three sees three segments." Nothing fills a stop
    // nobody reached.
    walkToPin();
    fireEvent.click(
      await screen.findByRole("button", { name: "nothing to probe" }),
    );

    const map = screen.getByRole("progressbar");
    expect(map).toHaveAttribute("aria-valuemax", "3");
    expect(map).toHaveAttribute("aria-valuenow", "3");
  });
});

describe("which of its screens sit in the tablet frame (D207)", () => {
  /*
   * The Transition and the profiling run are pre-login screens, drawn on the
   * 768 x 1024 canvas, and letterbox at desktop width. The notice, PIN
   * creation and You're In are drawn on the signed-in canvas with desktop
   * compositions of their own, so the frame comes off for them.
   */
  const framed = (name: string | RegExp) =>
    screen
      .getAllByText(name)[0]
      .closest("[data-nevo-letterbox-frame]") !== null;

  it("frames the Transition and the profiling run, and nothing else", async () => {
    render(<ObservedInteractionSequence />);
    expect(framed("after transition")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "after transition" }));
    expect(framed("after profiling")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "after profiling" }));
    expect(framed(/get to know how you learn/i)).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(framed("set pin")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "set pin" }));
    // Module 4 and Complete are the profiling run's screens, wherever they fall.
    await screen.findByRole("button", { name: "after probe" });
    expect(framed("after probe")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "after probe" }));
    expect(framed("All set. Nevo is ready for you.")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Let's finish setting up" }));
    await screen.findByRole("button", { name: "you are in" });
    expect(framed("you are in")).toBe(false);
    expect(document.querySelector("[data-nevo-letterbox]")).toBeNull();
  });
});
