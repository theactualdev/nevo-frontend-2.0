import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Notification } from "@/lib/api/notifications";
import { NotificationsView } from "./NotificationsView";

/**
 * A refused "Mark all read" used to clear every unread dot anyway.
 *
 * The rows were painted read optimistically and the catch reverted only the
 * BUTTON, so the failure left the list looking exactly like a success. Press
 * "Unread only" afterwards and the screen said "You're up to date." - a failed
 * WRITE manufacturing the same false absence that PR #269 spent five fixes
 * removing from failed READS.
 */

const list = vi.fn();
const markAllRead = vi.fn();

vi.mock("@/lib/api/notifications", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/notifications")>();
  return {
    ...actual,
    notificationsApi: {
      ...actual.notificationsApi,
      list: (o?: { offset?: number }) => list(o),
      markAllRead: () => markAllRead(),
      markRead: async () => undefined,
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
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

const row = (i: number): Notification => ({
  notificationId: `n${i}`,
  recipientId: "a1",
  recipientRole: "admin",
  type: "admin_welcome",
  title: `Notice ${i}`,
  description: "Something happened.",
  read: false,
  createdAt: new Date().toISOString(),
  navigatesTo: null,
  archived: false,
  archivedAt: null,
});

const feed = { notifications: [row(1), row(2)], unreadCount: 2, hasMore: false };

describe("NotificationsView mark all read", () => {
  it("does not report an empty inbox when the write was refused", async () => {
    list.mockResolvedValue(feed);
    markAllRead.mockRejectedValue(new Error("500"));

    const { container } = render(<NotificationsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark all read" }));

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn't mark everything as read/i),
    );
    expect(visibleText(container)).toMatch(/nothing has changed/i);

    // The button must be pressable again - the admin's intent is unserved.
    expect(
      screen.getByRole("button", { name: "Mark all read" }),
    ).toBeInTheDocument();

    /*
     * And the decisive one: filtering to unread must still show the two
     * unread rows. Before, the rows stayed painted read and this said
     * "You're up to date."
     */
    fireEvent.change(screen.getByRole("combobox", { name: "View" }), { target: { value: "unread" } });
    await waitFor(() => expect(visibleText(container)).toMatch(/Notice 1/));
    expect(visibleText(container)).toMatch(/Notice 2/);
    expect(visibleText(container)).not.toMatch(/up to date/i);
  });

  it("clears the unread rows when the write actually succeeded", async () => {
    list.mockResolvedValue(feed);
    markAllRead.mockResolvedValue(undefined);

    const { container } = render(<NotificationsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark all read" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "All read" })).toBeInTheDocument(),
    );
    expect(visibleText(container)).not.toMatch(/couldn't mark/i);

    fireEvent.change(screen.getByRole("combobox", { name: "View" }), { target: { value: "unread" } });
    await waitFor(() => expect(visibleText(container)).toMatch(/up to date/i));
  });
  it("does not throw away a page that landed while the write was in flight", async () => {
    /*
     * `setRows(before)` was a whole-array overwrite. Press "Mark all read" on a
     * slow link, press "Show older" while it is in flight, then let the POST
     * reject: the appended page vanished with the rollback while `hasMore`
     * stayed false, so "That's everything." went back on a list that had more.
     * A failed write manufacturing an absence, one level down from the one this
     * file was written about.
     */
    list.mockImplementation((o: { offset?: number } = {}) =>
      o.offset
        ? Promise.resolve({ notifications: [row(3)], unreadCount: 0, hasMore: false })
        : Promise.resolve({ ...feed, hasMore: true }),
    );
    // Held in an object: TS narrows a plain `let` to `null`, because it cannot
    // see the assignment happen inside the promise callback.
    const pending: { refuse: (() => void) | null } = { refuse: null };
    markAllRead.mockImplementation(
      () =>
        new Promise((_, rej) => {
          pending.refuse = () => rej(new Error("500"));
        }),
    );

    const { container } = render(<NotificationsView />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark all read" }));
    fireEvent.click(await screen.findByRole("button", { name: "Show older" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/Notice 3/));

    pending.refuse?.();

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn't mark everything as read/i),
    );
    // The page that arrived meanwhile is still here...
    expect(visibleText(container)).toMatch(/Notice 3/);
    // ...and the unread state it rolled back is the read flags, not the list.
    fireEvent.change(screen.getByRole("combobox", { name: "View" }), { target: { value: "unread" } });
    await waitFor(() => expect(visibleText(container)).toMatch(/Notice 1/));
  });
});
