import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ReturningSignInScreen } from "./ReturningSignInScreen";
import { ApiError } from "@/lib/api/client";
import * as authApiModule from "@/lib/api";
import { clearSession, getRememberedProfile } from "@/lib/auth/session";
import {
  clearSignInHandoff,
  handSignInOver,
  peekSignInHandoff,
} from "@/lib/auth/signInHandoff";

/**
 * The door that was not there.
 *
 * A device remembers exactly one child. When it remembered nobody - a cleared
 * browser, a new tablet, a reimaged school laptop, or a shared tablet where
 * another child onboarded after them - `/auth/login` sent the child into
 * ONBOARDING, which creates a second account: new identifier, no history, and a
 * class they may not be able to rejoin. Nothing told them or their teacher.
 *
 * So the load-bearing assertions here are not "the form submits". They are:
 * the device is REMEMBERED afterwards (or the child is back here tomorrow), the
 * fields are KEPT on a failure (or a child retypes a username they were read
 * out), and a paused account is never rendered as a typing mistake.
 */

/*
 * The default 5s timeout is not enough for this file, and the reason is worth
 * writing down rather than being rediscovered as a flake.
 *
 * The mock below spreads the REAL `@/lib/api` barrel, which imports every api
 * module in the app. That costs several seconds on a cold worker - fine in
 * isolation, where it happens before the first test is timed, but in a full-suite
 * run the worker is contended and the FIRST test wears it. It timed out at
 * 6.0s against a 5s limit, and every later test in the file then failed with
 * "Unable to find an accessible element" because cleanup never ran.
 *
 * Spreading the real barrel is still right - a hand-written one leaves every
 * other export undefined and kills the worker outright with SIGABRT. So the
 * cost is paid deliberately, not designed away.
 */
vi.setConfig({ testTimeout: 30_000 });

const { loginPin, signIn } = vi.hoisted(() => ({
  loginPin: vi.fn(),
  signIn: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, authApi: { ...actual.authApi, loginPin } };
});
vi.mock("@/hooks", () => ({ useAuth: () => ({ signIn }) }));

const { me } = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock("@/lib/api/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/users")>();
  return { ...actual, usersApi: { ...actual.usersApi, me } };
});

/*
 * The consent gate this door now resolves before landing anywhere. Mocked at
 * `@/lib/api/consents` rather than through the barrel, because `entryGate`
 * imports the module directly - mocking the barrel would leave the real one in
 * place and the assertion would pass through the failure branch instead of the
 * branch it names.
 */
const { myConsentGate } = vi.hoisted(() => ({ myConsentGate: vi.fn() }));
vi.mock("@/lib/api/consents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/consents")>();
  return { ...actual, consentsApi: { ...actual.consentsApi, myConsentGate } };
});

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

const SESSION = {
  accessToken: "tok",
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  userId: "student-1",
  role: "student",
};

/** The 401 body FastAPI actually sends. */
const refusal = (code: string) =>
  new ApiError(401, "Unauthorized", { detail: { code, message: "no" } });

/** The field the PIN boxes are a picture of; focusing it docks the pad. */
const pinInput = () =>
  document.querySelector(
    'input[aria-labelledby="returning-pin-label"]',
  ) as HTMLInputElement;

function fill({ school = "751A1136", user = "amara.k" } = {}) {
  const [schoolField, userField] = screen.getAllByRole("textbox");
  fireEvent.change(schoolField, { target: { value: school } });
  fireEvent.change(userField, { target: { value: user } });
  // The pad is focus-driven now (ruling D): tap the boxes, then the keys.
  act(() => pinInput().focus());
  for (const d of ["1", "2", "3", "4"]) {
    fireEvent.click(screen.getByRole("button", { name: d }));
  }
}

