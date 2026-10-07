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

import { AskNevo } from "./AskNevo";

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
