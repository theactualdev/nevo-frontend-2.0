import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NotFound from "@/app/not-found";
import GlobalError from "@/app/error";
import StudentError from "@/app/student/error";
import { canGoBack, homeFor } from "./SystemScreens";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * Board 28's 404 and generic error.
 *
 * "Go back" was `router.back()` and nothing else, so a page opened directly -
 * a bookmark, a link in a message, a new tab - had one button that did
 * nothing. And the child's error boundary said "This bit got stuck", which no
 * frame draws.
 */

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// The sending half is `clientErrors.dom.test.ts`'s. Here: that the screen
// reports at all, and once.
const reportClientError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/clientErrors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/clientErrors")>()),
  reportClientError,
}));

afterEach(() => {
  cleanup();
  clearSession();
  router.push.mockReset();
  router.back.mockReset();
  reportClientError.mockReset();
});

const asStudent = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "student-1",
    role: "student",
  });

describe("the way out", () => {
  it("goes back only where there is a back to go to", () => {
    expect(canGoBack(1)).toBe(false);
    expect(canGoBack(2)).toBe(true);
  });

  it("goes to the person's own home otherwise", () => {
    expect(homeFor("student")).toBe("/student/dashboard");
    expect(homeFor("teacher")).toBe("/teacher/dashboard");
    expect(homeFor("other_admin")).toBe("/admin");
    expect(homeFor(undefined)).toBe("/");
  });
});

describe("the 404", () => {
  it("carries the frame's logo as a way home, and its art", () => {
    // IA 31: "Nevo wordmark -> Student Home Dashboard".
    asStudent();
    render(<NotFound />);

    expect(screen.getByRole("link", { name: "Nevo home" })).toHaveAttribute(
      "href",
      "/student/dashboard",
    );
    expect(document.querySelector('img[src*="not-found"]')).not.toBeNull();
  });

  it("does not leave a directly opened page with a dead Go back", () => {
    // jsdom opens on a single history entry, which is a fresh tab.
    expect(window.history.length).toBe(1);
    asStudent();
    render(<NotFound />);

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));

    expect(router.back).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/student/dashboard");
  });

  it("goes back where there is somewhere to go back to", () => {
    window.history.pushState({}, "", "/student/lessons/missing");
    render(<NotFound />);

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));

    expect(router.back).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("the child's error screen", () => {
  it("says what board 28 says, with its art", () => {
    render(<StudentError error={new Error("x")} unstable_retry={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("We're on it. Try again or go back."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/got stuck/)).toBeNull();
    expect(screen.queryByText("Back home")).toBeNull();
    expect(document.querySelector('img[src*="error"]')).not.toBeNull();
  });

  it("re-fetches on Try again, rather than re-rendering what just failed", () => {
    const retry = vi.fn();
    render(<StudentError error={new Error("x")} unstable_retry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});

/**
 * B36. The screen tells a child "We're on it", which was untrue until the
 * error went anywhere. It is reported from the screen, once.
 */
describe("what the error screen does with the error", () => {
  it("reports the child's error as the student console's, once", () => {
    const error = new Error("boom");
    const { rerender } = render(
      <StudentError error={error} unstable_retry={vi.fn()} />,
    );
    rerender(<StudentError error={error} unstable_retry={vi.fn()} />);

    expect(reportClientError).toHaveBeenCalledTimes(1);
    expect(reportClientError).toHaveBeenCalledWith(error, "student");
  });

  it("reports from the app-wide boundary too, with the console read from the path", () => {
    // It catches the child's sign-in doors, which have no boundary of their own.
    window.history.pushState({}, "", "/auth/login");
    const error = new Error("boom");
    render(<GlobalError error={error} unstable_retry={vi.fn()} />);

    expect(reportClientError).toHaveBeenCalledWith(error, "student");
    window.history.pushState({}, "", "/");
  });

  it("shows nothing about the report, whatever becomes of it", () => {
    render(<StudentError error={new Error("boom")} unstable_retry={vi.fn()} />);

    expect(document.body.textContent).not.toMatch(/report|sent|boom/i);
  });

  it("reports nothing from the 404, which is not a fault", () => {
    render(<NotFound />);

    expect(reportClientError).not.toHaveBeenCalled();
  });
});
