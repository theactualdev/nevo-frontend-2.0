import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NotFound from "@/app/not-found";
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

afterEach(() => {
  cleanup();
  clearSession();
  router.push.mockReset();
  router.back.mockReset();
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
