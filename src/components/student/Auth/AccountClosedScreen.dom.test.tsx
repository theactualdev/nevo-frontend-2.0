import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AccountClosedScreen } from "./AccountClosedScreen";
import { AccountOnPauseScreen } from "./AccountOnPauseScreen";

/**
 * 28d Account Closed (D116). Round 5 drew the closed state as the pause screen
 * with one word changed; 28d draws its own, and the things that make it
 * different are the things pinned here.
 */

const TO_PICKER = { href: "/auth/login" };

describe("AccountClosedScreen", () => {
  it("says what 28d says, verbatim", () => {
    render(<AccountClosedScreen toPicker={TO_PICKER} />);

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

  it("is terminal for the child: no sign-in route, only the next child's way to the picker", () => {
    // "Terminal: no sign-in route, because offering a way back in would be
    // cruel." And product, 7 Oct: one line that frees the device for whoever
    // is next, and says nothing about the closed child's own access.
    render(<AccountClosedScreen toPicker={TO_PICKER} />);

    expect(
      screen.getByRole("link", { name: "Someone else using this device?" }),
    ).toHaveAttribute("href", "/auth/login");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(
      /sign in|log in|back to|try again/i,
    );
  });

  it("puts the picker back in place at the PIN unlock, as a button", () => {
    const onBack = vi.fn();
    render(<AccountClosedScreen toPicker={{ onBack }} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Someone else using this device?" }),
    );

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("draws the line as the doors' quiet one, under the body", () => {
    const { unmount } = render(
      <AccountOnPauseScreen back={{ href: "/auth/login" }} />,
    );
    const doorLine = screen.getByRole("link").className;
    unmount();

    render(<AccountClosedScreen toPicker={TO_PICKER} />);
    const line = screen.getByRole("link");

    expect(line.className).toBe(doorLine);
    // After the body, in the same column, not above it or in a corner.
    const ask = screen.getByText(/If you're not sure why/);
    expect(ask.parentElement).toBe(line.parentElement);
    expect(ask.compareDocumentPosition(line)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("never says on pause, or any of the words 28d rules out", () => {
    render(<AccountClosedScreen toPicker={TO_PICKER} />);

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
      "saved",
    ]) {
      expect(body).not.toContain(word);
    }
  });

  it("draws a quiet static ring, not the breathing dot or the brand mark", () => {
    // "A quiet static ring, not the breathing dot (this is settled, not
    // waiting)."
    render(<AccountClosedScreen toPicker={TO_PICKER} />);

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
