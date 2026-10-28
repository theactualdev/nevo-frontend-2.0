import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useStudentFlags } from "./useStudentFlags";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * The read behind C08's noticing banner.
 *
 * THE DEFECT THIS EXISTS FOR is the scope. `GET /api/intelligence/flags` with
 * no `studentId` returns every flag the teacher can see, and this banner
 * renders under one named child - so a dropped parameter would print another
 * child's notice on this child's profile. Nothing about the copy would look
 * wrong. That is the one mistake here that a teacher could act on.
 */

const { getFlags } = vi.hoisted(() => ({ getFlags: vi.fn() }));
vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: { ...actual.intelligenceApi, getFlags },
  };
});

const flag = (over = {}) => ({
  id: "f-1",
  studentId: "s-1",
  flagType: "sudden_change",
  description: "Sessions have been getting shorter.",
  generatedAt: "2026-09-15T09:00:00Z",
  acknowledged: false,
  ...over,
});

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  getFlags.mockReset();
  clearSession();
  window.localStorage.clear();
  signIn();
});

afterEach(() => {
  clearSession();
});

describe("scope", () => {
  it("asks only about the child whose profile this is", async () => {
    getFlags.mockResolvedValue([flag()]);

    renderHook(() => useStudentFlags("s-1"));

    await waitFor(() => expect(getFlags).toHaveBeenCalled());
    expect(getFlags).toHaveBeenCalledWith({ studentId: "s-1", openOnly: true });
  });

  it("re-asks when the profile changes to another child", async () => {
    getFlags.mockResolvedValue([]);

    const { rerender } = renderHook(({ id }) => useStudentFlags(id), {
      initialProps: { id: "s-1" },
    });
    await waitFor(() => expect(getFlags).toHaveBeenCalledTimes(1));

    rerender({ id: "s-2" });

    await waitFor(() => expect(getFlags).toHaveBeenCalledTimes(2));
    expect(getFlags).toHaveBeenLastCalledWith({ studentId: "s-2", openOnly: true });
  });
});

describe("what comes back", () => {
  it("hands the banner the flags that are still open", async () => {
    getFlags.mockResolvedValue([flag(), flag({ id: "f-2", acknowledged: true })]);

    const { result } = renderHook(() => useStudentFlags("s-1"));

    await waitFor(() => expect(result.current.noticed).toHaveLength(1));
    expect(result.current.noticed[0].note).toBe(
      "Sessions have been getting shorter.",
    );
    expect(result.current.failed).toBe(false);
  });

  it("says nothing, and does not throw, if the answer is not a list", async () => {
    // This route returns a bare array. An error body arriving with a 200 used
    // to be a `.filter is not a function` crash on whichever screen read it.
    getFlags.mockResolvedValue({ detail: "nope" });

    const { result } = renderHook(() => useStudentFlags("s-1"));

    await settle();
    expect(result.current.noticed).toEqual([]);
  });

  it("reports a failed read rather than an empty banner", async () => {
    // The profile leans on this: it falls back to the count it was given.
    getFlags.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useStudentFlags("s-1"));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.noticed).toEqual([]);
  });

  it("makes no request for a teacher who is not signed in", async () => {
    clearSession();
    window.localStorage.clear();

    renderHook(() => useStudentFlags("s-1"));

    await settle();
    expect(getFlags).not.toHaveBeenCalled();
  });
});
