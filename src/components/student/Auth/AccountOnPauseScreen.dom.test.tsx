import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountOnPauseScreen } from "./AccountOnPauseScreen";

/**
 * The screen a paused child sees instead of being told they mistyped.
 *
 * Two things about it are load-bearing and neither is obvious from looking at
 * it: it offers NOTHING to do, and it names NO reason. Both are from the frame,
 * and both are easy to "improve" away — a Try again button, or a helpful line
 * about why. This pins them.
 */

describe("AccountOnPauseScreen", () => {
  it("says the account is on pause, in the child's own terms", () => {
    render(<AccountOnPauseScreen />);

    expect(screen.getByText(/Your Nevo account is on pause/)).toBeVisible();
  });

  it("points at a person, not a process", () => {
    render(<AccountOnPauseScreen />);

    expect(screen.getByText(/talk to your teacher/)).toBeVisible();
  });

  it("offers the paused child nothing to press", () => {
    // From the frame, and it matters: there is nothing here a child can do, and
    // an action that cannot work is worse than no action. The way back is a
    // teacher.
    render(<AccountOnPauseScreen />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("offers the next child one way back to the picker, and only that (D52)", () => {
    // A shared tablet left on a screen with no controls locks every other
    // child out of it. The control is not a retry and must not read as one.
    render(<AccountOnPauseScreen back={{ href: "/auth/login" }} />);

    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/auth/login",
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.body.textContent?.toLowerCase()).not.toContain("try again");
  });

  it("names no reason", () => {
    // Backend deliberately sends no cause and we would not want one. A parent
    // withdrawing consent, a safeguarding hold and an unpaid invoice are not
    // things to explain to a child on a sign-in screen.
    render(<AccountOnPauseScreen />);

    const body = document.body.textContent?.toLowerCase() ?? "";
    for (const leak of [
      "consent",
      "withdraw",
      "suspend",
      "payment",
      "unpaid",
      "safeguard",
      "parent",
    ]) {
      expect(body).not.toContain(leak);
    }
  });

  it("does not suggest the child did something wrong", () => {
    render(<AccountOnPauseScreen />);

    const body = document.body.textContent?.toLowerCase() ?? "";
    for (const blame of ["didn't match", "incorrect", "wrong", "try again"]) {
      expect(body).not.toContain(blame);
    }
  });

  it("shows the Nevo mark, not a pause glyph", () => {
    // The frame draws the brand mark in the violet circle and the wordmark
    // above it. A pause symbol reads as a media control - something a child
    // could press to un-pause - and this screen offers nothing to press.
    render(<AccountOnPauseScreen />);

    expect(screen.getByAltText("Nevo")).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeNull();
  });
});
