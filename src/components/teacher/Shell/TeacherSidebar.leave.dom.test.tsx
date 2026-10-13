import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/teacher/dashboard",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => null }));
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

import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { TeacherSidebar } from "./TeacherSidebar";
import { UnsavedChangesProvider } from "./UnsavedChanges";

/**
 * C18 through the REAL sidebar, so the wiring is pinned and not only the
 * provider: a sidebar tab clicked mid-edit asks before it goes.
 */

function Editing() {
  useUnsavedGuard(true, "lesson");
  return null;
}

beforeEach(() => push.mockReset());

describe("a sidebar tab, mid-edit", () => {
  it("asks before it leaves the page", () => {
    render(
      <UnsavedChangesProvider>
        <Editing />
        <TeacherSidebar />
      </UnsavedChangesProvider>,
    );
    const tab = screen.getAllByRole("link").find((a) => a.getAttribute("href") === "/teacher/insights")!;

    expect(fireEvent.click(tab)).toBe(false);
    expect(screen.getByRole("dialog", { name: "You have changes that aren’t saved" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Leave without saving" }));
    expect(push).toHaveBeenCalledWith("/teacher/insights");
  });
});
