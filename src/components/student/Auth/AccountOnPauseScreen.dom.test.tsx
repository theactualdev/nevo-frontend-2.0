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

  it("shows the pause bars in its circle, not the brand mark (D64)", () => {
    // 6 Oct: "The glyph is the pause bars, not the brand mark. Our mark does
    // not appear on a screen that is telling someone their access has been
    // interrupted." The wordmark above is the page's, and stays.
    render(<AccountOnPauseScreen />);

    // The frame's own bars since 8 Oct (D147): two solid, fully rounded navy
    // bars, 15 x 54 on a phone, 18 x 66 on a tablet, 19 x 70 on a desktop.
    const bars = document.querySelectorAll("[data-pause-bar]");
    expect(bars).toHaveLength(2);
    for (const bar of bars) {
      for (const size of [
        "w-[15px]",
        "h-[54px]",
        "sm:w-[18px]",
        "sm:h-[66px]",
        "lg:w-[19px]",
        "lg:h-[70px]",
        "rounded-full",
        "bg-nevo-navy",
      ]) {
        expect(bar.className).toContain(size);
      }
    }
    expect(document.querySelector("img[src*=\"logo-icon\"]")).toBeNull();
    expect(screen.getByAltText("Nevo")).toHaveAttribute(
      "src",
      "/brand/logo-wordmark-purple.png",
    );
  });
});
