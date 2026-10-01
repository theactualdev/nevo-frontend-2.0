import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Notification } from "@/lib/api/notifications";
import { NotificationsView } from "./NotificationsView";

/**
 * D13b on the full Notifications page: "You're up to date." only when it is
 * known, the archived count, and a Put back that says when it didn't.
 */

const list = vi.fn();
const restore = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/notifications",
}));
vi.mock("@/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks")>();
  return {
    ...actual,
    usePermissions: () => ({ scopes: [], resolved: true, status: "ready" as const, refresh: () => {}, hasScope: () => false }),
  };
});
vi.mock("@/lib/api/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/notifications")>();
  return {
    ...actual,
    notificationsApi: {
      ...actual.notificationsApi,
      list: (q: unknown) => list(q),
      restore: (id: string) => restore(id),
    },
  };
});

const note = (id: string, over: Partial<Notification> = {}): Notification => ({
  notificationId: id,
  recipientId: "u1",
  recipientRole: "school_admin",
  type: "system",
  title: `Note ${id}`,
  description: "Something happened.",
  read: true,
  createdAt: new Date().toISOString(),
  navigatesTo: null,
  archived: false,
  archivedAt: null,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("Unread only", () => {
  it("says up to date only when every page is loaded", async () => {
    list.mockResolvedValue({ notifications: [note("n1")], unreadCount: 0, total: 1, hasMore: false });
    const { container } = render(<NotificationsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Unread only" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/You're up to date\./));
    expect(visibleText(container)).toMatch(/Everything here has been read\./);
  });

  it("does not claim it while older notifications are unfetched", async () => {
    list.mockResolvedValue({ notifications: [note("n1")], unreadCount: 3, total: 40, hasMore: true });
    const { container } = render(<NotificationsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Unread only" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/Nothing unread among the latest/));
    expect(visibleText(container)).not.toMatch(/up to date/);
    expect(screen.getAllByRole("button", { name: "Show older" }).length).toBeGreaterThan(0);
  });
});

describe("Archived", () => {
  const openArchived = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Show archived" }));
  };

  it("counts what is archived from the feed's own total", async () => {
    list.mockImplementation(async (q: { archived: boolean }) =>
      q.archived
        ? { notifications: [note("a1", { archived: true })], unreadCount: 0, total: 12, hasMore: true }
        : { notifications: [note("n1")], unreadCount: 0, total: 1, hasMore: false },
    );
    const { container } = render(<NotificationsView />);
    await openArchived();
    await waitFor(() => expect(visibleText(container)).toMatch(/12 archived\./));
  });

  it("says when Put back didn't", async () => {
    list.mockImplementation(async (q: { archived: boolean }) =>
      q.archived
        ? { notifications: [note("a1", { archived: true })], unreadCount: 0, total: 1, hasMore: false }
        : { notifications: [], unreadCount: 0, total: 0, hasMore: false },
    );
    restore.mockRejectedValue(new Error("500"));
    const { container } = render(<NotificationsView />);
    await openArchived();
    fireEvent.click(await screen.findByRole("button", { name: /Put back/ }));
    await waitFor(() => expect(visibleText(container)).toMatch(/put that back/));
  });
});
