import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { detail, modules, list } = vi.hoisted(() => ({
  detail: vi.fn(),
  modules: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: { ...actual.lessonsApi, detail, modules, classProgress: vi.fn() },
  };
});
vi.mock("@/lib/api/assignments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/assignments")>();
  return { ...actual, assignmentsApi: { ...actual.assignmentsApi, list } };
});

import { useLessonDetail } from "./useLessonDetail";
import { ApiError } from "@/lib/api/client";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * MISSING, FAILED, AND "WE COULD NOT FIND OUT WHO HAS IT".
 *
 * Three answers the route and the page draw differently, and none of them was
 * tested. A malformed id was a retry that could never succeed; a failed
 * assignments read was indistinguishable from a lesson nobody had.
 */

const LESSON = { id: "l-1", title: "Fractions", segments: [], status: "completed" };

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
  detail.mockReset().mockResolvedValue(LESSON);
  modules.mockReset().mockResolvedValue([]);
  list.mockReset().mockResolvedValue([]);
});

describe("a lesson id that cannot be a lesson", () => {
  it("is not-found, not a retry, when the server rejects its shape", async () => {
    // The id is a uuid, and the spec answers a malformed one with 422.
    detail.mockRejectedValue(new ApiError(422, "unprocessable"));
    const { result } = renderHook(() => useLessonDetail("not-a-uuid"));

    await waitFor(() => expect(result.current.missing).toBe(true));
    expect(result.current.failed).toBe(false);
  });

  it("is not-found on a 404, as before", async () => {
    detail.mockRejectedValue(new ApiError(404, "not found"));
    const { result } = renderHook(() => useLessonDetail("l-gone"));

    await waitFor(() => expect(result.current.missing).toBe(true));
  });

  it("is a retry when the server broke - the lesson may well exist", async () => {
    detail.mockRejectedValue(new ApiError(500, "server"));
    const { result } = renderHook(() => useLessonDetail("l-1"));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.missing).toBe(false);
  });
});

describe("who has this lesson", () => {
  it("says the read failed, rather than that nobody has it", async () => {
    list.mockRejectedValue(new ApiError(500, "server"));
    const { result } = renderHook(() => useLessonDetail("l-1"));

    await waitFor(() => expect(result.current.assignmentsFailed).toBe(true));
    expect(result.current.assignments).toEqual([]);
  });

  it("says nothing failed when the read landed empty", async () => {
    const { result } = renderHook(() => useLessonDetail("l-1"));

    await waitFor(() => expect(result.current.lesson).not.toBeNull());
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(result.current.assignmentsFailed).toBe(false);
  });

  it("does not fail the page over it", async () => {
    list.mockRejectedValue(new ApiError(500, "server"));
    const { result } = renderHook(() => useLessonDetail("l-1"));

    await waitFor(() => expect(result.current.lesson).not.toBeNull());
    expect(result.current.failed).toBe(false);
  });
});
