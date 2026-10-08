import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import LoginPage from "./page";
import { ApiError } from "@/lib/api/client";
import { clearSession } from "@/lib/auth/session";

/**
 * The PIN unlock and the picker (28c), and what each way out of them carries.
 *
 * Three defects pinned here:
 *   - WHERE THE CHILD WAS GOING fell off. The proxy's `?next=` was read only on
 *     the empty-device redirect, so the PIN unlock landed on Home and
 *     "Someone else" and "Forgot PIN?" dropped it.
 *   - THE SCREEN DRIFTED from 28c: "Welcome back, Ada" where the frame says
 *     "Ada", "Try again, or ask your teacher" where it says "Have another go.",
 *     and a redirect where 28c-2 draws a screen.
 *   - THE DOOR CAST THE ROLE. A non-student account was stored and greeted.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const signIn = vi.hoisted(() => vi.fn());
vi.mock("@/hooks", () => ({ useAuth: () => ({ signIn }) }));

const { loginPin, logout } = vi.hoisted(() => ({
  loginPin: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ authApi: { loginPin, logout } }));
const studentDestination = vi.hoisted(() =>
  vi.fn(async (preferred?: string | null) => preferred || "/student/dashboard"),
);
vi.mock("@/lib/auth/entryGate", () => ({
  studentDestination,
  WAITING_ROUTE: "/student/waiting",
}));

/** A shared tablet: two children, so the door is 28c's picker. */
const TWO = [
  { id: "a", name: "Ada", shapeIndex: 0 },
  { id: "k", name: "Kofi", shapeIndex: 1 },
];

const roster = vi.hoisted(() => ({
  entries: [] as {
    id: string;
    name?: string;
    shapeIndex: number;
  }[],
  displayName: "Ada" as string | undefined,
  rememberChild: vi.fn(),
}));
vi.mock("@/lib/auth/deviceRoster", () => ({
  SHAPE_COUNT: 6,
  pickerEntries: () => roster.entries,
  childById: (id: string) =>
    roster.entries.some((e) => e.id === id)
      ? {
          id,
          schoolCode: "NEVO-1",
          loginIdentifier: "ada.o",
          displayName: roster.displayName,
          initials: "AO",
          shapeIndex: 0,
          lastUsedAt: new Date().toISOString(),
          pinLength: 4,
        }
      : null,
  rememberChild: roster.rememberChild,
}));

const SESSION = {
  accessToken: "tok",
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  userId: "student-1",
  role: "student",
};

async function chooseAda() {
  render(<LoginPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Ada" }));
  await screen.findByText("Enter your PIN to keep going");
}

async function tap(digits: string) {
  for (const d of digits) {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: d }));
    });
  }
}

