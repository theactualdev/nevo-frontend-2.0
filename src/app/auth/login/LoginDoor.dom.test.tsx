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

    expect(await screen.findByText(/this is the student sign-in/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sign in as a teacher" })).toHaveAttribute(
      "href",
      "/auth/teacher",
    );
    expect(signIn).not.toHaveBeenCalled();
    expect(roster.rememberChild).not.toHaveBeenCalled();
    // The login succeeded server-side, so its session is ended, not left.
    expect(logout).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("is refused when the role is one this build has never heard of", async () => {
    loginPin.mockResolvedValue({ ...SESSION, role: "parent_guardian" });
    await chooseAda();

    await tap("1234");

    expect(
      await screen.findByText(/can.t be used to sign in here/),
    ).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
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
 * D1, 1 Oct: "Both frames are right, on different screens." 00 is the own
 * device - one remembered child, straight to their PIN, with "Using a
 * different device?" out to 00c. 28c is the shared tablet, with "Not you? Go
 * back" to its picker. The picker used to show for one child too, so 00's way
 * out existed nowhere.
 */
describe("a device that remembers one child (00)", () => {
  beforeEach(() => {
    roster.entries = [TWO[0]];
  });

  it("opens straight on that child's PIN, greeting them as 00 draws it", async () => {
    render(<LoginPage />);

    expect(
      await screen.findByRole("heading", { name: "Welcome back, Ada" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter your PIN to keep going")).toBeInTheDocument();
    // No picker in front of it.
    expect(screen.queryByText("Who's learning?")).toBeNull();
  });

  it("offers Using a different device? out to the full sign-in, and no Not you?", async () => {
    window.history.pushState({}, "", "/auth/login?next=/student/lessons/frac-3");
    render(<LoginPage />);

    expect(
      await screen.findByRole("link", { name: "Using a different device?" }),
    ).toHaveAttribute("href", "/auth/sign-in?next=%2Fstudent%2Flessons%2Ffrac-3");
    expect(screen.queryByRole("button", { name: /Not you/ })).toBeNull();
  });

  it("says 00's words for a PIN that did not match", async () => {
    loginPin.mockRejectedValue(
      new ApiError(401, "Unauthorized", {
        detail: { code: "authentication_failed", message: "no" },
      }),
    );
    render(<LoginPage />);
    await screen.findByText("Enter your PIN to keep going");

    await tap("1234");

    expect(
      await screen.findByText(
        "That PIN didn't match. Try again, or ask your teacher.",
      ),
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
    expect(screen.queryByText("Your other session has ended.")).toBeNull();
  });

  it("says the other session has ended when this sign-in ended one, and not where", async () => {
    loginPin.mockResolvedValue({ ...SESSION, replacedSession: true });
    await chooseAda();

    await tap("1234");

    expect(
      await screen.findByText("Your other session has ended."),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/another device|tablet|because/i);
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

  it("goes back to 00 on an own device, where the way past is Using a different device?", async () => {
    roster.entries = [TWO[0]];
    loginPin.mockRejectedValue(paused());
    render(<LoginPage />);
    await screen.findByText("Enter your PIN to keep going");

    await tap("1234");
    fireEvent.click(
      await screen.findByRole("button", { name: "Back to sign in" }),
    );

    expect(
      await screen.findByRole("link", { name: "Using a different device?" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/on pause/)).toBeNull();
  });
});

/**
 * D53: a removed child's right PIN is answered `account_closed` (B58). They
 * read that the account is closed - not on pause, and not a PIN that did not
 * match - and the next child still gets the picker back (D52).
 */
describe("a closed account at the door", () => {
  const closed = () =>
    new ApiError(401, "Unauthorized", {
      detail: { code: "account_closed", message: "closed" },
    });

  it("says closed, and goes back to the picker for whoever is next", async () => {
    loginPin.mockRejectedValue(closed());
    await chooseAda();

    await tap("1234");

    expect(
      await screen.findByRole("heading", { level: 1, name: /account is closed/ }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/on pause|didn.t match/i);

    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));

    expect(await screen.findByText("Who's learning?")).toBeInTheDocument();
  });
});
