import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return { ...actual, lessonsApi: { ...actual.lessonsApi, list } };
});

import { useLessonLibrary } from "./useLessonLibrary";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * C06. "Processing your lesson... It will appear here when it's done" - and
 * the library was read once, so it never did until the teacher reloaded.
 */

const lesson = (id: string, status: string) =>
  ({
    id,
    title: `Lesson ${id}`,
    status,
    sourceType: "pdf",
    segmentCount: 3,
    reviewSegmentCount: 0,
    createdAt: "2026-10-01T09:00:00Z",
  }) as never;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher" as never,
  });
  list.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  clearSession();
});

describe("the library while a lesson is still being read", () => {
  it("reads again until the lesson is done, and shows it done", async () => {
    list
      .mockResolvedValueOnce([lesson("l-1", "processing")])
      .mockResolvedValueOnce([lesson("l-1", "completed")]);
    const { result } = renderHook(() => useLessonLibrary());
    await waitFor(() => expect(result.current.cards[0]?.kind).toBe("parsing"));

    await act(async () => void vi.advanceTimersByTime(10_000));

    await waitFor(() => expect(result.current.cards[0]?.kind).toBe("normal"));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("stops asking once nothing is being read", async () => {
    list
      .mockResolvedValueOnce([lesson("l-1", "pending")])
      .mockResolvedValue([lesson("l-1", "completed")]);
    const { result } = renderHook(() => useLessonLibrary());
    await waitFor(() => expect(result.current.cards[0]?.kind).toBe("parsing"));
    await act(async () => void vi.advanceTimersByTime(10_000));
    // The answer has to have LANDED, not just been asked for, before the
    // library knows nothing is being read.
    await waitFor(() => expect(result.current.cards[0]?.kind).toBe("normal"));
    const asked = list.mock.calls.length;

    await act(async () => void vi.advanceTimersByTime(60_000));

    expect(list).toHaveBeenCalledTimes(asked);
  });

  it("asks nothing more of a library with nothing being read", async () => {
    list.mockResolvedValue([lesson("l-1", "completed")]);
    renderHook(() => useLessonLibrary());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    await act(async () => void vi.advanceTimersByTime(60_000));

    expect(list).toHaveBeenCalledTimes(1);
  });

  it("looks again as soon as the tab is looked at again", async () => {
    list.mockResolvedValue([lesson("l-1", "processing")]);
    renderHook(() => useLessonLibrary());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});