const signInNow = async () => {
  fireEvent.click(screen.getByRole("button", { name: "That's me" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  loginPin.mockReset();
  signIn.mockReset();
  push.mockReset();
  me.mockReset();
  // Most cases do not care who the child turns out to be; the ones that do set
  // their own. A never-settling default keeps the name read OUT of the way, so
  // a test that does not mention it cannot accidentally depend on it.
  me.mockReturnValue(new Promise(() => {}));
  myConsentGate.mockReset();
  // Consent in, unless a test says otherwise. A door that held everybody would
  // make every other assertion here pass for the wrong reason.
  myConsentGate.mockResolvedValue({
    studentId: "student-1",
    granted: true,
    blocked: false,
    requiredType: "data_processing",
    status: "confirmed",
  });
  clearSession();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("ReturningSignInScreen — signing back in", () => {
  it("sends exactly what the contract takes", async () => {
    loginPin.mockResolvedValue(SESSION);
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    // `PinLoginRequest` since 1 Oct. `loginIdentifier` only worked because the
    // server still took it as an alias.
    expect(loginPin).toHaveBeenCalledWith({
      schoolCode: "751A1136",
      admissionNumber: "amara.k",
      pin: "1234",
    });
  });

  it("sends a Student ID as long as the contract takes, uncut", async () => {
    // `admissionNumber` is 1-60. The field stopped at 50, the old
    // identifier's cap, so a long ID handed over from 05 was sent short.
    const long = "S".repeat(60);
    loginPin.mockResolvedValue(SESSION);
    handSignInOver({ schoolCode: "K7DQ", identifier: long });
    render(<ReturningSignInScreen />);
    act(() => pinInput().focus());
    for (const d of ["1", "2", "3", "4"]) {
      fireEvent.click(screen.getByRole("button", { name: d }));
    }

    await signInNow();

    expect(loginPin).toHaveBeenCalledWith(
      expect.objectContaining({ admissionNumber: long }),
    );
    clearSignInHandoff();
  });

  it("remembers the device, so tomorrow is one tap", async () => {
    // THE WHOLE POINT. Without this the child is back on this form every
    // morning, and the PIN unlock screen never has a profile to unlock.
    loginPin.mockResolvedValue(SESSION);
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    expect(getRememberedProfile()).toMatchObject({
      schoolCode: "751A1136",
      loginIdentifier: "amara.k",
    });
  });

  it("does not stay on the form once it has worked", async () => {
    loginPin.mockResolvedValue(SESSION);
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    // The form is headed "Welcome back" too, so the done state is told apart
    // by its own line.
    expect(screen.getByText(/Taking you to your lessons/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "That's me" })).toBeNull();
  });

  it("goes where the child was headed, not always to the dashboard", async () => {
    // The proxy bounces a signed-out child off the route they wanted; losing it
    // drops them on Home having asked for a lesson.
    loginPin.mockResolvedValue(SESSION);
    render(<ReturningSignInScreen next="/student/lessons/frac-3" />);
    fill();
    await signInNow();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(push).toHaveBeenCalledWith("/student/lessons/frac-3");
  });

  it("holds a child the server says may not proceed, wherever they were headed", async () => {
    /*
     * Design, 23 Sep: the gate is on the child's consent state, not the route
     * they arrived by, and PIN sign-in is an entry path. A child in the same
     * state meets the same screen whichever door they use.
     *
     * The destination they ASKED for is the interesting part: being held has to
     * beat a deep link, or a bookmarked lesson walks straight past the gate.
     */
    loginPin.mockResolvedValue(SESSION);
    myConsentGate.mockResolvedValue({
      studentId: "student-1",
      granted: false,
      blocked: true,
      requiredType: "data_processing",
      status: "pending",
    });
    render(<ReturningSignInScreen next="/student/lessons/frac-3" />);
    fill();
    await signInNow();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(push).toHaveBeenCalledWith("/student/waiting");
    expect(push).not.toHaveBeenCalledWith("/student/lessons/frac-3");
  });

  it("holds a child whose consent was withdrawn on 00e, not 00d (D117)", async () => {
    loginPin.mockResolvedValue(SESSION);
    myConsentGate.mockResolvedValue({
      studentId: "student-1",
      granted: false,
      blocked: true,
      requiredType: "data_processing",
      status: "withdrawn",
    });
    render(<ReturningSignInScreen next="/student/lessons/frac-3" />);
    fill();

    await signInNow();

    expect(push).toHaveBeenCalledWith("/student/unavailable");
    expect(push).not.toHaveBeenCalledWith("/student/waiting");
    expect(screen.queryByText(/Taking you to your lessons/)).toBeNull();
  });

  it("holds a child whose consent could not be read, rather than letting them in (D69)", async () => {
    /*
     * "A check that cannot complete must not leave the door open. If the
     * consent lookup or the account creation fails, the child does not
     * proceed. Today they do." This door used to go on to the lesson.
     */
    loginPin.mockResolvedValue(SESSION);
    myConsentGate.mockRejectedValue(new ApiError(503, "Service Unavailable"));
    render(<ReturningSignInScreen next="/student/lessons/frac-3" />);
    fill();

    await signInNow();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(push).toHaveBeenCalledWith(
      "/student/unchecked?next=%2Fstudent%2Flessons%2Ffrac-3",
    );
    expect(push).not.toHaveBeenCalledWith("/student/lessons/frac-3");
    // Straight there: "Taking you to your lessons" would not be true.
    expect(screen.queryByText(/Taking you to your lessons/)).toBeNull();
  });

  it("signs them in before it asks, so a held child is still signed in", async () => {
    // Being held is not a failed sign-in. They proved who they are; the
    // answer to "may they start" is a different question, and the session has
    // to exist for it to be askable at all - `consent-gate` is `students/me`.
    loginPin.mockResolvedValue(SESSION);
    myConsentGate.mockResolvedValue({
      studentId: "student-1",
      granted: false,
      blocked: true,
      requiredType: "data_processing",
      status: "pending",
    });
    render(<ReturningSignInScreen />);
    fill();
    await signInNow();

    expect(signIn).toHaveBeenCalled();
    expect(getRememberedProfile()).not.toBeNull();
  });

  it("will not submit until all three are there", () => {
    render(<ReturningSignInScreen />);
    const [schoolField] = screen.getAllByRole("textbox");
    fireEvent.change(schoolField, { target: { value: "751A1136" } });

    fireEvent.click(screen.getByRole("button", { name: "That's me" }));

    expect(loginPin).not.toHaveBeenCalled();
  });
});

describe("ReturningSignInScreen — when it does not work", () => {
  it("keeps the code and username, and clears only the PIN", async () => {
    // From the frame: "fields stay filled". A child has just been read a school
    // code and a username by their teacher; making them ask again is how you
    // lose them at the last step.
    loginPin.mockRejectedValue(refusal("authentication_failed"));
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    const [schoolField, userField] = screen.getAllByRole("textbox");
    expect(schoolField).toHaveValue("751A1136");
    expect(userField).toHaveValue("amara.k");
    expect(screen.getByText(/didn't match/)).toBeVisible();
  });

  it("tells a paused child their account is on pause", async () => {
    // Same distinction as the PIN unlock. Here it matters more: this child has
    // just typed three things correctly.
    loginPin.mockRejectedValue(refusal("account_paused"));
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    expect(screen.getByText(/Your Nevo account is on pause/)).toBeVisible();
    expect(screen.queryByText(/didn't match/)).toBeNull();
    // D52: and a way back to the picker for whoever is next on this tablet.
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/auth/login",
    );
  });

  it("tells a removed child their account is closed on 28d, not on pause and not a wrong PIN (D53, D116)", async () => {
    loginPin.mockRejectedValue(refusal("account_closed"));
    render(<ReturningSignInScreen next="/student/lessons/frac-3" />);
    fill();

    await signInNow();

    expect(
      screen.getByRole("heading", { level: 1, name: "Your account is closed" }),
    ).toBeVisible();
    expect(screen.queryByText(/on pause|didn't match/)).toBeNull();
    // 28d is terminal: "no sign-in route, because offering a way back in
    // would be cruel." Its one line is for the next child (7 Oct), so it goes
    // to the picker and carries nothing of where this child was going.
    expect(
      screen.getByRole("link", { name: "Someone else using this device?" }),
    ).toHaveAttribute("href", "/auth/login");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("does not remember a device it failed to sign into", async () => {
    // Remembering here would send the child to a PIN unlock for an account they
    // never proved was theirs.
    loginPin.mockRejectedValue(refusal("authentication_failed"));
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    expect(getRememberedProfile()).toBeNull();
  });

  it("blames itself for a server fault", async () => {
    loginPin.mockRejectedValue(new ApiError(500, "Server Error"));
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    // 28c-6 (D68): the same words on every PIN door that shares the box.
    expect(
      screen.getByText("Something went wrong on our side. Try again."),
    ).toBeVisible();
  });

  it("pauses a rate-limited child's PIN, never saying they typed it wrong (D154)", async () => {
    loginPin.mockRejectedValue(refusal("too_many_attempts"));
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    // D154 (9 Oct) "holds everywhere a child enters a PIN"; it replaced
    // 28c-7's wait line in this box.
    expect(
      screen.getByRole("heading", { name: "Let's take a moment" }),
    ).toBeVisible();
    expect(
      screen.getByText("Try your PIN again in a moment. No rush."),
    ).toBeVisible();
    expect(screen.queryByText(/didn.t match|wait a moment before/)).toBeNull();
    // The PIN boxes held, the fields as typed, and no button to press again.
    expect(document.querySelector("[data-held-pin]")).not.toBeNull();
    expect(screen.queryByLabelText("Your PIN")).toBeNull();
    expect(screen.queryByRole("button", { name: /That's me|Try again/ })).toBeNull();
    expect(screen.getAllByRole("textbox")[1]).toHaveValue("amara.k");
    // Forgot PIN, raised, says who clears a PIN and leads back to a door.
    expect(screen.getByRole("link", { name: "Forgot PIN?" })).toHaveAttribute(
      "href",
      "/auth/forgot-pin",
    );
  });
});

describe("ReturningSignInScreen — the child who really is new", () => {
  it("still has a way to create an account", async () => {
    // `/auth/login` used to send everyone with no remembered profile into
    // onboarding. Now it comes here, so this is the only remaining route to
    // onboarding - the landing page has no student door at all.
    render(<ReturningSignInScreen />);

    fireEvent.click(screen.getByRole("button", { name: /new to Nevo/i }));

    expect(push).toHaveBeenCalledWith("/student/onboarding");
  });
});

/**
 * A child was renamed to their own username, permanently.
 *
 * This screen had no way to learn a name - a PIN login returns a session, not
 * a profile - so it stored the LOGIN IDENTIFIER as the display name. From then
 * on the lock screen read "Welcome back, amara.k", and so did every surface
 * that reads the remembered profile.
 *
 * Two things are wrong with that, and the second is the serious one:
 *
 *   1. On a product for SEND learners, on the one screen written to feel
 *      personal, the child is addressed by a machine-generated string.
 *   2. That string is half a credential. It sits on a PRE-AUTHENTICATION
 *      screen, next to a school code every child in the building knows, where
 *      anyone who picks the tablet up can read it. The only thing still
 *      standing between them and the account is a six-digit PIN.
 */
describe("what the device remembers a child as", () => {
  const ME = {
    userId: "student-1",
    role: "student",
    firstName: "Amara",
    lastName: "Kalu",
    displayName: "Amara Kalu",
    email: null,
    school: null,
  };

  /** Let the un-awaited name read settle, as it does a moment after sign-in. */
  const nameToLand = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
  };

  it("never stores the username as the child's name", async () => {
    // THE DEFECT. Everything else in this block is a consequence of it.
    loginPin.mockResolvedValue(SESSION);
    me.mockRejectedValue(new ApiError(500, "Server"));
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();
    await nameToLand();

    expect(getRememberedProfile()?.displayName).not.toBe("amara.k");
  });

  it("learns their real first name and remembers that", async () => {
    loginPin.mockResolvedValue(SESSION);
    me.mockResolvedValue(ME);
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();
    await nameToLand();

    expect(getRememberedProfile()?.displayName).toBe("Amara");
  });

  it("keeps the surname off the lock screen", async () => {
    // First name only. The lock screen is pre-authentication and visible to
    // whoever is holding the tablet.
    loginPin.mockResolvedValue(SESSION);
    me.mockResolvedValue(ME);
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();
    await nameToLand();

    expect(getRememberedProfile()?.displayName).not.toMatch(/Kalu/);
  });

  it("remembers them namelessly when it cannot find out", async () => {
    /*
     * The honest state, and the one the username was papering over. A device
     * that does not know who this is says so, rather than falling back to a
     * string that identifies the account.
     */
    loginPin.mockResolvedValue(SESSION);
    me.mockRejectedValue(new ApiError(0, "Network"));
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();
    await nameToLand();

    const profile = getRememberedProfile();
    expect(profile).not.toBeNull();
    expect(profile?.displayName).toBeUndefined();
  });

  it("still remembers the device when the name read fails", async () => {
    // The sign-in must survive it. Losing the remembered device would put the
    // child back on this form tomorrow, which is the bug this screen exists
    // to fix.
    loginPin.mockResolvedValue(SESSION);
    me.mockRejectedValue(new ApiError(0, "Network"));
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();
    await nameToLand();

    expect(getRememberedProfile()).toMatchObject({
      loginIdentifier: "amara.k",
    });
  });

  it("does not make the child wait on the name read", async () => {
    /*
     * The first version of this fix awaited `users/me` before remembering
     * anything, which put a profile read between a child and the door they had
     * just unlocked. On a slow connection they sat on a form they had already
     * passed. Two of this file's existing tests caught it.
     *
     * `me` never settles here, which is the pathological case.
     */
    loginPin.mockResolvedValue(SESSION);
    me.mockReturnValue(new Promise(() => {}));
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    expect(getRememberedProfile()).not.toBeNull();
    expect(signIn).toHaveBeenCalled();
  });

  it("does not pass the username into the session as a name", async () => {
    // The same leak by the other route: `AuthUser.name` feeds the shell.
    loginPin.mockResolvedValue(SESSION);
    me.mockRejectedValue(new ApiError(0, "Network"));
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    expect(signIn).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "amara.k" }),
    );
  });

  it("never greets the child by their username", async () => {
    /*
     * The same leak on the very next screen. The success moment read
     * "Welcome back, amara.k" - the login identifier, on a shared tablet -
     * even though the device store had stopped keeping it.
     */
    loginPin.mockResolvedValue(SESSION);
    me.mockReturnValue(new Promise(() => {}));
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(document.body.textContent).not.toMatch(/amara\.k/);
  });

  it("greets them by first name once the account answers", async () => {
    loginPin.mockResolvedValue(SESSION);
    me.mockResolvedValue(ME);
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();
    await nameToLand();

    expect(
      screen.getByRole("heading", { name: "Welcome back, Amara" }),
    ).toBeVisible();
  });

  it("records which account this entry is, so a signed-in screen can find it", async () => {
    loginPin.mockResolvedValue(SESSION);
    me.mockReturnValue(new Promise(() => {}));
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    expect(getRememberedProfile()?.userId).toBe("student-1");
  });
});

describe("signing in on a device with a real keyboard", () => {
  /**
   * THE PIN ROW HAD NO INPUT OF ANY KIND.
   *
   * The boxes are drawn from `digits`; the school code and username above are
   * real fields. So a keyboard carried a child as far as the PIN and then met
   * six boxes with nothing behind them, and the Nevo pad - the only way to fill
   * them - hides itself on a device with a real keyboard. This screen could not
   * be completed on a laptop at all.
   *
   * It is the screen a child reaches on an UNKNOWN device, which is exactly
   * where a borrowed laptop turns up, and the only route left to an account
   * when a device remembers nobody.
   */
  const pinField = () =>
    document.querySelector(
      'input[aria-labelledby="returning-pin-label"]',
    ) as HTMLInputElement;

  const filledBoxes = () =>
    document.querySelectorAll("span.rounded-full.bg-nevo-near-black").length;

  it("has a PIN field a keyboard can reach at all", () => {
    render(<ReturningSignInScreen />);

    expect(pinField()).not.toBeNull();
  });

  it("fills the boxes from typed digits", () => {
    render(<ReturningSignInScreen />);

    fireEvent.change(pinField(), { target: { value: "1" } });
    fireEvent.change(pinField(), { target: { value: "2" } });

    expect(filledBoxes()).toBe(2);
  });

  it("takes backspace as a correction", () => {
    render(<ReturningSignInScreen />);
    for (const d of ["1", "2", "3"]) {
      fireEvent.change(pinField(), { target: { value: d } });
    }

    fireEvent.keyDown(pinField(), { key: "Backspace" });

    expect(filledBoxes()).toBe(2);
  });

  it("ignores anything that is not a digit", () => {
    // A PIN is digits. Letters arriving from a stray keystroke must not fill a
    // box with something the pad could never have produced.
    render(<ReturningSignInScreen />);

    fireEvent.change(pinField(), { target: { value: "a" } });

    expect(filledBoxes()).toBe(0);
  });

  it("stops at four, exactly as the pad does (D58)", async () => {
    // "Four digits, four boxes." This took up to eight, for a PIN that might
    // be six from before 25 Sep; five to eight were only ever a 422. The pad
    // and the keyboard share one appender, so they cannot disagree.
    loginPin.mockResolvedValue(SESSION);
    render(<ReturningSignInScreen />);
    const [schoolField, userField] = screen.getAllByRole("textbox");
    fireEvent.change(schoolField, { target: { value: "751A1136" } });
    fireEvent.change(userField, { target: { value: "amara.k" } });
    for (const d of "1234567890") {
      fireEvent.change(pinField(), { target: { value: d } });
    }

    expect(filledBoxes()).toBe(4);
    await signInNow();
    expect(loginPin).toHaveBeenCalledWith(
      expect.objectContaining({ pin: "1234" }),
    );
  });

  it("sends four digits, and remembers no length for tomorrow's unlock", async () => {
    // "The length arrives with the PIN rather than being remembered by the
    // device" (D58): the unlock draws four whatever this device was told.
    loginPin.mockResolvedValue(SESSION);
    render(<ReturningSignInScreen />);
    fill();
    await signInNow();

    expect(loginPin).toHaveBeenCalledWith(
      expect.objectContaining({ pin: "1234" }),
    );
    expect(getRememberedProfile()?.pinLength).toBeUndefined();
  });

  it("will not sign in with fewer than four digits", () => {
    render(<ReturningSignInScreen />);
    const [schoolField, userField] = screen.getAllByRole("textbox");
    fireEvent.change(schoolField, { target: { value: "751A1136" } });
    fireEvent.change(userField, { target: { value: "amara.k" } });
    for (const d of "123") {
      fireEvent.change(pinField(), { target: { value: d } });
    }

    expect(screen.getByRole("button", { name: "That's me" })).toBeDisabled();
  });

  it("takes a whole typed PIN and enables the button", () => {
    render(<ReturningSignInScreen />);
    const [schoolField, userField] = screen.getAllByRole("textbox");
    fireEvent.change(schoolField, { target: { value: "751A1136" } });
    fireEvent.change(userField, { target: { value: "amara.k" } });

    for (const d of ["1", "2", "3", "4"]) {
      fireEvent.change(pinField(), { target: { value: d } });
    }

    expect(
      screen.getByRole("button", { name: "That's me" }),
    ).not.toBeDisabled();
  });

  it("comes after the username in the tab order", () => {
    // A child tabs school code, username, PIN. An off-screen field would have
    // worked for typing and put the caret somewhere nobody can see.
    render(<ReturningSignInScreen />);
    const fields = [...document.querySelectorAll("input")];

    expect(fields[2]).toBe(pinField());
  });
});

describe("the form as 00c draws it", () => {
  it("is headed Welcome back, with the frame's line under it", () => {
    render(<ReturningSignInScreen />);

    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Let's get you back into your lessons."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sign back in")).toBeNull();
  });

  it("keeps the help on its own row, pointing at the teacher", () => {
    render(<ReturningSignInScreen />);

    expect(
      screen.getByText(/Don't know your Student ID \/ Admission Number\?/),
    ).toBeInTheDocument();
    expect(screen.getByText("Ask your teacher.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/username/i);
  });

  it("labels the second field as 00c does, and draws it empty", () => {
    render(<ReturningSignInScreen />);

    const field = screen.getByLabelText("Student ID / Admission Number");
    expect(field).toHaveValue("");
    // It said "Ask your teacher", which the help row already says.
    expect(field).not.toHaveAttribute("placeholder");
  });

  it("sends a Student ID exactly as typed, under the field the server reads", async () => {
    // Sign-in matches the school's Student ID or Nevo's handle (backend,
    // 1 Oct). A slash is not stripped and nothing is upper-cased.
    loginPin.mockResolvedValue(SESSION);
    render(<ReturningSignInScreen />);
    fill({ user: "BGA/2031" });

    await signInNow();

    expect(loginPin).toHaveBeenCalledWith(
      expect.objectContaining({ admissionNumber: "BGA/2031" }),
    );
  });

  it("centres the school code, as 00c centres its cells", () => {
    render(<ReturningSignInScreen />);

    const code = screen.getByLabelText("School code");
    expect(code.parentElement?.parentElement?.className).toContain(
      "[&_input]:text-center",
    );
  });

  it("asks them to try again after a PIN that did not match, in the tinted box", async () => {
    loginPin.mockRejectedValue(refusal("authentication_failed"));
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    expect(
      screen.getByText(
        "Hmm, that didn't match. Check your school code and Student ID / Admission Number with your teacher and try again.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("does not offer Try again to a child who has been rate limited", async () => {
    // Pressing again is the instruction that extends a lockout.
    loginPin.mockRejectedValue(refusal("too_many_attempts"));
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

describe("one keyboard at a time (ruling D)", () => {
  const padKey = () => screen.queryByRole("button", { name: "5" });

  it("keeps the number pad down until the PIN is what is being typed", () => {
    // It was a permanent block pad, so with the school code's own tray up the
    // form showed two keyboards at once.
    render(<ReturningSignInScreen />);

    expect(padKey()).toBeNull();

    act(() => pinInput().focus());

    expect(padKey()).not.toBeNull();
  });

  it("puts the pad away when the child moves to another field", async () => {
    render(<ReturningSignInScreen />);
    act(() => pinInput().focus());

    act(() => (document.getElementById("returning-username") as HTMLInputElement).focus());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(padKey()).toBeNull();
  });
});

describe("an account that is not a student's", () => {
  beforeEach(() => {
    vi.spyOn(authApiModule.authApi, "logout").mockResolvedValue(undefined);
  });

  it("is refused before the device remembers anything", async () => {
    loginPin.mockResolvedValue({ ...SESSION, role: "teacher" });
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    // 28c-8's words (D68), the same on this door, with no link.
    expect(
      screen.getByText(
        "This sign-in is for students. Staff sign in with an email address.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: /sign in as/ })).toBeNull();
    expect(getRememberedProfile()).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
    expect(authApiModule.authApi.logout).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  // D128 (8 Oct): a screen of its own for each, never the old "Those details
  // are right" line, which told whoever typed them the account exists.
  it("shows a parent the student door and the way to their own", async () => {
    loginPin.mockResolvedValue({ ...SESSION, role: "parent_guardian" });
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    expect(
      screen.getByText(
        "This is where students sign in. Parents have their own door.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Go to the parent portal" }),
    ).toHaveAttribute("href", "/parent-sign-in");
    expect(screen.queryByText(/can.t be used to sign in here/)).toBeNull();
    expect(getRememberedProfile()).toBeNull();
    expect(signIn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));

    // The form again, with what they typed kept.
    expect(screen.getAllByRole("textbox")[1]).toHaveValue("amara.k");
  });

  it("tells an account it does not recognise nothing about it", async () => {
    loginPin.mockResolvedValue({ ...SESSION, role: "superuser" });
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    expect(
      screen.getByText("We couldn't sign you in with those details."),
    ).toBeVisible();
    // No other door: "we do not know which one would be theirs".
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/parent|staff|email/i)).toBeNull();
    expect(signIn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getAllByRole("textbox")[0]).toHaveValue("751A1136");
  });
});

/**
 * D2, 1 Oct: two sign-in moments, the same here as at the one-tap unlock.
 */
describe("the moment after signing back in", () => {
  it("takes a held child straight to the waiting screen, never Taking you to your lessons", async () => {
    loginPin.mockResolvedValue({ ...SESSION, replacedSession: false });
    myConsentGate.mockResolvedValue({
      studentId: "student-1",
      granted: false,
      blocked: true,
      requiredType: "data_processing",
      status: "pending",
    });
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    // At once, not after the beat - there is no beat for a held child.
    expect(push).toHaveBeenCalledWith("/student/waiting");
    expect(screen.queryByText(/Taking you to your lessons/)).toBeNull();
  });

  it("says nothing of the kind when no other session was ended", async () => {
    loginPin.mockResolvedValue({ ...SESSION, replacedSession: false });
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();

    expect(screen.getByText(/Taking you to your lessons/)).toBeVisible();
    expect(screen.queryByText(/signed in on another device/)).toBeNull();
  });
});

/**
 * D59: board 28's "Signed in here, other tablet released" - its own screen,
 * waiting on Continue, where it was a line on the beat that moves on alone.
 */
describe("a sign-in that ended a session on another device", () => {
  const RELEASED =
    "You were signed in on another device, so that one signed out.";

  it("says so on its own screen, and goes nowhere until Continue", async () => {
    loginPin.mockResolvedValue({ ...SESSION, replacedSession: true });
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByRole("heading", { name: RELEASED })).toBeVisible();
    expect(screen.queryByText(/Taking you to your lessons/)).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("goes on as before after Continue: the beat, then their lessons", async () => {
    loginPin.mockResolvedValue({ ...SESSION, replacedSession: true });
    render(<ReturningSignInScreen />);
    fill();
    await signInNow();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText(/Taking you to your lessons/)).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });
    expect(push).toHaveBeenCalledWith("/student/dashboard");
  });

  it("takes a held child straight to the waiting screen after Continue", async () => {
    loginPin.mockResolvedValue({ ...SESSION, replacedSession: true });
    myConsentGate.mockResolvedValue({
      studentId: "student-1",
      granted: false,
      blocked: true,
      requiredType: "data_processing",
      status: "pending",
    });
    render(<ReturningSignInScreen />);
    fill();
    await signInNow();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(push).toHaveBeenCalledWith("/student/waiting");
    expect(screen.queryByText(/Taking you to your lessons/)).toBeNull();
  });
});

describe("the name the device learns (B35)", () => {
  it("is the name the child chose, when they have chosen one", async () => {
    // `users/me` `preferredName`, live since 1 Oct. The roster's name is the
    // school's record; the chosen one is what every signed-in screen uses.
    loginPin.mockResolvedValue(SESSION);
    me.mockResolvedValue({
      userId: "student-1",
      role: "student",
      firstName: "Amarachi",
      lastName: "Kalu",
      displayName: "Ama",
      preferredName: "Ama",
      email: null,
      school: null,
    });
    render(<ReturningSignInScreen />);
    fill();

    await signInNow();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(getRememberedProfile()?.displayName).toBe("Ama");
  });
});

/**
 * 05 Entry sends a child the lookup says already has an account here, rather
 * than through a first run that would make them a second one. They typed the
 * school code and their Student ID one screen ago; only the PIN is left.
 */
describe("arriving from 05 Entry", () => {
  afterEach(() => clearSignInHandoff());

  it("labels the second field as the frame does, both words", () => {
    render(<ReturningSignInScreen />);

    expect(
      screen.getByLabelText("Student ID / Admission Number"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Your username")).toBeNull();
  });

  it("starts with the school code and Student ID the child already typed", () => {
    handSignInOver({ schoolCode: "K7DQ", identifier: "BGA/2031" });
    render(<ReturningSignInScreen />);

    const [schoolField, idField] = screen.getAllByRole("textbox");
    expect(schoolField).toHaveValue("K7DQ");
    expect(idField).toHaveValue("BGA/2031");
  });

  it("spends the hand-off, so the next visit starts empty", () => {
    handSignInOver({ schoolCode: "K7DQ", identifier: "BGA/2031" });
    const first = render(<ReturningSignInScreen />);
    first.unmount();

    expect(peekSignInHandoff()).toBeNull();
    render(<ReturningSignInScreen />);
    const [schoolField, idField] = screen.getAllByRole("textbox");
    expect(schoolField).toHaveValue("");
    expect(idField).toHaveValue("");
  });

  it("signs in with the Student ID as typed, which sign-in accepts", async () => {
    loginPin.mockResolvedValue(SESSION);
    handSignInOver({ schoolCode: "K7DQ", identifier: "BGA/2031" });
    render(<ReturningSignInScreen />);
    act(() => pinInput().focus());
    for (const d of ["1", "2", "3", "4"]) {
      fireEvent.click(screen.getByRole("button", { name: d }));
    }

    await signInNow();

    expect(loginPin).toHaveBeenCalledWith({
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
      pin: "1234",
    });
  });
});
