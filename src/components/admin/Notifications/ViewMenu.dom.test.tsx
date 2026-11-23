import { chooseOption, optionNames } from "@/test/nevoSelect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Notification } from "@/lib/api/notifications";
import { NotificationsView } from "./NotificationsView";

/**
 * D13b's ONE VIEW MENU (backlog 74): Everything, Unread only, Archived. It was
 * two toggle pills, "Show archived" and "Unread only", which read as two
 * filters that could both be on.
 */

const list = vi.fn();

vi.mock("@/hooks", () => ({ usePermissions: () => ({ scopes: ["oversight"] }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("@/lib/api/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/notifications")>();
  return { ...actual, notificationsApi: { ...actual.notificationsApi, list: (q: unknown) => list(q) } };
});

const note = (id: string, over: Partial<Notification> = {}): Notification => ({
  notificationId: id,
  recipientId: "a1",
  recipientRole: "admin",
  type: "consent_confirmed",
  title: `Notification ${id}`,
  description: "",
  navigatesTo: null,
  read: false,
  createdAt: new Date().toISOString(),
  archived: false,
  archivedAt: null,
  ...over,
});

beforeEach(() => {
  list.mockReset();
  list.mockImplementation(async (q: { archived: boolean }) =>
    q.archived
      ? { notifications: [note("a1", { archived: true })], unreadCount: 0, total: 1, hasMore: false }
      : { notifications: [note("n1"), note("n2", { read: true })], unreadCount: 1, total: 2, hasMore: false },
  );
});

describe("the notifications page's view", () => {
  it("is one menu with D13b's three views, starting on Everything", async () => {
    render(<NotificationsView />);

    const menu = await screen.findByRole("combobox", { name: "View" });
    expect(optionNames(menu)).toEqual(["Everything", "Unread only", "Archived"]);
    expect(menu).toHaveTextContent("Everything");
    expect(screen.queryByRole("button", { name: /Show archived|Unread only/ })).not.toBeInTheDocument();
  });

  it("shows the unread ones under Unread only", async () => {
    render(<NotificationsView />);
    await screen.findByText("Notification n2");

    await chooseOption(screen.getByRole("combobox", { name: "View" }), "Unread only");

    await waitFor(() => expect(screen.queryByText("Notification n2")).not.toBeInTheDocument());
    expect(screen.getByText("Notification n1")).toBeInTheDocument();
  });

  it("asks the server for the archive under Archived, and back again under Everything", async () => {
    render(<NotificationsView />);
    const menu = await screen.findByRole("combobox", { name: "View" });

    await chooseOption(menu, "Archived");
    expect(await screen.findByText("Notification a1")).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ archived: true }));

    await chooseOption(menu, "Everything");
    expect(await screen.findByText("Notification n2")).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ archived: false }));
  });

  // D13b draws "That's everything from the last month." The feed is not a
  // month: it pages through the whole record, so the claim stays "That's
  // everything." until the server's window is a month (raised).
  it("ends without claiming a month the feed does not keep to", async () => {
    render(<NotificationsView />);
    await screen.findByText("Notification n2");

    expect(screen.getByText("That’s everything.")).toBeInTheDocument();
    expect(screen.queryByText(/from the last month/)).not.toBeInTheDocument();
  });
});
