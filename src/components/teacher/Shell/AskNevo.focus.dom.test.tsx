import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: () => "/teacher/dashboard" }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  askNevoApi: { ask: vi.fn(), threads: vi.fn(), thread: vi.fn(), recordHelpfulness: vi.fn() },
}));
vi.mock("@/lib/auth/session", () => ({ getToken }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ school: "E2E Probe School" }),
}));

import { act } from "@testing-library/react";
import { AskNevo } from "./AskNevo";
import { OPEN_ASK_NEVO } from "./phoneLayouts";

/**
 * The drawer had no Escape and never took focus (C07). Opening it unmounts
 * the pill that had focus, so focus fell to the page and the drawer sat last
 * in tab order, after everything it covers.
 */

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const openIt = () => {
  render(<AskNevo />);
  const pill = screen.getByRole("button", { name: "Ask Nevo" });
  pill.focus();
  fireEvent.click(pill);
};

beforeEach(() => {
  getToken.mockReset().mockReturnValue("a-token");
});

describe("Ask Nevo's drawer", () => {
  it("puts the teacher in the question box when it opens", () => {
    openIt();

    expect(document.activeElement).toBe(
      screen.getByPlaceholderText("Ask about a student, class, or lesson"),
    );
  });

  it("names its question box, and shows when it has focus (C10)", () => {
    openIt();
    const box = screen.getByLabelText("Ask about a student, class, or lesson");

    expect(box).toBe(document.activeElement);
    expect(box.parentElement?.className).toMatch(/\bfocus-within:border-nevo-navy\b/);
  });

  it("takes the teacher's text size, which it ignored outside <main> (C12)", () => {
    openIt();

    expect(screen.getByRole("dialog", { name: "Ask Nevo" })).toHaveClass(
      "nevo-text-zoom",
      "max-w-full",
    );
  });

  it("closes on Escape", () => {
    openIt();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Ask Nevo" })).not.toBeInTheDocument();
  });

  it("hands focus back to the pill when it closes", () => {
    openIt();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ask Nevo" }));
  });

  it("keeps Tab inside while it is open", () => {
    openIt();
    const drawer = screen.getByRole("dialog", { name: "Ask Nevo" });
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(drawer.contains(document.activeElement)).toBe(true);
  });
});

/**
 * C19 C1: on a phone there is no pill - the drawer lists Ask Nevo, and its
 * row opens the same sheet. The pill is hidden below md in CSS, so it is
 * still in the DOM here; what is pinned is that the drawer's call is heard.
 */
describe("Ask Nevo opened from the phone drawer", () => {
  it("opens when the drawer asks for it", () => {
    render(<AskNevo />);
    act(() => {
      window.dispatchEvent(new Event(OPEN_ASK_NEVO));
    });

    expect(screen.getByRole("dialog", { name: "Ask Nevo" })).toBeInTheDocument();
  });

  it("keeps its pill off a phone", () => {
    render(<AskNevo />);
    expect(screen.getByRole("button", { name: "Ask Nevo" }).className).toMatch(/max-md:hidden/);
  });
});
