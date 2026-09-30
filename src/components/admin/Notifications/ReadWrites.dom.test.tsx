import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Notification } from "@/lib/api/notifications";
import { NotificationsPanel } from "./NotificationsPanel";
import { NotificationsView } from "./NotificationsView";
import { READ_STATE_EVENT, unreadFrom } from "./readState";

/**
 * Reads the server refused were painted as read anyway: the panel's
 * mark-all put back only its button, a single row's failure was swallowed on
 * both surfaces, and reading on the full page never reached the sidebar dot.
 */

const feed = vi.fn();
const markRead = vi.fn();
const markAllRead = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/notifications",
}));
vi.mock("@/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks")>();
  return {
    ...actual,
    usePermissions: () => ({
      scopes: [],
      resolved: true,
      status: "ready" as const,
      refresh: () => {},
      hasScope: () => false,
    }),
  };
});
vi.mock("@/lib/api/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/notifications")>();
  return {
    ...actual,
    notificationsApi: {
      ...actual.notificationsApi,
      list: () => feed(),
      markRead: (id: string) => markRead(id),
      markAllRead: () => markAllRead(),
    },
  };
});

const note = (id: string, read = false): Notification => ({
  notificationId: id,
  recipientId: "u1",
  recipientRole: "school_admin",
  type: "system",
  title: `Note ${id}`,
  description: "Something happened.",
  read,
  createdAt: new Date().toISOString(),
  navigatesTo: "/admin/dashboard",
  archived: false,
  archivedAt: null,
});

const unreadDots = () => screen.queryAllByLabelText("Unread").length;

beforeEach(() => {
  vi.clearAllMocks();
  feed.mockResolvedValue({ notifications: [note("n1"), note("n2")], unreadCount: 2, total: 2, hasMore: false });
});

describe("unreadFrom", () => {
  it("reads the answer whatever the body calls it", () => {
    expect(unreadFrom({ unreadExists: true })).toBe(true);
    expect(unreadFrom({ exists: true })).toBe(true);
    expect(unreadFrom({ anything: false })).toBe(false);
    expect(unreadFrom(true)).toBe(true);
    expect(unreadFrom(null)).toBe(false);
    expect(unreadFrom("yes")).toBe(false);
  });
});

describe("the panel puts back what the server refused", () => {
  it("after a failed mark-all, every dot comes back", async () => {
    markAllRead.mockRejectedValue(new Error("500"));
    render(<NotificationsPanel onClose={() => {}} onReadStateChanged={() => {}} />);
    await waitFor(() => expect(unreadDots()).toBe(2));
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(markAllRead).toHaveBeenCalled());
    await waitFor(() => expect(unreadDots()).toBe(2));
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeInTheDocument();
  });

  it("after a failed single read, that row is unread again", async () => {
    markRead.mockRejectedValue(new Error("500"));
    render(<NotificationsPanel onClose={() => {}} onReadStateChanged={() => {}} />);
    await waitFor(() => expect(unreadDots()).toBe(2));
    fireEvent.click(screen.getAllByRole("link")[0]);
    await waitFor(() => expect(markRead).toHaveBeenCalledWith("n1"));
    await waitFor(() => expect(unreadDots()).toBe(2));
  });
});

describe("the full page", () => {
  it("puts a refused read back and says so", async () => {
    markRead.mockRejectedValue(new Error("500"));
    const { container } = render(<NotificationsView />);
    await waitFor(() => expect(unreadDots()).toBe(2));
    fireEvent.click(screen.getAllByRole("link")[0]);
    await waitFor(() => expect(visibleText(container)).toMatch(/mark that as read/));
    expect(unreadDots()).toBe(2);
  });

  it("tells the sidebar when something was read", async () => {
    markRead.mockResolvedValue(undefined);
    const heard = vi.fn();
    window.addEventListener(READ_STATE_EVENT, heard);
    render(<NotificationsView />);
    await waitFor(() => expect(unreadDots()).toBe(2));
    fireEvent.click(screen.getAllByRole("link")[0]);
    await waitFor(() => expect(heard).toHaveBeenCalled());
    window.removeEventListener(READ_STATE_EVENT, heard);
  });
});
