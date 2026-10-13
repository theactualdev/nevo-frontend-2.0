import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/api/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/notifications")>();
  return { ...actual, notificationsApi: { ...actual.notificationsApi, list } };
});

import { useTeacherNotifications } from "./useTeacherNotifications";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * THE BELL: what it says before it knows, and when it asks again.
 *
 * It said "Nothing new right now." for the whole of its first read, and it
 * read exactly once per console load - so a teacher who kept the console open
 * all day never saw a new flag or message, and the dot never moved.
 */

const row = (id: string, read = false) => ({
  notificationId: id,
  type: "flag",
  title: "A flag",
  message: `Notification ${id}`,
  read,
  createdAt: "2026-10-01T08:00:00Z",
  navigatesTo: null,
});

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
  list.mockReset();
});

describe("before the first read answers", () => {
  it("is loading, not empty", () => {
    list.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTeacherNotifications());

    expect(result.current.loading).toBe(true);
    expect(result.current.failed).toBe(false);
  });

  it("stops loading once it has answered", async () => {
    list.mockResolvedValue({ notifications: [], unreadCount: 0 });
    const { result } = renderHook(() => useTeacherNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("stops loading when it failed - that is an answer too", async () => {
    list.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useTeacherNotifications());

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.loading).toBe(false);
  });
});

describe("asking again", () => {
  it("re-reads on refresh and shows what is new", async () => {
    list.mockResolvedValueOnce({ notifications: [row("n-1")], unreadCount: 1 });
    const { result } = renderHook(() => useTeacherNotifications());
    await waitFor(() => expect(result.current.notes).toHaveLength(1));

    list.mockResolvedValueOnce({ notifications: [row("n-2"), row("n-1")], unreadCount: 2 });
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.notes).toHaveLength(2));
    expect(result.current.unreadCount).toBe(2);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("re-reads when the tab comes back into view", async () => {
    list.mockResolvedValue({ notifications: [], unreadCount: 0 });
    renderHook(() => useTeacherNotifications());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("keeps the rows it had when a re-read fails", async () => {
    // They are still true - just not new. Wiping them would turn a blip into
    // an empty inbox.
    list.mockResolvedValueOnce({ notifications: [row("n-1")], unreadCount: 1 });
    const { result } = renderHook(() => useTeacherNotifications());
    await waitFor(() => expect(result.current.notes).toHaveLength(1));

    list.mockRejectedValueOnce(new Error("network"));
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.unreadCount).toBe(1);
  });

  it("recovers from a failed first read when asked again", async () => {
    list.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useTeacherNotifications());
    await waitFor(() => expect(result.current.failed).toBe(true));

    list.mockResolvedValueOnce({ notifications: [row("n-1")], unreadCount: 1 });
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    expect(result.current.failed).toBe(false);
  });
});

/**
 * T240. The feed used to race the read against a cap and drop an answer that
 * came after it - so a slow backend left the bell empty even though the rows
 * had arrived. A late answer is an answer.
 */
describe("a slow feed", () => {
  it("still lands when it answers late", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      list.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ notifications: [row("n-1")], unreadCount: 1 }), 30_000),
          ),
      );
      const { result } = renderHook(() => useTeacherNotifications());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });

      expect(result.current.notes).toHaveLength(1);
      expect(result.current.failed).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the rows it had when a re-read fails, and says the re-read failed", async () => {
    list
      .mockResolvedValueOnce({ notifications: [row("n-1")], unreadCount: 1 })
      .mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useTeacherNotifications());
    await waitFor(() => expect(result.current.notes).toHaveLength(1));

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.notes).toHaveLength(1);
  });
});
