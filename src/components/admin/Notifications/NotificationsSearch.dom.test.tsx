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

/*
 * A search waits for typing to pause (SEARCH_PAUSE_MS, 300) before it asks,
 * and Testing Library gives up after 1000ms by default. That left about 700ms
 * for the read and the render, and on a loaded machine "Show older" was not
 * always there in time (19 Nov, one full admin run in three). Every wait that
 * follows a search gets room; nothing about the behaviour under test changes.
 */
const AFTER_PAUSE = { timeout: 5000 };

// Room for those waits under the per-test limit (vitest's default is 5s).
describe("searching notifications", { timeout: 15_000 }, () => {
  it("asks the server once typing pauses, and shows what it found", async () => {
    const { container } = render(<NotificationsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Welcome to Nevo/));

    fireEvent.change(screen.getByLabelText("Search notifications"), { target: { value: "  receipt " } });
    await waitFor(
      () => expect(list).toHaveBeenCalledWith(expect.objectContaining({ q: "receipt", offset: 0 })),
      AFTER_PAUSE,
    );
    // Shown as the server returned it - not filtered again on the page.
    await waitFor(() => expect(visibleText(container)).toMatch(/Your term invoice/), AFTER_PAUSE);
    expect(visibleText(container)).not.toMatch(/Welcome to Nevo/);
  });

  it("pages through the matches, not the whole feed", async () => {
    render(<NotificationsView />);
    fireEvent.change(await screen.findByLabelText("Search notifications"), { target: { value: "invoice" } });
    const older = await screen.findByRole("button", { name: /Show older/i }, AFTER_PAUSE);
    fireEvent.click(older);
    await waitFor(
      () => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: "invoice", offset: 1 })),
      AFTER_PAUSE,
    );
  });

  it("goes back to the whole feed when the box is cleared", async () => {
    const { container } = render(<NotificationsView />);
    const box = await screen.findByLabelText("Search notifications");
    fireEvent.change(box, { target: { value: "invoice" } });
    await waitFor(() => expect(visibleText(container)).toMatch(/Your term invoice/), AFTER_PAUSE);
    fireEvent.change(box, { target: { value: "" } });
    await waitFor(() => expect(visibleText(container)).toMatch(/Welcome to Nevo/), AFTER_PAUSE);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: "", offset: 0 }));
  });

  /*
   * ONLY THE LATEST ASK IS SHOWN (19 Nov). The first, unfiltered read used to
   * be able to land after the search's and replace its results with the whole
   * feed - under a search box still reading "invoice".
   */
  it("never lets a slower, earlier read replace the search's results", async () => {
    let releaseFirst: (v: unknown) => void = () => {};
    const whole = { notifications: [row("n1", "Welcome to Nevo")], unreadCount: 0, hasMore: false };
    list.mockImplementation((o) =>
      o.q
        ? Promise.resolve({
            notifications: [row("old", "Your term invoice", "Issued in July")],
            unreadCount: 0,
            hasMore: true,
            total: 3,
          })
        : new Promise((resolve) => {
            releaseFirst = resolve;
          }),
    );
    const { container } = render(<NotificationsView />);
    fireEvent.change(await screen.findByLabelText("Search notifications"), { target: { value: "invoice" } });
    await waitFor(() => expect(visibleText(container)).toMatch(/Your term invoice/), AFTER_PAUSE);

    // The unfiltered feed answers last.
    releaseFirst(whole);
    await new Promise((r) => setTimeout(r, 50));
    expect(visibleText(container)).toMatch(/Your term invoice/);
    expect(visibleText(container)).not.toMatch(/Welcome to Nevo/);
  });
});
