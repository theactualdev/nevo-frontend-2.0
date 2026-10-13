import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, createElement, type ReactNode } from "react";

const { list, markRead, archive, restore, markAllRead } = vi.hoisted(() => ({
  list: vi.fn(),
  markRead: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  markAllRead: vi.fn(),
}));
vi.mock("@/lib/api/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/notifications")>();
  return {
    ...actual,
    notificationsApi: { ...actual.notificationsApi, list, markRead, archive, restore, markAllRead },
  };
});

import { useTeacherNotifications } from "./useTeacherNotifications";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * The bell's writes: read one, read all, archive, and undo (audit T240).
 *
 * Rendered under StrictMode on purpose. React runs state updaters twice
 * there, and the first version of these did its POST inside one - two
 * `restore` calls for a single Undo. Each write here must leave exactly once.
 */

const row = (id: string, read = false, createdAt = "2026-10-01T08:00:00Z") => ({
  notificationId: id,
  type: "flag",
  title: "A flag",
  message: `Notification ${id}`,
  read,
  createdAt,
  navigatesTo: null,
});

const strict = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);

const loaded = async () => {
  const hook = renderHook(() => useTeacherNotifications(), { wrapper: strict });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
  list.mockReset().mockResolvedValue({
    notifications: [row("n-1", false, "2026-10-02T08:00:00Z"), row("n-2", false, "2026-10-01T08:00:00Z"), row("n-3", true, "2026-09-30T08:00:00Z")],
    unreadCount: 2,
  });
  for (const fn of [markRead, archive, restore, markAllRead]) fn.mockReset().mockResolvedValue({});
});

describe("reading one", () => {
  it("marks it read at once and tells the server exactly once", async () => {
    const { result } = await loaded();
    act(() => result.current.markRead("n-1"));

    expect(result.current.notes.find((n) => n.id === "n-1")?.unread).toBe(false);
    expect(result.current.unreadCount).toBe(1);
    expect(markRead).toHaveBeenCalledTimes(1);
    expect(markRead).toHaveBeenCalledWith("n-1");
  });

  it("sends nothing for a row that was already read", async () => {
    const { result } = await loaded();
    act(() => result.current.markRead("n-3"));

    expect(markRead).not.toHaveBeenCalled();
    expect(result.current.unreadCount).toBe(2);
  });
});

describe("archiving, and taking it back", () => {
  it("takes the row out, offers it back, and archives exactly once", async () => {
    const { result } = await loaded();
    act(() => result.current.archive("n-1"));

    expect(result.current.notes.map((n) => n.id)).toEqual(["n-2", "n-3"]);
    expect(result.current.lastArchived?.id).toBe("n-1");
    expect(result.current.unreadCount).toBe(1);
    expect(archive).toHaveBeenCalledTimes(1);
  });

  it("puts it back where it was, and restores exactly once", async () => {
    const { result } = await loaded();
    act(() => result.current.archive("n-1"));
    act(() => result.current.undoArchive());

    expect(result.current.notes.map((n) => n.id)).toEqual(["n-1", "n-2", "n-3"]);
    expect(result.current.lastArchived).toBeNull();
    expect(result.current.unreadCount).toBe(2);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledWith("n-1");
  });
});

describe("reading all", () => {
  it("clears the dot once the server agrees", async () => {
    const { result } = await loaded();
    act(() => result.current.markAllRead());

    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(result.current.notes.every((n) => !n.unread)).toBe(true);
  });

  it("leaves the dot alone when the server did not", async () => {
    markAllRead.mockRejectedValue(new Error("500"));
    const { result } = await loaded();
    act(() => result.current.markAllRead());

    await waitFor(() => expect(markAllRead).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.unreadCount).toBe(2);
    expect(result.current.notes.some((n) => n.unread)).toBe(true);
  });
});
