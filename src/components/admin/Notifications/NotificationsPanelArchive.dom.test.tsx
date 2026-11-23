import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Notification } from "@/lib/api/notifications";
import { NotificationsPanel } from "./NotificationsPanel";

/**
 * THE SAME ROW, RENDERED IN TWO PLACES, HAD THE ACTION IN ONE OF THEM.
 *
 * SCRUM-100 adds per-row archive to both the panel and the page.
 * `NotificationRow` already took the handler and the page already passed one;
 * the panel passed nothing, so the action simply did not exist there.
 */

const feed = vi.fn();
const archive = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));

vi.mock("@/lib/api/notifications", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/notifications")>();
  return {
    ...actual,
    notificationsApi: {
      ...actual.notificationsApi,
      list: () => feed(),
      archive: (id: string) => archive(id),
    },
  };
});

const row = (i: number, over: Partial<Notification> = {}): Notification => ({
  notificationId: `n${i}`,
  recipientId: "a1",
  recipientRole: "admin",
  type: "consent_confirmed",
  title: `Notification ${i}`,
  description: "",
  navigatesTo: null,
  read: false,
  createdAt: "2026-09-15T09:00:00Z",
  archived: false,
  archivedAt: null,
  ...over,
});

const ok = (rows: Notification[]) => ({
  notifications: rows,
  unreadCount: rows.filter((r) => !r.read).length,
  total: rows.length,
  hasMore: false,
});

function archiveButtons(container: HTMLElement) {
  return Array.from(container.querySelectorAll("button")).filter(
    (b) => b.textContent === "Archive",
  );
}

beforeEach(() => {
  feed.mockReset();
  archive.mockReset();
  archive.mockResolvedValue(undefined);
});

describe("archiving from the panel", () => {
  it("offers the action on every row", async () => {
    feed.mockResolvedValue(ok([row(1), row(2)]));
    const { container } = render(
      <NotificationsPanel onClose={() => {}} onReadStateChanged={() => {}} />,
    );
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Notification 1/),
    );
    expect(archiveButtons(container)).toHaveLength(2);
  });

  it("takes the row out and tells the server", async () => {
    feed.mockResolvedValue(ok([row(1), row(2)]));
    const { container } = render(
      <NotificationsPanel onClose={() => {}} onReadStateChanged={() => {}} />,
    );
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Notification 1/),
    );

    fireEvent.click(archiveButtons(container)[0]);
    await waitFor(() =>
      expect(visibleText(container)).not.toMatch(/Notification 1/),
    );
    expect(archive).toHaveBeenCalledWith("n1");
    expect(visibleText(container)).toMatch(/Notification 2/);
  });

  it("puts the row back when the write is refused", async () => {
    // A panel showing a state the server did not accept is the defect the
    // preferences screen was corrected for; the same rule holds here.
    feed.mockResolvedValue(ok([row(1)]));
    archive.mockRejectedValue(new Error("500"));
    const { container } = render(
      <NotificationsPanel onClose={() => {}} onReadStateChanged={() => {}} />,
    );
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Notification 1/),
    );

    fireEvent.click(archiveButtons(container)[0]);
    await waitFor(() => expect(archive).toHaveBeenCalled());
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Notification 1/),
    );
    // And says so (backlog 73): the page's own words for the same act.
    expect(visibleText(container)).toMatch(
      /We couldn't archive that just now, so nothing has changed. Try again in a moment./,
    );
  });

  it("clears the line when the next archive goes through", async () => {
    feed.mockResolvedValue(ok([row(1), row(2)]));
    archive.mockRejectedValueOnce(new Error("500")).mockResolvedValue(undefined);
    const { container } = render(
      <NotificationsPanel onClose={() => {}} onReadStateChanged={() => {}} />,
    );
    await waitFor(() => expect(visibleText(container)).toMatch(/Notification 1/));

    fireEvent.click(archiveButtons(container)[0]);
    await waitFor(() => expect(visibleText(container)).toMatch(/couldn't archive that/));
    fireEvent.click(archiveButtons(container)[1]);

    await waitFor(() => expect(visibleText(container)).not.toMatch(/Notification 2/));
    expect(visibleText(container)).not.toMatch(/couldn't archive that/);
  });

  // SCRUM-100: "a quiet action on hover (in the row on tablet)" (backlog 73).
  it("keeps Archive in the row below 1280, and hover-only only where a pointer hovers", async () => {
    feed.mockResolvedValue(ok([row(1)]));
    const { container } = render(
      <NotificationsPanel onClose={() => {}} onReadStateChanged={() => {}} />,
    );
    await waitFor(() => expect(visibleText(container)).toMatch(/Notification 1/));

    const cls = archiveButtons(container)[0].className.split(/\s+/);
    // Never hidden outright: every hiding class is behind xl and a hover pointer.
    expect(cls).not.toContain("opacity-0");
    const hiding = cls.filter((c) => c.endsWith("opacity-0"));
    expect(hiding.length).toBeGreaterThan(0);
    for (const c of hiding) expect(c.startsWith("xl:[@media(hover:hover)_and_(pointer:fine)]:")).toBe(true);
  });

  it("does not offer it on a row that is only an empty state", async () => {
    feed.mockResolvedValue(ok([]));
    const { container } = render(
      <NotificationsPanel onClose={() => {}} onReadStateChanged={() => {}} />,
    );
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/all caught up/i),
    );
    expect(archiveButtons(container)).toHaveLength(0);
  });
});

describe("the panel's failure state", () => {
  it("retries in place rather than asking the reader to reopen it", async () => {
    feed.mockRejectedValueOnce(new Error("500")).mockResolvedValue(ok([row(1)]));
    const { container } = render(
      <NotificationsPanel onClose={() => {}} onReadStateChanged={() => {}} />,
    );
    await waitFor(() => expect(visibleText(container)).toMatch(/We're on it/));

    const again = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Try again",
    )!;
    fireEvent.click(again);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Notification 1/),
    );
    expect(visibleText(container)).not.toMatch(/We're on it/);
  });
});
