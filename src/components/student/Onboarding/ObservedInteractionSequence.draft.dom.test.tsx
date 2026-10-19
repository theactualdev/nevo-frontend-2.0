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
  getSession,
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

const { entrySetPin, push, replace, enterFirstLesson } = vi.hoisted(() => ({
  entrySetPin: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  enterFirstLesson: vi.fn(async () => {}),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn() }),
}));
vi.mock("@/lib/auth/entryGate", () => ({ enterFirstLesson }));
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
  YoureInScreen: ({ onDone }: { onDone: () => void }) => (
    <button onClick={onDone}>you are in</button>
  ),
}));
vi.mock("@/components/student/Profiling/DomainProbeModule", () => ({
  DomainProbeStep: ({ onDone }: { onDone: (outcome: string) => void }) => (
    <button onClick={() => onDone("sat")}>module four</button>
  ),
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
  replace.mockReset();
  enterFirstLesson.mockClear();
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
    // Kept, with the account the PIN made, until the run ends at You're
    // In: a reload before then resumes rather than starting again (19 Oct).
    expect(getOnboardingDraft()).toMatchObject({
      schoolCode: "K7DQ",
      userId: "student-9",
    });
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

/*
 * A SESSION THAT IS NOT THIS RUN'S ENDS AS THE RUN OPENS (19 Oct
 * browser-storage audit): otherwise the run's onboarding and profiling
 * streams, and the consent read its capture waits on, go up as the last
 * child. An SSO child's own session, and the one this run's first PIN made,
 * are kept.
 */
describe("the session the sequence opens on", () => {
  it("is ended when it is another child's", () => {
    leftBehind();

    render(<ObservedInteractionSequence />);

    expect(getSession()).toBeNull();
  });

  it("is kept when it is an SSO child's own, who starts here signed in", () => {
    setSession({
      token: "tok-sso",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      userId: "sso-child",
      role: "student",
      method: "sso",
    });

    render(<ObservedInteractionSequence />);

    expect(getSession()?.userId).toBe("sso-child");
  });

  it("is kept when this run's own first PIN made it, through a reload", async () => {
    render(<ObservedInteractionSequence />);
    fireEvent.click(screen.getByRole("button", { name: "after transition" }));
    fireEvent.click(screen.getByRole("button", { name: "after profiling" }));
    await choosePin();
    expect(getOnboardingDraft().userId).toBe("student-9");

    // Reloaded before the run had finished with its draft.
    cleanup();
    render(<ObservedInteractionSequence />);

    expect(getSession()?.userId).toBe("student-9");
    expect(replace).toHaveBeenCalledWith("/student/onboarding/continue");
  });
});

/*
 * A RELOAD AFTER THE FIRST PIN SIGNED THE NEW CHILD OUT (19 Oct, a
 * regression in aa7b2db). Remembering the child on the PIN screen cleared the
 * whole draft - the account the PIN made with it - so a reload during Module
 * 4, Complete or You're In found a session the draft did not name, ended the
 * child's own new session, and left them signed out on an empty 05. The
 * draft now lasts until You're In, and a reload after the PIN keeps the
 * session and resumes from what the server holds.
 */
describe("a reload after the first PIN", () => {
  async function pastThePin() {
    render(<ObservedInteractionSequence />);
    fireEvent.click(screen.getByRole("button", { name: "after transition" }));
    fireEvent.click(screen.getByRole("button", { name: "after profiling" }));
    await choosePin();
    // Past "You're all set": the PIN screen has remembered them.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(screen.getByText("module four")).toBeInTheDocument();
  }

  it("during Module 4 keeps the child signed in and resumes", async () => {
    await pastThePin();

    cleanup();
    render(<ObservedInteractionSequence />);
    await settle();

    expect(getSession()?.userId).toBe("student-9");
    expect(replace).toHaveBeenCalledWith("/student/onboarding/continue");
    expect(replace).not.toHaveBeenCalledWith("/student/onboarding/school");
    // The resume needs none of the draft, and it goes as the run is handed on.
    expect(getOnboardingDraft()).toEqual({});
  });

  it("on Complete or You're In keeps them signed in and resumes too", async () => {
    await pastThePin();
    fireEvent.click(screen.getByRole("button", { name: "module four" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Let's finish setting up" }),
    );
    expect(screen.getByRole("button", { name: "you are in" })).toBeInTheDocument();

    cleanup();
    render(<ObservedInteractionSequence />);
    await settle();

    expect(getSession()?.userId).toBe("student-9");
    expect(replace).toHaveBeenCalledWith("/student/onboarding/continue");
  });

  it("is no longer possible once You're In has ended the run: the draft goes there", async () => {
    await pastThePin();
    fireEvent.click(screen.getByRole("button", { name: "module four" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Let's finish setting up" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "you are in" }));

    expect(getOnboardingDraft()).toEqual({});
    expect(enterFirstLesson).toHaveBeenCalledTimes(1);
  });
});
