import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ObservedInteractionSequence } from "./ObservedInteractionSequence";
import { PIN_SAVE_FAILED_COPY } from "./PinCreationScreen";
import { ApiError } from "@/lib/api/client";
import {
  clearEntryHandBack,
  peekEntryHandBack,
} from "@/lib/auth/entryHandBack";
import {
  clearOnboardingDraft,
  getOnboardingDraft,
  startOnboardingDraft,
} from "@/lib/auth/onboarding";
import {
  clearSignInHandoff,
  peekSignInHandoff,
} from "@/lib/auth/signInHandoff";
import {
  clearSession,
  getRememberedProfile,
  getSession,
} from "@/lib/auth/session";
import { STUDENT_PIN_LENGTH } from "@/lib/constants";

/**
 * THE FIRST PIN, THROUGH THE REAL PIN SCREEN AND THE REAL `bindFirstPin`.
 *
 * Only the wire is replaced: `POST /api/v1/student-entry/pin` (B64). What has
 * to hold either way it answers:
 *
 * - a session, and the child is signed in, celebrated and remembered;
 * - a refusal of any kind, and NONE of that happens - no "You're all set", no
 *   session, nobody remembered on the tablet - and the screen says the PIN
 *   was not saved;
 * - and in neither case is the PIN written onto whoever's token is on the
 *   tablet through `POST /auth/pin`.
 */

vi.setConfig({ testTimeout: 30_000 });

