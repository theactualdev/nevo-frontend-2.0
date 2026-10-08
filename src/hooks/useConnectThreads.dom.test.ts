import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { threads, thread, send } = vi.hoisted(() => ({
  threads: vi.fn(),
  thread: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/lib/api/messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/messages")>();
  return { ...actual, messagesApi: { ...actual.messagesApi, threads, thread, send } };
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

/**
 * T162. The send response names the message's AUTHOR. A thread the teacher
 * started from compose was titled with their own name - and initials - until
 * the list was read again.
 */
describe("a thread the teacher starts", () => {
  const SAVED = {
    id: "m-1",
    threadId: "t-new",
    senderId: "t-9",
    senderName: "Ms Adeyemi",
    content: "Well done on the quiz.",
    createdAt: "2026-10-08T09:00:00Z",
  };

  it("is titled with the child it is to, and their class", async () => {
    send.mockResolvedValue(SAVED);
    const { result } = renderHook(() => useConnectThreads());
    await waitFor(() => expect(result.current.threads[0]?.id).toBe("t-1"));

    await act(async () => {
      await result.current.send(
        { recipientId: "s-2", recipientType: "student" },
        "Well done on the quiz.",
        { name: "Tunde Bello", className: "Year 7 Blue" },
      );
    });

    const started = result.current.threads.find((t) => t.id === "t-new");
    expect(started?.studentName).toBe("Tunde Bello");
    expect(started?.initials).toBe("TB");
    expect(started?.className).toBe("Year 7 Blue");
  });

  it("is never titled with the teacher's own name", async () => {
    send.mockResolvedValue(SAVED);
    const { result } = renderHook(() => useConnectThreads());
    await waitFor(() => expect(result.current.threads[0]?.id).toBe("t-1"));

    await act(async () => {
      await result.current.send({ recipientId: "s-2", recipientType: "student" }, "Hi");
    });

    const started = result.current.threads.find((t) => t.id === "t-new");
    expect(started?.studentName).not.toBe("Ms Adeyemi");
    expect(started?.studentName).toBe("New conversation");
  });
});
