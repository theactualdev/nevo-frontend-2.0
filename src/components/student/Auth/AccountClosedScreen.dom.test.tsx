import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountClosedScreen } from "./AccountClosedScreen";

/**
 * 28d Account Closed (D116). Round 5 drew the closed state as the pause screen
 * with one word changed; 28d draws its own, and the things that make it
 * different are the things pinned here.
 */

describe("AccountClosedScreen", () => {
  it("says what 28d says, verbatim", () => {
    render(<AccountClosedScreen />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Your account is closed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This account is closed, so there's nothing more to do here.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "If you're not sure why, ask your teacher or someone at your school.",
      ),
    ).toBeInTheDocument();
  });

  it("is terminal: no sign-in route, and nothing else to press", () => {
    // "Terminal: no sign-in route, because offering a way back in would be
    // cruel."
    render(<AccountClosedScreen />);

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("never says on pause, or any of the words 28d rules out", () => {
    render(<AccountClosedScreen />);

    const body = document.body.textContent?.toLowerCase() ?? "";
    for (const word of [
      "pause",
      "removed",
      "deactivated",
      "erased",
      "deleted",
      "terminated",
      "consent",
      "parent",
    ]) {
      expect(body).not.toContain(word);
    }
  });

  it("draws a quiet static ring, not the breathing dot or the brand mark", () => {
    // "A quiet static ring, not the breathing dot (this is settled, not
    // waiting)."
    render(<AccountClosedScreen />);

    const ring = document.querySelector("span.rounded-full");
    expect(ring?.className).toContain("border-2");
    expect(ring?.className).not.toMatch(/animate/);
    expect(document.querySelector("svg")).toBeNull();
    expect(document.querySelector('img[src*="logo-icon"]')).toBeNull();
    // The wordmark, top left, as the frame places it.
    expect(screen.getByAltText("Nevo")).toHaveAttribute(
      "src",
      "/brand/logo-wordmark-purple.png",
    );
  });
});