beforeEach(() => {
  vi.useRealTimers();
  clearSession();
  loginPin.mockReset();
  logout.mockReset();
  logout.mockResolvedValue(undefined);
  signIn.mockReset();
  router.push.mockReset();
  router.replace.mockReset();
  studentDestination.mockClear();
  roster.rememberChild.mockReset();
  roster.entries = TWO;
  roster.displayName = "Ada";
  window.history.pushState({}, "", "/auth/login");
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

describe("where the child was going", () => {
  it("is where the PIN unlock sends them", async () => {
    window.history.pushState({}, "", "/auth/login?next=/student/lessons/frac-3");
    loginPin.mockResolvedValue(SESSION);
    await chooseAda();

    await tap("1234");

    await waitFor(() =>
      expect(studentDestination).toHaveBeenCalledWith("/student/lessons/frac-3"),
    );
  });

  it("goes with them to the full sign-in through Someone else", async () => {
    window.history.pushState({}, "", "/auth/login?next=/student/lessons/frac-3");
    render(<LoginPage />);

    expect(
      await screen.findByRole("link", { name: "Someone else" }),
    ).toHaveAttribute("href", "/auth/sign-in?next=%2Fstudent%2Flessons%2Ffrac-3");
  });

  it("goes with them to Forgot PIN", async () => {
    window.history.pushState({}, "", "/auth/login?next=/student/progress");
    await chooseAda();

    fireEvent.click(screen.getByRole("button", { name: "Forgot PIN?" }));

    // And which remembered child forgot, as the roster's opaque id - so 00a
    // can ask for them - never their identifier or their school code.
    expect(router.push).toHaveBeenCalledWith(
      "/auth/forgot-pin?next=%2Fstudent%2Fprogress&child=a",
    );
    expect(String(router.push.mock.calls[0][0])).not.toMatch(/ada\.o|NEVO-1/);
  });

  it("is never somewhere off the site", async () => {
    window.history.pushState({}, "", "/auth/login?next=//evil.test");
    render(<LoginPage />);

    expect(
      await screen.findByRole("link", { name: "Someone else" }),
    ).toHaveAttribute("href", "/auth/sign-in");
  });
});

describe("a device that remembers nobody (28c-2)", () => {
  it("shows the neutral screen with one way on, rather than redirecting", async () => {
    roster.entries = [];
    window.history.pushState({}, "", "/auth/login?next=/student/lessons/frac-3");
    render(<LoginPage />);

    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in?next=%2Fstudent%2Flessons%2Ffrac-3",
    );
    expect(router.replace).not.toHaveBeenCalled();
    // Never onboarding: that is how a returning child made a second account.
    expect(document.body.innerHTML).not.toContain("onboarding");
  });
});

describe("the PIN step, as 28c-3 and 28c-5 draw it", () => {
  it("is headed by the child's first name alone", async () => {
    await chooseAda();

    expect(screen.getByRole("heading", { name: "Ada" })).toBeInTheDocument();
  });

  it("says Welcome back when the device never learned the name", async () => {
    roster.displayName = undefined;
    roster.entries = [{ id: "a", shapeIndex: 0 }, TWO[1]];
    render(<LoginPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Choose this account" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
  });

  it("says Have another go in place of the instruction, not under it", async () => {
    loginPin.mockRejectedValue(
      new ApiError(401, "Unauthorized", {
        detail: { code: "authentication_failed", message: "no" },
      }),
    );
    await chooseAda();

    await tap("1234");

    expect(
      await screen.findByText("That PIN didn't match. Have another go."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Enter your PIN to keep going")).toBeNull();
    expect(screen.queryByText(/ask your teacher/)).toBeNull();
  });

  it("has exactly one way back to the picker, in either orientation", async () => {
    // Landscape moves it under the name; it must not become two buttons.
    await chooseAda();

    expect(screen.getAllByRole("button", { name: /Not you/ })).toHaveLength(1);
  });
});

describe("an account that is not a student's", () => {
  it("is refused at the door, not signed in and greeted", async () => {
    loginPin.mockResolvedValue({ ...SESSION, role: "teacher" });
    await chooseAda();

    await tap("1234");

    // 28c-8's words (D68), with no link.
    expect(
      await screen.findByText(
        "This sign-in is for students. Staff sign in with an email address.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign in as/ })).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
    expect(roster.rememberChild).not.toHaveBeenCalled();
    // The login succeeded server-side, so its session is ended, not left.
    expect(logout).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  /*
   * D128 (8 Oct), drawn as a screen of its own. These read "Those details are
   * right, but this account can't be used to sign in here", which told
   * whoever typed them that the account exists.
   */
  it("shows a parent the student door and their own, and goes back to the picker", async () => {
    loginPin.mockResolvedValue({ ...SESSION, role: "parent_guardian" });
    await chooseAda();

    await tap("1234");

    expect(
      await screen.findByText(
        "This is where students sign in. Parents have their own door.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "This is the student door" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to the parent portal" }),
    ).toHaveAttribute("href", "/parent-sign-in");
    expect(screen.queryByText(/can.t be used to sign in here/)).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
    expect(logout).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));

    expect(await screen.findByRole("button", { name: "Kofi" })).toBeVisible();
  });

  it("tells an account it does not recognise nothing about it, and offers no other door", async () => {
    loginPin.mockResolvedValue({ ...SESSION, role: "superuser" });
    await chooseAda();

    await tap("1234");

    expect(
      await screen.findByText("We couldn't sign you in with those details."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/parent|staff|email/i)).toBeNull();
    expect(signIn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    // Back at this child's PIN, not the picker.
    expect(
      await screen.findByText("Enter your PIN to keep going"),
    ).toBeInTheDocument();
  });

  it("lets a student through", async () => {
    loginPin.mockResolvedValue(SESSION);
    await chooseAda();

    await tap("1234");

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(
        expect.objectContaining({ id: "student-1", role: "student" }),
      ),
    );
    expect(logout).not.toHaveBeenCalled();
  });
});

/**
 * D57, 6 Oct: "One remembered child means one child has used this device, not
 * that it belongs to them. Every shared tablet starts with exactly one
 * remembered child. Device ownership is never inferred from use, so the picker
 * still shows." It used to open straight on 00's own-device PIN screen, with
 * "Using a different device?".
 */
describe("a device that remembers one child (D57)", () => {
  beforeEach(() => {
    roster.entries = [TWO[0]];
  });

  it("opens on the picker, like a device that remembers more", async () => {
    window.history.pushState({}, "", "/auth/login?next=/student/lessons/frac-3");
    render(<LoginPage />);

    expect(await screen.findByText("Who's learning?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ada" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Someone else" }),
    ).toHaveAttribute("href", "/auth/sign-in?next=%2Fstudent%2Flessons%2Ffrac-3");
    // Not 00's own-device PIN screen.
    expect(screen.queryByText("Enter your PIN to keep going")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Welcome back, Ada" })).toBeNull();
  });

  it("asks for the PIN as 28c-3 does, with Not you? back to the picker", async () => {
    await chooseAda();

    expect(screen.getByRole("heading", { name: "Ada" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /different device/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Not you? Go back" }));

    expect(await screen.findByText("Who's learning?")).toBeInTheDocument();
  });

  it("says 28c-5's words for a PIN that did not match", async () => {
    loginPin.mockRejectedValue(
      new ApiError(401, "Unauthorized", {
        detail: { code: "authentication_failed", message: "no" },
      }),
    );
    await chooseAda();

    await tap("1234");

    expect(
      await screen.findByText("That PIN didn't match. Have another go."),
    ).toBeInTheDocument();
  });
});

describe("a shared tablet's PIN step (28c-3)", () => {
  it("has Not you? Go back and no Using a different device?", async () => {
    await chooseAda();

    expect(screen.getByRole("button", { name: "Not you? Go back" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /different device/ })).toBeNull();
  });
});

/**
 * D2, 1 Oct: two sign-in moments. A held child never sees "Taking you to your
 * lessons", because it is not true. And a sign-in that ended the same
 * account's session elsewhere says so, without saying where or why.
 */
describe("the moment after the PIN", () => {
  it("takes a held child straight to the waiting screen, with no Taking you to your lessons", async () => {
    loginPin.mockResolvedValue({ ...SESSION, replacedSession: false });
    studentDestination.mockResolvedValueOnce("/student/waiting");
    await chooseAda();

    await tap("1234");

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/student/waiting"),
    );
    expect(screen.queryByText(/Taking you to your lessons/)).toBeNull();
    expect(screen.queryByRole("heading", { name: /Welcome back/ })).toBeNull();
  });

  it("still says Taking you to your lessons to a child who is on their way in", async () => {
    loginPin.mockResolvedValue({ ...SESSION, replacedSession: false });
    await chooseAda();

    await tap("1234");

    expect(
      await screen.findByText(/Taking you to your lessons/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/signed in on another device/)).toBeNull();
  });
});

/**
 * D59: a sign-in that ended the same account's session elsewhere says so on a
 * screen of its own, board 28's "Signed in here, other tablet released", and
 * waits for Continue. It was a line on the "Welcome back" beat, which moves on
 * by itself.
 */
describe("a sign-in that ended a session on another device", () => {
  const RELEASED =
    "You were signed in on another device, so that one signed out.";

  it("says so on its own screen, and goes nowhere until Continue", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    loginPin.mockResolvedValue({ ...SESSION, replacedSession: true });
    await chooseAda();

    await tap("1234");

    expect(
      await screen.findByRole("heading", { name: RELEASED }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Taking you to your lessons/)).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("goes on as before after Continue: the beat, then where they were going", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.history.pushState({}, "", "/auth/login?next=/student/lessons/frac-3");
    loginPin.mockResolvedValue({ ...SESSION, replacedSession: true });
    await chooseAda();
    await tap("1234");

    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));

    expect(screen.getByText(/Taking you to your lessons/)).toBeInTheDocument();
    expect(screen.queryByText(RELEASED)).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(router.push).toHaveBeenCalledWith("/student/lessons/frac-3");
  });

  it("takes a held child straight to the waiting screen after Continue", async () => {
    loginPin.mockResolvedValue({ ...SESSION, replacedSession: true });
    studentDestination.mockResolvedValueOnce("/student/waiting");
    await chooseAda();
    await tap("1234");

    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));

    expect(router.push).toHaveBeenCalledWith("/student/waiting");
    expect(screen.queryByText(/Taking you to your lessons/)).toBeNull();
  });
});

/**
 * PinLoginRequest takes `{schoolCode, admissionNumber, pin}` (1 Oct). The
 * identifier the device remembered goes as `admissionNumber`, exactly.
 */
describe("what the unlock sends", () => {
  it("is the contract's three fields, with the remembered identifier as admissionNumber", async () => {
    loginPin.mockResolvedValue(SESSION);
    await chooseAda();

    await tap("1234");

    await waitFor(() =>
      expect(loginPin).toHaveBeenCalledWith({
        schoolCode: "NEVO-1",
        admissionNumber: "ada.o",
        pin: "1234",
      }),
    );
  });
});

/**
 * D68: 28c-6, 28c-7 and 28c-8 - the three door lines, in 28c-5's tinted box.
 */
describe("the door lines 28c draws", () => {
  it("says a fault on our side is ours (28c-6)", async () => {
    loginPin.mockRejectedValue(new ApiError(503, "Service Unavailable"));
    await chooseAda();

    await tap("1234");

    expect(
      await screen.findByText("Something went wrong on our side. Try again."),
    ).toBeInTheDocument();
  });

  it("asks a rate-limited child to wait, never that the PIN was wrong (28c-7)", async () => {
    loginPin.mockRejectedValue(
      new ApiError(401, "Unauthorized", {
        detail: { code: "too_many_attempts", message: "slow" },
      }),
    );
    await chooseAda();

    await tap("1234");

    expect(
      await screen.findByText("Let's wait a moment before trying again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/didn.t match/)).toBeNull();
  });

  it("tells a staff account to sign in with an email address, with no link (28c-8)", async () => {
    loginPin.mockResolvedValue({ ...SESSION, role: "other_admin" });
    await chooseAda();

    await tap("1234");

    expect(
      await screen.findByText(
        "This sign-in is for students. Staff sign in with an email address.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign in as/ })).toBeNull();
  });
});

/**
 * D52: the paused screen gets a way back to the picker. With no controls, a
 * shared tablet showing it locks every other child out.
 */
describe("a paused account at the door", () => {
  const paused = () =>
    new ApiError(401, "Unauthorized", {
      detail: { code: "account_paused", message: "paused" },
    });

  it("goes back to the picker, for whoever is next", async () => {
    loginPin.mockRejectedValue(paused());
    await chooseAda();

    await tap("1234");
    fireEvent.click(
      await screen.findByRole("button", { name: "Back to sign in" }),
    );

    expect(await screen.findByText("Who's learning?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kofi" })).toBeInTheDocument();
  });

  it("goes back to the picker on a device that remembers one child too (D57)", async () => {
    roster.entries = [TWO[0]];
    loginPin.mockRejectedValue(paused());
    await chooseAda();

    await tap("1234");
    fireEvent.click(
      await screen.findByRole("button", { name: "Back to sign in" }),
    );

    expect(await screen.findByText("Who's learning?")).toBeInTheDocument();
    expect(screen.queryByText(/on pause/)).toBeNull();
  });
});

/**
 * D53 and D116: a removed child's right PIN is answered `account_closed`
 * (B58). They read 28d - closed, not on pause, and not a PIN that did not
 * match - which is terminal: "no sign-in route, because offering a way back
 * in would be cruel." Product, 7 Oct: one line, "Someone else using this
 * device?", frees the device for whoever is next.
 */
describe("a closed account at the door", () => {
  const closed = () =>
    new ApiError(401, "Unauthorized", {
      detail: { code: "account_closed", message: "closed" },
    });

  it("says closed in 28d's words, with nothing to press but the next child's way to the picker", async () => {
    loginPin.mockRejectedValue(closed());
    await chooseAda();

    await tap("1234");

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Your account is closed",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This account is closed, so there's nothing more to do here.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /on pause|didn.t match|back to sign in/i,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Someone else using this device?" }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("goes back to the picker, where the device still remembers everyone", async () => {
    // Nothing is forgotten on the way: the roster is the device's, and the
    // closed child's face stays on it until it ages out.
    loginPin.mockRejectedValue(closed());
    await chooseAda();
    await tap("1234");

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Someone else using this device?",
      }),
    );

    expect(await screen.findByText("Who's learning?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ada" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kofi" })).toBeInTheDocument();
    expect(screen.queryByText(/account is closed/)).toBeNull();
    expect(signIn).not.toHaveBeenCalled();
  });
});

/**
 * THE THIRTY-DAY CLOCK (28c: "entries age out after thirty days of non-use").
 * A child leaves the picker thirty days after their last SUCCESSFUL sign-in on
 * this device, because only a success restamps them (`rememberChild`). That is
 * what retires a closed account's face (product, 7 Oct): a closed child can
 * never sign in again, so their clock stops at their last real visit. If a
 * refused attempt restamped them, tapping a closed child's face would keep it
 * on a shared tablet for ever - which nothing else would catch.
 */
describe("the thirty-day clock", () => {
  it("restarts on a successful unlock", async () => {
    loginPin.mockResolvedValue(SESSION);
    await chooseAda();

    await tap("1234");

    await waitFor(() =>
      expect(roster.rememberChild).toHaveBeenCalledWith(
        expect.objectContaining({ loginIdentifier: "ada.o", userId: "student-1" }),
      ),
    );
  });

  it("is not restarted by a closed account, there or on the way back to the picker", async () => {
    loginPin.mockRejectedValue(
      new ApiError(401, "Unauthorized", {
        detail: { code: "account_closed", message: "closed" },
      }),
    );
    await chooseAda();
    await tap("1234");

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Someone else using this device?",
      }),
    );
    await screen.findByText("Who's learning?");

    expect(roster.rememberChild).not.toHaveBeenCalled();
  });

  it("is not restarted by a PIN that did not match", async () => {
    loginPin.mockRejectedValue(
      new ApiError(401, "Unauthorized", {
        detail: { code: "authentication_failed", message: "no" },
      }),
    );
    await chooseAda();

    await tap("1234");

    await screen.findByText("That PIN didn't match. Have another go.");
    expect(roster.rememberChild).not.toHaveBeenCalled();
  });
});
