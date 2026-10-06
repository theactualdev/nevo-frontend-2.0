import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { misconceptions, mastery, narrative, getFlags } = vi.hoisted(() => ({
  misconceptions: vi.fn(),
  mastery: vi.fn(),
  narrative: vi.fn(),
  getFlags: vi.fn(),
}));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    classInsightsApi: { misconceptions, mastery, narrative },
  };
});
vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: { ...actual.intelligenceApi, getFlags },
  };
});
vi.mock("@/hooks/useStudentDirectory", () => ({
  useStudentDirectory: () => ({ students: [], loading: false, failed: false, live: true }),
}));

import { useClassInsights } from "./useClassInsights";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * WHOSE JUDGEMENT THE WEEKLY READING IS.
 *
 * This hook decided it from the length of three arrays: no misconceptions, no
 * mastery rows and no flags meant "still gathering insights". That is a
 * threshold in the client, which frontend section 6 rules out, and it cannot
 * tell a settled week from a new class - so a class having a genuinely good
 * week was told Nevo had not seen enough of it yet.
 *
 * The engine answers it now. `ClassInsightState`'s own description in the
 * contract is that defect written down: "The engine owns the threshold and the
 * copy; the client renders what it is given."
 *
 * The screen above mocks this hook, so these are the only tests that can see
 * any of it.
 *
 * ONE THING HERE IS COVERED BY A DIFFERENT GATE, and a mutation run is how I
 * know: pointing `narrative` at the wrong URL kills none of these tests,
 * because every one of them mocks the wrapper. `npm run contract` catches it
 * outright - "GET /api/v1/classes/${}/narrative is not in the deployed spec" -
 * and that gate runs on every PR. A wire-level test here would duplicate it.
 */

const NARRATIVE = {
  classId: "c-1",
  className: "JSS 2A",
  weeklySummary: "Eight students slowed on the same step.",
  lookingAhead: "Common denominators on Thursday.",
  generatedAt: "2026-09-21T09:00:00Z",
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
  misconceptions.mockReset().mockResolvedValue([]);
  mastery.mockReset().mockResolvedValue([]);
  getFlags.mockReset().mockResolvedValue([]);
  narrative.mockReset().mockResolvedValue(NARRATIVE);
});

describe("the written week", () => {
  it("is read at all", async () => {
    const { result } = renderHook(() => useClassInsights("c-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(narrative).toHaveBeenCalledWith("c-1");
    expect(result.current.summary).toBe("Eight students slowed on the same step.");
    expect(result.current.lookingAhead).toBe("Common denominators on Thursday.");
  });
});

describe("which week the engine says this is", () => {
  it("says gathering only when the engine does", async () => {
    narrative.mockResolvedValue({ ...NARRATIVE, state: "gathering" });
    const { result } = renderHook(() => useClassInsights("c-1"));

    await waitFor(() => expect(result.current.gathering).toBe(true));
    expect(result.current.settledWeek).toBe(false);
  });

  it("calls a settled week settled, with everything else empty", async () => {
    /*
     * THE DEFECT, at the level it was written. Three empty reads used to be
     * enough to tell this class Nevo was still gathering insights about it.
     */
    narrative.mockResolvedValue({ ...NARRATIVE, state: "settled" });
    const { result } = renderHook(() => useClassInsights("c-1"));

    await waitFor(() => expect(result.current.settledWeek).toBe(true));
    expect(result.current.gathering).toBe(false);
  });

  it("reads an absent state as summary, never as unknown", async () => {
    // `state` is optional with a default of `summary` on the schema. A server
    // that says nothing is not a server that does not know.
    narrative.mockResolvedValue(NARRATIVE);
    const { result } = renderHook(() => useClassInsights("c-1"));

    await waitFor(() => expect(result.current.state).toBe("summary"));
    expect(result.current.gathering).toBe(false);
  });

  it("claims nothing about the week when the narrative did not arrive", async () => {
    // Three empty lists and no answer from the engine. The old code called
    // this "still gathering"; there is no longer anything that would.
    narrative.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useClassInsights("c-1"));

    await waitFor(() => expect(result.current.narrativeFailed).toBe(true));
    expect(result.current.gathering).toBe(false);
    expect(result.current.settledWeek).toBe(false);
    expect(result.current.state).toBeNull();
  });
});

describe("what failed", () => {
  it("does not call the whole screen failed for a missing summary", async () => {
    // The three sections landed. Only the written week is missing.
    narrative.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useClassInsights("c-1"));

    await waitFor(() => expect(result.current.narrativeFailed).toBe(true));
    expect(result.current.failed).toBe(false);
  });

  it("calls it failed when the three reads all failed", async () => {
    misconceptions.mockRejectedValue(new Error("down"));
    mastery.mockRejectedValue(new Error("down"));
    getFlags.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useClassInsights("c-1"));

    await waitFor(() => expect(result.current.failed).toBe(true));
  });

  it("waits for all four before it says anything", async () => {
    narrative.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useClassInsights("c-1"));

    await waitFor(() => expect(misconceptions).toHaveBeenCalled());
    expect(result.current.loading).toBe(true);
  });
});

describe("which list failed", () => {
  it("names the one that failed, and only that one", async () => {
    misconceptions.mockResolvedValue([]);
    mastery.mockResolvedValue([]);
    narrative.mockResolvedValue(NARRATIVE);
    getFlags.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useClassInsights("c-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sectionFailed).toEqual({
      misconceptions: false,
      mastery: false,
      flags: true,
    });
    expect(result.current.failed).toBe(false);
  });

  it("names mastery when mastery failed", async () => {
    misconceptions.mockResolvedValue([]);
    mastery.mockRejectedValue(new Error("network"));
    narrative.mockResolvedValue(NARRATIVE);
    getFlags.mockResolvedValue([]);
    const { result } = renderHook(() => useClassInsights("c-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sectionFailed.mastery).toBe(true);
    expect(result.current.sectionFailed.flags).toBe(false);
  });
});

describe("a class's flags", () => {
  it("asks for a whole page of them, not the default 50", async () => {
    misconceptions.mockResolvedValue([]);
    mastery.mockResolvedValue([]);
    narrative.mockResolvedValue(NARRATIVE);
    getFlags.mockResolvedValue([]);
    renderHook(() => useClassInsights("c-1"));

    await waitFor(() => expect(getFlags).toHaveBeenCalledWith({ classId: "c-1", limit: 200 }));
  });
});

describe("a class mastery row with no name", () => {
  it("is left out, as on the student profile", async () => {
    misconceptions.mockResolvedValue([]);
    mastery.mockResolvedValue([
      { conceptId: "c-1", conceptName: "Fractions", masteryProbabilityConcept: 0.6, masteryProbabilityReading: 0.5, studentCount: 7 },
      { conceptId: "c-2", conceptName: null, masteryProbabilityConcept: 0.4, masteryProbabilityReading: 0.3, studentCount: 7 },
    ]);
    narrative.mockResolvedValue(NARRATIVE);
    getFlags.mockResolvedValue([]);
    const { result } = renderHook(() => useClassInsights("c-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.concepts.map((c) => c.name)).toEqual(["Fractions"]);
  });
});
