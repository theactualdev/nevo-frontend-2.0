import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const holds = vi.hoisted(() => ({ value: false }));
vi.mock("next/navigation", () => ({ usePathname: () => "/teacher/dashboard" }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => null }));
vi.mock("@/hooks/useLearningSupport", () => ({ useHoldsLearningSupport: () => holds.value }));
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

/** C20 through the real rail: the item is there for a holder, and only then. */
beforeEach(() => {
  holds.value = false;
});

describe("the Learning Support item", () => {
  it("is offered to a teacher who holds the role, last, after Connect", () => {
    holds.value = true;
    render(<TeacherSidebar />);
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h) => h?.startsWith("/teacher/") && h !== "/teacher/profile" && h !== "/teacher/help");

    expect(hrefs.indexOf("/teacher/learning-support")).toBe(hrefs.indexOf("/teacher/connect") + 1);
  });

  it("is not there at all - not greyed, not locked - without it", () => {
    render(<TeacherSidebar />);

    expect(
      screen.queryAllByRole("link").filter((a) => a.getAttribute("href") === "/teacher/learning-support"),
    ).toHaveLength(0);
  });
});
