import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ForgotPinPage from "@/app/auth/forgot-pin/page";
import { rememberProfile } from "@/lib/auth/session";

/**
 * 00a: "No self-service reset · points gently to the teacher · never a dead
 * end."
 *
 * The way back used to read the legacy one-child profile key, and a device it
 * did not name was sent to `/student/onboarding` - the new-account Welcome,
 * which on a shared tablet is how a returning child makes a second account.
 */

const page = async (next?: string) =>
  render(
    await ForgotPinPage({
      searchParams: Promise.resolve(next ? { next } : {}),
    }),
  );

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Forgot PIN", () => {
  it("goes back to the sign-in door, never onboarding, when the device remembers nobody", async () => {
    await page();

    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/auth/login",
    );
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/auth/login");
    expect(document.body.innerHTML).not.toContain("onboarding");
  });

  it("goes to the same door when it does remember someone", async () => {
    rememberProfile({
      schoolCode: "NEVO-1",
      loginIdentifier: "ada.o",
      initials: "AO",
    });
    await page();

    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/auth/login");
  });

  it("keeps where the child was going", async () => {
    await page("/student/lessons/frac-3");

    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
      "href",
      "/auth/login?next=%2Fstudent%2Flessons%2Ffrac-3",
    );
  });

  it("draws the frame's Back, its art, and no wordmark or em dash", async () => {
    await page();

    // A 44px Back at the top left, as 00a draws it.
    expect(screen.getByRole("link", { name: "Back" }).className).toContain(
      "size-11",
    );
    expect(document.querySelector('img[src*="error"]')).not.toBeNull();
    expect(screen.queryByAltText("Nevo")).toBeNull();
    expect(document.body.textContent).not.toContain("\u2014");
  });
});
