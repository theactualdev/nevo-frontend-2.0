import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/teacher/dashboard" }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => null }));
vi.mock("@/hooks/useTeacherNotifications", () => ({
  useTeacherNotifications: () => ({
    notes: [],
    unreadCount: 0,
    failed: false,
    loading: false,
    refresh,
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    archive: vi.fn(),
    undoArchive: vi.fn(),
    lastArchived: null,
  }),
}));

import { TeacherSidebar } from "./TeacherSidebar";

/**
 * Opening the bell is asking "what's new" - so it asks the server again.
 * The feed was read once at sign-in and never again.
 */

beforeEach(() => {
  refresh.mockReset();
});

describe("the bell", () => {
  it("reads the feed again when it is opened", () => {
    render(<TeacherSidebar />);

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not read again when it is closed", () => {
    render(<TeacherSidebar />);
    const bell = screen.getByRole("button", { name: /notifications/i });

    fireEvent.click(bell);
    fireEvent.click(bell);

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
