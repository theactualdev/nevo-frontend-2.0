import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ObservedInteractionSequence } from "./ObservedInteractionSequence";
// Loaded as on every page: a session ending is what clears the leftovers.
import "@/context/AuthContext";
import {
  clearOnboardingDraft,
  getOnboardingDraft,
  startOnboardingDraft,
} from "@/lib/auth/onboarding";
import {
  clearSession,
  getRememberedProfile,
  setSession,
} from "@/lib/auth/session";
import { STUDENT_PIN_LENGTH } from "@/lib/constants";

/**
 * THE DRAFT STAYS WITH THE CHILD WHO IS USING IT (19 Oct browser-storage
 * audit).
 *
 * A session ending now takes the onboarding draft - the school code, Student
 * ID, first name and 05's consent answer - so a child who walked away no
 * longer leaves them in the tab. But a child mid-run has no session of their
 * own to end, and two endings happen to them that are not theirs to lose it
 * to: the session the last child left on the tablet lapsing under them, and
 * their own first PIN replacing that session with theirs. Through both, the
 * PIN must still go up against the pair 05 matched, and the tablet must
 * still remember them by name.
 */

vi.setConfig({ testTimeout: 30_000 });

const { entrySetPin, push } = vi.hoisted(() => ({
  entrySetPin: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ user: null }),
  useSignals: () => ({ trackEvent: vi.fn(), flush: vi.fn() }),
}));
vi.mock("@/hooks/useNextLessonHref", () => ({
  useNextLessonHref: () => "/student/lessons",
}));
vi.mock("@/lib/api/studentEntry", () => ({
  studentEntryApi: { setPin: entrySetPin },
}));
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
vi.mock("./YoureInScreen", () => ({
  YoureInScreen: () => <p>you are in</p>,
}));
vi.mock("@/components/student/Profiling/DomainProbeModule", () => ({
  DomainProbeStep: () => <p>module four</p>,
}));

const PIN = "1234567".slice(0, STUDENT_PIN_LENGTH);
const MATCHED = {
  name: "Amara",
  schoolCode: "K7DQ",
  admissionNumber: "BGA/2031",
  consent: "given" as const,
};

/** A session the last child on the tablet never ended. */
const leftBehind = () =>
  setSession({
    token: "tok-last",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "last-child",
    role: "student",
  });

const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

async function choosePin() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  for (const digit of [...PIN, ...PIN]) {
    fireEvent.click(screen.getByRole("button", { name: digit }));
  }
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  entrySetPin.mockReset();
  entrySetPin.mockResolvedValue({
    userId: "student-9",
    loginIdentifier: "NV-A1B2C3",
    session: {
      accessToken: "tok-s",
      tokenType: "bearer",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      userId: "student-9",
      role: "student",
    },
  });
  push.mockReset();
  clearSession();
  window.localStorage.clear();
  startOnboardingDraft(MATCHED);
});

afterEach(async () => {
  cleanup();
  clearSession();
  await settle();
  vi.useRealTimers();
  window.localStorage.clear();
  clearOnboardingDraft();
});

describe("the onboarding draft, through endings that are not the child's", () => {
  it("survives the last child's session ending mid-run, and the PIN goes against 05's pair", async () => {
    leftBehind();
    render(<ObservedInteractionSequence />);
    fireEvent.click(screen.getByRole("button", { name: "after transition" }));
    fireEvent.click(screen.getByRole("button", { name: "after profiling" }));

    clearSession();
    await settle();
    expect(getOnboardingDraft()).toEqual(MATCHED);

    await choosePin();
    expect(entrySetPin).toHaveBeenCalledWith({
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
      pin: PIN,
    });
  });

  it("survives this child's own first PIN replacing that session, so the tablet remembers them", async () => {
    leftBehind();
    render(<ObservedInteractionSequence />);
    fireEvent.click(screen.getByRole("button", { name: "after transition" }));
    fireEvent.click(screen.getByRole("button", { name: "after profiling" }));

    await choosePin();
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });

    expect(getRememberedProfile()).toMatchObject({
      schoolCode: "K7DQ",
      loginIdentifier: "NV-A1B2C3",
      displayName: "Amara",
    });
    // And the run cleared it itself, at its end, as it always has.
    expect(getOnboardingDraft()).toEqual({});
  });

  it("goes with a later session's ending once the run is no longer open", async () => {
    const { unmount } = render(<ObservedInteractionSequence />);
    unmount();
    leftBehind();

    clearSession();
    await settle();

    expect(getOnboardingDraft()).toEqual({});
  });
});
