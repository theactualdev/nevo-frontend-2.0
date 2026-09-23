import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WaitingOnConsent } from "./WaitingOnConsent";

/**
 * THE ASSERTIONS THAT MATTER HERE ARE ABSENCES.
 *
 * This screen replaced a consent gate that polled, and frame 00d spends more
 * words on what it must not do than on what it shows: *"no progress, no
 * countdown, no refresh, no door held shut."* A later reader adding a "check
 * again" button or a status line would be making a reasonable-looking local
 * improvement that re-creates the exact screen this one exists to replace - so
 * the absences are pinned rather than left to good intentions.
 */

afterEach(() => {
  cleanup();
});

describe("what it says", () => {
  it("says Nevo is not ready, and that it will be", () => {
    render(<WaitingOnConsent />);

    expect(
      screen.getByRole("heading", { name: /isn't quite ready for you yet/i }),
    ).toBeTruthy();
    expect(document.body.textContent).toMatch(/It will be soon\./);
  });

  it("says nothing else at all", () => {
    // "Nothing more" is the instruction, and two sentences is the whole screen.
    // The wordmark is an image with alt text, so it is counted deliberately.
    render(<WaitingOnConsent />);

    const text = (document.body.textContent ?? "").replace(/\s+/g, " ").trim();

    // No space between the two: `textContent` concatenates block elements
    // without one, so this is the heading and the line and nothing besides.
    expect(text).toBe("Nevo isn't quite ready for you yetIt will be soon.");
  });
});

describe("what it deliberately does not do", () => {
  it("offers no way onward - no button, no link", () => {
    // Every other dead end in this app offers a way out. This one must not:
    // the only thing that changes this state is an adult, elsewhere.
    render(<WaitingOnConsent />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("shows no progress, countdown or status", () => {
    render(<WaitingOnConsent />);

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /check|refresh|wait|loading|soon as|progress|%/i,
    );
  });

  it("sets no timer, because the gate it replaced polled", () => {
    /*
     * The decisive one. A re-check on an interval is the single change that
     * would turn this back into the screen design removed, and it would look
     * like an improvement in review.
     */
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const setTimeout = vi.spyOn(globalThis, "setTimeout");

    render(<WaitingOnConsent />);

    expect(setInterval).not.toHaveBeenCalled();
    expect(setTimeout).not.toHaveBeenCalled();

    setInterval.mockRestore();
    setTimeout.mockRestore();
  });

  it("fetches nothing - it renders a decision already made", () => {
    // The resolve happens once, at the entry point. This screen is what that
    // answer looks like, not a thing that asks its own question.
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<WaitingOnConsent />);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("the breathing mark", () => {
  it("is hidden from assistive technology and stops for reduced motion", () => {
    // Ambient, not a progress indicator: it carries no information, so a
    // screen reader loses nothing and a child who asked for less motion
    // loses nothing either.
    render(<WaitingOnConsent />);

    const mark = document.querySelector("[aria-hidden='true']");

    expect(mark).toBeTruthy();
    expect(mark?.className).toContain("motion-safe:animate-nevo-breathe");
  });
});
