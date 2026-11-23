import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { clearSession, setSession } from "@/lib/auth/session";
import type { LessonDetailResponse } from "@/lib/api/lessons";
import {
  forgetWithdrawals,
  saveLesson,
  withdrawSavedLesson,
} from "@/lib/offline/savedLessons";
import { SHELF_CHANGED } from "@/lib/offline/shelfCheck";
import { FRESH_DOWNLOAD } from "@/lib/offline/testDownload";
import { useWithdrawnForSafety } from "./useWithdrawnForSafety";

/**
 * L14 (Lydia, 19 Nov): the route learns that the copy a lesson is open from
 * was withdrawn for safety, as the connection's check answers - and only for
 * a lesson open from its copy.
 */

const detail = { id: "l1", title: "Lesson l1", segments: [] } as unknown as LessonDetailResponse;

const withdraw = () =>
  act(() => {
    withdrawSavedLesson("student-1", "l1");
    window.dispatchEvent(new Event(SHELF_CHANGED));
  });

beforeEach(() => {
  window.localStorage.clear();
  forgetWithdrawals();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });
  saveLesson("student-1", detail, FRESH_DOWNLOAD);
});

afterEach(() => clearSession());

describe("useWithdrawnForSafety", () => {
  it("turns true when the open copy is withdrawn", () => {
    const { result } = renderHook(() => useWithdrawnForSafety("l1", true));
    expect(result.current).toBe(false);

    withdraw();

    expect(result.current).toBe(true);
  });

  it("stays false for a lesson read from the server: that one is the server's", () => {
    const { result } = renderHook(() => useWithdrawnForSafety("l1", false));

    withdraw();

    expect(result.current).toBe(false);
  });

  it("stays false for another lesson's withdrawal", () => {
    const { result } = renderHook(() => useWithdrawnForSafety("l2", true));

    withdraw();

    expect(result.current).toBe(false);
  });
});
