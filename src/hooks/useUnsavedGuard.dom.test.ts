import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUnsavedGuard } from "./useUnsavedGuard";

/**
 * The browser's own "Leave site?" prompt, raised only while there is work to
 * lose (audit C17). Cancelling `beforeunload` is what makes a browser ask.
 */

/** Whether the browser would ask before leaving: the event was cancelled. */
const leavingAsks = () => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("leaving with unsent work", () => {
  it("asks while there is something to lose", () => {
    renderHook(() => useUnsavedGuard(true));

    expect(leavingAsks()).toBe(true);
  });

  it("does not ask when there is nothing to lose", () => {
    renderHook(() => useUnsavedGuard(false));

    expect(leavingAsks()).toBe(false);
  });

  it("stops asking once the work is sent", () => {
    const { rerender } = renderHook(({ on }) => useUnsavedGuard(on), {
      initialProps: { on: true },
    });
    rerender({ on: false });

    expect(leavingAsks()).toBe(false);
  });

  it("stops asking when the screen goes", () => {
    const { unmount } = renderHook(() => useUnsavedGuard(true));
    unmount();

    expect(leavingAsks()).toBe(false);
  });
});
