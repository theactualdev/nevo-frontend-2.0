import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AskNevo } from "./AskNevo";

/**
 * THE LAUNCHER IS FIXED IN PLACE (Lydia, 19 Nov, L6): "A draggable launcher
 * gets moved by accident, lands over content, and the child cannot find it
 * again. It also makes its position unpredictable for any instruction anyone
 * gives about it." A press and a slide no longer move it; a tap still opens
 * the drawer; and the place a dragged one was kept is let go.
 */

vi.mock("@/lib/api/askNevo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/askNevo")>();
  return {
    ...actual,
    askNevoApi: {
      ...actual.askNevoApi,
      ask: vi.fn().mockRejectedValue(new Error("offline")),
      threads: vi.fn().mockResolvedValue([]),
      thread: vi.fn(),
    },
  };
});
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/lib/auth/session", () => ({ getToken: () => "tok" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/student/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ user: { id: "stu-1" } }),
  useSignals: () => ({ trackEvent: vi.fn(), flush: vi.fn() }),
}));

beforeAll(() => {
  Element.prototype.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const launchers = () =>
  screen
    .getAllByRole("button", { name: /ask nevo/i })
    .filter((b) => b.className.includes("fixed"));

describe("the Ask Nevo launcher", () => {
  it("does not move when a finger presses and slides on it", () => {
    render(<AskNevo />);
    for (const button of launchers()) {
      fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 300, clientY: 700 });
      fireEvent.pointerMove(button, { pointerId: 1, clientX: 120, clientY: 300 });
      fireEvent.pointerUp(button, { pointerId: 1, clientX: 120, clientY: 300 });

      expect(button.getAttribute("style") ?? "").not.toMatch(/translate|left|top/);
      expect(button.className).not.toMatch(/cursor-grab/);
    }
  });

  it("opens the drawer on a tap", () => {
    render(<AskNevo />);
    fireEvent.click(launchers()[0]);

    expect(screen.getByLabelText("Ask a question")).toBeInTheDocument();
  });

  /*
   * On-screen QA, 24 Nov: from xl the corner pill was the tablet's own pill
   * made taller - 14px words, an 18 sparkle, 18 in from each side, 8 between,
   * and the docked button's shadow - against frame 26's corner pill.
   */
  it("is frame 26's corner pill from desktop width", () => {
    render(<AskNevo />);
    const pill = launchers().find((b) => b.textContent?.includes("Ask Nevo"))!;

    for (const value of [
      "xl:h-[52px]",
      "xl:px-[22px]",
      "xl:gap-2.5",
      "xl:text-base",
      "xl:shadow-[0_8px_32px_rgba(43,43,47,0.20)]",
    ]) {
      expect(pill.className.split(/\s+/)).toContain(value);
    }
    expect(pill.querySelector("svg")?.getAttribute("class")).toContain("xl:size-5");
  });

  it("lets go of the place a dragged one was kept on this device", () => {
    window.localStorage.setItem("nevo.asknevo.offset", JSON.stringify({ x: -200, y: -300 }));
    render(<AskNevo />);

    expect(window.localStorage.getItem("nevo.asknevo.offset")).toBeNull();
  });
});
