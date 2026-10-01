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
vi.mock("@/lib/auth/entryGate", () => ({ studentDestination }));

const roster = vi.hoisted(() => ({
  entries: [{ id: "a", name: "Ada", shapeIndex: 0 }] as {
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
  roster.entries = [{ id: "a", name: "Ada", shapeIndex: 0 }];
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

    expect(router.push).toHaveBeenCalledWith(
      "/auth/forgot-pin?next=%2Fstudent%2Fprogress",
    );
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
    roster.entries = [{ id: "a", shapeIndex: 0 }];
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
