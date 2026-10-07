import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/teacher/dashboard" }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ name: "Adaeze Okafor", initials: "AO", role: "teacher" }),
}));
vi.mock("@/hooks/useTeacherNotifications", () => ({
  useTeacherNotifications: () => ({
    notes: [],
    unreadCount: 0,
    failed: false,
    loading: false,
    refresh: vi.fn(),
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    archive: vi.fn(),
    undoArchive: vi.fn(),
    lastArchived: null,
  }),
}));

import { TeacherSidebar } from "./TeacherSidebar";

/**
 * The account menu answered only a mouse (C08), and the bell's popover was
 * placed by the viewport rather than by the rail it opens from (C13).
 *
 * jsdom matches no media query, so the rail opens collapsed - the tablet
 * variant - and the chevron expands it.
 */

const items = () => screen.getAllByRole("menuitem");
const openMenu = () => {
  const trigger = screen.getByRole("button", { name: "Account menu" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
};
const key = (k: string, shiftKey = false) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: k, shiftKey });

describe("the account menu's trigger", () => {
  it("is called the account menu while collapsed, not its initials", () => {
    render(<TeacherSidebar />);

    expect(screen.getByRole("button", { name: "Account menu" })).toHaveTextContent("AO");
  });

  it("is called by the teacher's name once the rail is expanded", () => {
    render(<TeacherSidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));

    expect(screen.getByRole("button", { name: /Adaeze Okafor/ })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
  });
});

describe("the account menu, by keyboard", () => {
  it("puts focus on its first item when it opens", () => {
    render(<TeacherSidebar />);
    openMenu();

    expect(document.activeElement).toBe(items()[0]);
  });

  it("moves down and up with the arrows, wrapping at either end", () => {
    render(<TeacherSidebar />);
    openMenu();

    key("ArrowDown");
    expect(document.activeElement).toBe(items()[1]);
    key("ArrowUp");
    key("ArrowUp");
    expect(document.activeElement).toBe(items()[items().length - 1]);
    key("ArrowDown");
    expect(document.activeElement).toBe(items()[0]);
  });

  it("jumps to the ends with Home and End", () => {
    render(<TeacherSidebar />);
    openMenu();

    key("End");
    expect(document.activeElement).toBe(items()[items().length - 1]);
    key("Home");
    expect(document.activeElement).toBe(items()[0]);
  });

  it("closes on Escape, back onto its trigger", () => {
    render(<TeacherSidebar />);
    const trigger = openMenu();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when Tab moves on from it", () => {
    render(<TeacherSidebar />);
    openMenu();
    key("Tab");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("hands focus to Share feedback's panel, then back to the trigger", () => {
    render(<TeacherSidebar />);
    const trigger = openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Share feedback" }));

    const panel = screen.getByRole("dialog", { name: "Share feedback" });
    expect(panel.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
  });
});

describe("the notifications popover", () => {
  it("sits by a collapsed rail", () => {
    render(<TeacherSidebar />);
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(panel).toHaveClass("left-[88px]");
    expect(panel).not.toHaveClass("left-[200px]");
  });

  it("moves out with an expanded rail, whatever the viewport", () => {
    render(<TeacherSidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(panel).toHaveClass("left-[200px]");
    expect(panel).not.toHaveClass("left-[88px]");
  });
});
