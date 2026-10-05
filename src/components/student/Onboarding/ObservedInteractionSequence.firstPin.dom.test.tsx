import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ObservedInteractionSequence } from "./ObservedInteractionSequence";
import { PIN_NOT_SAVED_COPY } from "./PinCreationScreen";
import {
  clearOnboardingDraft,
  startOnboardingDraft,
} from "@/lib/auth/onboarding";
import {
  clearSession,
  getRememberedProfile,
  getSession,
} from "@/lib/auth/session";
import { STUDENT_PIN_LENGTH } from "@/lib/constants";

/**
 * THE FIRST PIN CANNOT BE SAVED YET, AND THE SCREEN SAYS SO.
 *
 * 05 Entry's lookup returns no session and no token, so nothing can bind the
 * PIN a child chooses to the child 05 found (backend, B64). The one thing
 * that must not happen while that is true is a celebration: "You're all set"
 * over a PIN the next sign-in would refuse, a session invented to cover the
 * gap, or the PIN written onto whoever's token is on the tablet.
 *
 * So this walks the REAL PIN screen against the REAL `bindFirstPin` and holds
 * all three down. When B64 lands this file is expected to change - the stub
 * is the only thing that makes it pass.
 */

vi.setConfig({ testTimeout: 30_000 });

const { setPin } = vi.hoisted(() => ({ setPin: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ user: null }),
  useSignals: () => ({ trackEvent: vi.fn(), flush: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ authApi: { setPin } }));
vi.mock("@/lib/profiling/pendingBaseline", () => ({
  flushPendingBaseline: vi.fn(async () => true),
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

const PIN = "1234567".slice(0, STUDENT_PIN_LENGTH);

const alertText = () =>
  document.querySelector('[role="alert"]')?.textContent ?? "";

/** Past the PIN screen's beat before it writes. */
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });

async function choosePin() {
  render(<ObservedInteractionSequence />);
  fireEvent.click(screen.getByRole("button", { name: "after transition" }));
  fireEvent.click(screen.getByRole("button", { name: "after profiling" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  for (const digit of [...PIN, ...PIN]) {
    fireEvent.click(screen.getByRole("button", { name: digit }));
  }
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setPin.mockReset();
  clearSession();
  window.localStorage.clear();
  startOnboardingDraft({
    name: "Amara",
    schoolCode: "K7DQ",
    admissionNumber: "BGA/2031",
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  clearSession();
  window.localStorage.clear();
  clearOnboardingDraft();
});

describe("a first PIN while backend has no way to bind it (B64)", () => {
  it("shows the not-saved line, not a celebration", async () => {
    await choosePin();

    expect(alertText()).toBe(PIN_NOT_SAVED_COPY);
    expect(screen.queryByText("You're all set")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("invents no session and remembers nobody on the tablet", async () => {
    await choosePin();

    expect(getSession()).toBeNull();
    expect(getRememberedProfile()).toBeNull();
  });

  it("never writes the PIN onto whoever is signed in", async () => {
    // `POST /auth/pin` with a Bearer token sets the PIN on THAT account. On a
    // shared tablet it may be the previous child's.
    await choosePin();

    expect(setPin).not.toHaveBeenCalled();
  });

  it("fails the same honest way on Try again", async () => {
    await choosePin();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await settle();

    expect(alertText()).toBe(PIN_NOT_SAVED_COPY);
    expect(screen.queryByText("You're all set")).toBeNull();
  });
});