const { setPin, entrySetPin, flushPendingBaseline, push } = vi.hoisted(() => ({
  setPin: vi.fn(),
  entrySetPin: vi.fn(),
  flushPendingBaseline: vi.fn(async () => true),
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
vi.mock("@/lib/api", () => ({ authApi: { setPin } }));
vi.mock("@/lib/api/studentEntry", () => ({
  studentEntryApi: { setPin: entrySetPin },
}));
vi.mock("@/lib/profiling/pendingBaseline", () => ({
  flushPendingBaseline,
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

const PIN = "1234567".slice(0, STUDENT_PIN_LENGTH);

const SESSION = {
  userId: "student-9",
  loginIdentifier: "NV-A1B2C3",
  session: {
    accessToken: "tok-s",
    tokenType: "bearer",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-9",
    role: "student",
  },
};

const alertText = () =>
  document.querySelector('[role="alert"]')?.textContent ?? "";

/** Past the PIN screen's beat before it writes, and the write's answer. */
const toTheAnswer = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });

/** Past "You're all set", which holds for its beat before moving on. */
const pastTheBeat = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(1300);
  });

async function choosePin() {
  render(<ObservedInteractionSequence />);
  fireEvent.click(screen.getByRole("button", { name: "after transition" }));
  fireEvent.click(screen.getByRole("button", { name: "after profiling" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  for (const digit of [...PIN, ...PIN]) {
    fireEvent.click(screen.getByRole("button", { name: digit }));
  }
  await toTheAnswer();
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setPin.mockReset();
  entrySetPin.mockReset();
  push.mockReset();
  clearSignInHandoff();
  clearEntryHandBack();
  flushPendingBaseline.mockClear();
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

describe("a first PIN the server stores", () => {
  beforeEach(() => {
    entrySetPin.mockResolvedValue(SESSION);
  });

  it("is sent with the pair 05 matched, to the entry PIN route only", async () => {
    await choosePin();

    expect(entrySetPin).toHaveBeenCalledTimes(1);
    expect(entrySetPin).toHaveBeenCalledWith({
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
      pin: PIN,
    });
    // `POST /auth/pin` writes onto whoever's token is on the tablet.
    expect(setPin).not.toHaveBeenCalled();
  });

  it("is celebrated once it is stored, and the child is signed in", async () => {
    await choosePin();

    expect(screen.getByText("You're all set")).toBeInTheDocument();
    expect(alertText()).toBe("");
    expect(getSession()).toMatchObject({
      token: "tok-s",
      userId: "student-9",
      role: "student",
    });
  });

  it("delivers the baseline this run parked, to this child, and no other", async () => {
    // The run is named, so a vector the previous child on the tablet left
    // parked cannot ride on this child's new session.
    await choosePin();

    expect(flushPendingBaseline).toHaveBeenCalledTimes(1);
    expect(flushPendingBaseline).toHaveBeenCalledWith("student-9", "run-1");
  });

  it("moves on to You're In, and the tablet remembers them", async () => {
    await choosePin();
    await pastTheBeat();

    expect(screen.getByText("you are in")).toBeInTheDocument();
    expect(getRememberedProfile()).toMatchObject({
      schoolCode: "K7DQ",
      loginIdentifier: "NV-A1B2C3",
    });
  });
});

describe("a first PIN the server refuses", () => {
  /*
   * A refusal that does not name itself - no code, or a status the PIN route
   * does not declare one for - says nothing about the child, so it lands the
   * one honest way. A dropped network is in the list because it is not a save
   * either. The named refusals are below (B68).
   */
  it.each([
    ["a 422", 422],
    ["a 401", 401],
    ["a 403 with no code", 403],
    ["a 409 with no code", 409],
    ["a 500", 500],
    ["a dropped network", 0],
  ])("shows the not-saved line for %s, not a celebration", async (_, status) => {
    entrySetPin.mockRejectedValue(new ApiError(status, "refused"));

    await choosePin();

    expect(alertText()).toContain(PIN_SAVE_FAILED_COPY);
    expect(screen.queryByText("You're all set")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("invents no session and remembers nobody on the tablet", async () => {
    entrySetPin.mockRejectedValue(new ApiError(422, "refused"));

    await choosePin();
    await pastTheBeat();

    expect(getSession()).toBeNull();
    expect(getRememberedProfile()).toBeNull();
    expect(screen.queryByText(/you are in/)).toBeNull();
    // Nothing to deliver it on: the baseline stays parked.
    expect(flushPendingBaseline).not.toHaveBeenCalled();
  });

  it("never falls back to writing the PIN onto whoever is signed in", async () => {
    entrySetPin.mockRejectedValue(new ApiError(403, "refused"));

    await choosePin();

    expect(setPin).not.toHaveBeenCalled();
  });

  it("sends the same PIN again on Try again, and celebrates only when that lands", async () => {
    entrySetPin
      .mockRejectedValueOnce(new ApiError(0, "offline"))
      .mockResolvedValueOnce(SESSION);

    await choosePin();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await toTheAnswer();

    expect(entrySetPin).toHaveBeenCalledTimes(2);
    expect(entrySetPin.mock.calls[1][0]).toEqual(entrySetPin.mock.calls[0][0]);
    expect(screen.getByText("You're all set")).toBeInTheDocument();
    expect(getSession()).toMatchObject({ userId: "student-9" });
  });
});

describe("a first PIN the server refuses, and says why (B68)", () => {
  const refused = (status: number, code: string) =>
    new ApiError(status, "refused", { detail: { code, message: "said" } });

  it("pauses a throttled child (D154), keeping the PIN", async () => {
    entrySetPin.mockRejectedValue(refused(429, "too_many_attempts"));

    await choosePin();

    expect(
      screen.getByRole("heading", { name: "Let's take a moment" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Try your PIN again in a moment. No rush."),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(PIN_SAVE_FAILED_COPY);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it.each(["pin_not_cleared", "pin_already_set"])(
    "sends a child who already has a PIN (%s) to sign in, with what they typed on 05",
    async (code) => {
      entrySetPin.mockRejectedValue(refused(409, code));

      await choosePin();

      expect(push).toHaveBeenCalledWith("/auth/sign-in");
      expect(peekSignInHandoff()).toEqual({
        schoolCode: "K7DQ",
        identifier: "BGA/2031",
      });
      expect(getSession()).toBeNull();
      expect(getOnboardingDraft()).toEqual({});
    },
  );

  it("sends a pair that names nobody now back to 05's miss", async () => {
    entrySetPin.mockRejectedValue(refused(404, "entry_not_found"));

    await choosePin();

    expect(push).toHaveBeenCalledWith("/student/onboarding/school");
    expect(peekEntryHandBack()).toEqual({
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
    });
    expect(getSession()).toBeNull();
    expect(getOnboardingDraft()).toEqual({});
  });

  it.each([
    ["consent_pending", "Nevo isn't quite ready for you yet"],
    ["age_check_pending", "Nevo is sorting something out with your school"],
  ])("holds them in place for %s, as 05 would", async (code, heading) => {
    entrySetPin.mockRejectedValue(refused(403, code));

    await choosePin();

    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(alertText()).not.toContain(PIN_SAVE_FAILED_COPY);
    expect(push).not.toHaveBeenCalled();
    expect(getSession()).toBeNull();
    expect(getRememberedProfile()).toBeNull();
    expect(flushPendingBaseline).not.toHaveBeenCalled();
  });
});

describe("a run that did not start on 05", () => {
  it("asks nothing, and says the PIN was not saved", async () => {
    // A typed URL straight into the sequence: there is nobody to attach a
    // PIN to, and guessing would attach it to the wrong child.
    startOnboardingDraft({ name: "Amara" });

    await choosePin();

    expect(entrySetPin).not.toHaveBeenCalled();
    expect(alertText()).toContain(PIN_SAVE_FAILED_COPY);
    expect(getSession()).toBeNull();
  });
});
