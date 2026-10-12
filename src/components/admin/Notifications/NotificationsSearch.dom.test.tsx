import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Notification } from "@/lib/api/notifications";
import { NotificationsView } from "./NotificationsView";

/**
 * D13b's search box asks the server (`q`, 9 Oct). It filtered the loaded page
 * only, so anything older than the first page could never be found by typing.
 */

type ListOptions = { archived?: boolean; offset?: number; q?: string };
const list = vi.fn<(o: ListOptions) => Promise<unknown>>();

vi.mock("@/lib/api/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/notifications")>();
  return {
    ...actual,
    notificationsApi: { ...actual.notificationsApi, list: (o: ListOptions = {}) => list(o) },
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

const row = (id: string, title: string, description = "Something happened."): Notification => ({
  notificationId: id,
  recipientId: "a1",
  recipientRole: "admin",
  type: "invoice_issued",
  title,
  description,
  read: true,
  createdAt: new Date().toISOString(),
  navigatesTo: null,
  archived: false,
  archivedAt: null,
});

beforeEach(() => {
  list.mockReset();
  list.mockImplementation(async (o) =>
    o.q
      ? {
          // The server's match, which need not contain the word in its title.
          notifications: [row("old", "Your term invoice", "Issued in July")],
          unreadCount: 0,
          hasMore: true,
          total: 3,
        }
      : { notifications: [row("n1", "Welcome to Nevo")], unreadCount: 0, hasMore: false },
  );
});

describe("searching notifications", () => {
  it("asks the server once typing pauses, and shows what it found", async () => {
    const { container } = render(<NotificationsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Welcome to Nevo/));

    fireEvent.change(screen.getByLabelText("Search notifications"), { target: { value: "  receipt " } });
    await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({ q: "receipt", offset: 0 })));
    // Shown as the server returned it - not filtered again on the page.
    await waitFor(() => expect(visibleText(container)).toMatch(/Your term invoice/));
    expect(visibleText(container)).not.toMatch(/Welcome to Nevo/);
  });

  it("pages through the matches, not the whole feed", async () => {
    render(<NotificationsView />);
    fireEvent.change(await screen.findByLabelText("Search notifications"), { target: { value: "invoice" } });
    const older = await screen.findByRole("button", { name: /Show older/i });
    fireEvent.click(older);
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: "invoice", offset: 1 })),
    );
  });

  it("goes back to the whole feed when the box is cleared", async () => {
    const { container } = render(<NotificationsView />);
    const box = await screen.findByLabelText("Search notifications");
    fireEvent.change(box, { target: { value: "invoice" } });
    await waitFor(() => expect(visibleText(container)).toMatch(/Your term invoice/));
    fireEvent.change(box, { target: { value: "" } });
    await waitFor(() => expect(visibleText(container)).toMatch(/Welcome to Nevo/));
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: "", offset: 0 }));
  });
});
