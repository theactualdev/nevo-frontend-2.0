import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { clearSession, setSession } from "@/lib/auth/session";
import { clearAllKeptDrafts, readKeptDraft, writeKeptDraft } from "@/lib/drafts/keptDraft";
import { releaseUnsavedGuards } from "@/lib/auth/unsavedRelease";
import { useKeptDraft } from "./useKeptDraft";
import { useUnsavedGuard } from "./useUnsavedGuard";

/**
 * SCRUM-246, part 2: "SESSION EXPIRING: no dialog, keep the work ... when the
 * teacher signs back in the edits are still there on that page", and "the
 * restored draft is clearly the teacher's own unsaved work, not silently
 * merged into a saved version".
 */
const signIn = (userId: string) =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId,
    role: "teacher",
  });

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  signIn("t-1");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the kept draft store", () => {
  it("is only ever offered back to the teacher who wrote it", () => {
    writeKeptDraft("share:s-1", "A note.");
    expect(readKeptDraft("share:s-1")?.value).toBe("A note.");

    clearSession();
    signIn("t-2");
    expect(readKeptDraft("share:s-1")).toBeNull();
  });

  it("offers nothing older than a week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T09:00:00Z"));
    writeKeptDraft("feedback", "Old words.");
    vi.setSystemTime(new Date("2026-10-09T09:00:00Z"));

    expect(readKeptDraft("feedback")).toBeNull();
  });

  it("clears only the signed-in teacher's drafts on a sign-out", () => {
    writeKeptDraft("feedback", "Mine.");
    clearSession();
    signIn("t-2");
    writeKeptDraft("feedback", "Theirs.");

    clearAllKeptDrafts();
    expect(readKeptDraft("feedback")).toBeNull();
    clearSession();
    signIn("t-1");
    expect(readKeptDraft("feedback")?.value).toBe("Mine.");
  });

  it("keeps nothing without a session to say whose it is", () => {
    clearSession();
    writeKeptDraft("feedback", "Nobody's.");

    expect(window.localStorage.length).toBe(0);
  });
});

describe("useKeptDraft", () => {
  it("offers a draft left from before, and does not lay it over the screen", () => {
    writeKeptDraft("share:s-1", "What I was writing.");
    const { result } = renderHook(() => useKeptDraft("share:s-1", "", false));

    expect(result.current.kept).toBe("What I was writing.");
    // Still there: an empty screen must not wipe the draft it is offering.
    expect(readKeptDraft("share:s-1")?.value).toBe("What I was writing.");
  });

  it("hands the draft back when the teacher puts it back", () => {
    writeKeptDraft("share:s-1", "What I was writing.");
    const { result } = renderHook(() => useKeptDraft("share:s-1", "", false));

    let back: string | null = null;
    act(() => {
      back = result.current.restore();
    });
    expect(back).toBe("What I was writing.");
    expect(result.current.kept).toBeNull();
  });

  it("lets it go when the teacher discards it", () => {
    writeKeptDraft("share:s-1", "What I was writing.");
    const { result } = renderHook(() => useKeptDraft("share:s-1", "", false));

    act(() => result.current.discard());
    expect(result.current.kept).toBeNull();
    expect(readKeptDraft("share:s-1")).toBeNull();
  });

  it("keeps work while it is unsaved, and lets it go once it is not", () => {
    const { rerender } = renderHook(
      ({ value, dirty }) => useKeptDraft("feedback", value, dirty),
      { initialProps: { value: "Half a thought", dirty: true } },
    );
    expect(readKeptDraft("feedback")?.value).toBe("Half a thought");

    rerender({ value: "", dirty: false });
    expect(readKeptDraft("feedback")).toBeNull();
  });

  it("keeps nothing with no record to key it to", () => {
    renderHook(() => useKeptDraft(null, "Words", true));

    const keys = Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i));
    expect(keys.some((k) => k?.startsWith("nevo.draft."))).toBe(false);
  });
});

describe("the Leave site? prompt when the session ends", () => {
  it("stands down once the console is leaving on the teacher's behalf", () => {
    renderHook(() => useUnsavedGuard(true));
    const before = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(true);

    releaseUnsavedGuards();
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
