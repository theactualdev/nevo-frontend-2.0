import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { threads, thread } = vi.hoisted(() => ({
  threads: vi.fn(),
  thread: vi.fn(),
}));
vi.mock("@/lib/api/messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/messages")>();
  return { ...actual, messagesApi: { ...actual.messagesApi, threads, thread } };
});

import { useConnectThreads } from "./useConnectThreads";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * A thread whose body could not be read.
 *
 * The failure was swallowed, so the thread looked like an empty
 * conversation under a live composer. The hook records it now, and a retry
 * that lands clears it.
 */

const THREAD = {
  threadId: "t-1",
  title: "Amara Okafor",
  className: "Year 7 Blue",
  latestPreview: "Can you help me?",
  lastMessageAt: "2026-10-04T08:00:00Z",
  recipientId: "s-1",
  recipientType: "student",
  unread: false,
  unreadCount: 0,
};

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-9",
    role: "teacher",
  });
  threads.mockReset().mockResolvedValue({ threads: [THREAD] });
  thread.mockReset();
});

describe("opening a thread", () => {
  it("records a body that could not be read", async () => {
    thread.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useConnectThreads());
    await waitFor(() => expect(result.current.threads[0]?.id).toBe("t-1"));

    act(() => result.current.openThread("t-1"));

    await waitFor(() => expect(result.current.threads[0].loadFailed).toBe(true));
    expect(result.current.threads[0].loaded).toBe(false);
  });

  it("clears it when asking again lands", async () => {
    thread.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useConnectThreads());
    await waitFor(() => expect(result.current.threads[0]?.id).toBe("t-1"));
    act(() => result.current.openThread("t-1"));
    await waitFor(() => expect(result.current.threads[0].loadFailed).toBe(true));

    thread.mockResolvedValueOnce({ messages: [] });
    act(() => result.current.openThread("t-1"));

    await waitFor(() => expect(result.current.threads[0].loaded).toBe(true));
    expect(result.current.threads[0].loadFailed).toBe(false);
  });
});
