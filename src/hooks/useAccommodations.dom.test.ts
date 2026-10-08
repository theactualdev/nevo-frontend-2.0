import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAccommodations, useAccommodationsState } from "./useAccommodations";
import { ApiError } from "@/lib/api/client";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * The accommodations a SEND child had been granted never reached them.
 *
 * The engine computes them, the teacher's screen lists them as active support
 * Nevo has turned on, and the player is built to apply them — a spacious body
 * for `reading`, a chunked flow and dimmed chrome for `attention`. Nothing ever
 * fetched them for the child. `AdaptationPlan.accommodations` was undefined for
 * every signed-in learner, and the only plan that ever carried one was the
 * authored mock a signed-OUT visitor sees. The demo had the accommodation; the
 * child it was built for did not.
 *
 * THE DEFAULT IS THE DELICATE PART, and it points the opposite way to
 * `useConsentGate` on purpose:
 *   - There, a failed read must NOT stop a consented child being measured, so
 *     silence means carry on.
 *   - Here, a failed read must NOT invent a provision. An accommodation is a
 *     claim that Nevo is doing something particular for this child, and a
 *     network error is not evidence for it.
 *
 * THE READ IS THE SESSION-START STATE (B24, audit 50): one answer, from one
 * moment, carrying the accommodations beside the engine's configuration and
 * the consent state. That route is not yet confirmed for a child's own token,
 * so any failure but a dead session falls back to the confirmed accommodations
 * route (B22) - never a crash, never a lost accommodation, and never one we
 * made up.
 */

const { accommodations, sessionState } = vi.hoisted(() => ({
  accommodations: vi.fn(),
  sessionState: vi.fn(),
}));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, accommodations } };
});
vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: { ...actual.intelligenceApi, sessionState },
  };
});

/** The confirmed route's answer (B22), the fallback. */
const fallback = (active: string[]) => ({
  studentId: "student-1",
  activeAccommodations: active,
  frontendSignals: [],
  signals: [],
  source: "engine",
  persistedAsLabel: false,
});

const answer = (active?: string[]) => ({
  studentId: "student-1",
  configured: true,
  engineConfig: {},
  baselineVersion: 1,
  ...(active ? { accommodations: active } : {}),
  consentState: "given",
});

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });

/** Let a rejection and its setState settle before asking what was decided. */
const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  accommodations.mockReset();
  sessionState.mockReset();
  clearSession();
  window.localStorage.clear();
});

afterEach(() => {
  clearSession();
  window.localStorage.clear();
});

describe("useAccommodations", () => {
  it("turns on the accommodation the engine says is active", async () => {
    // The defect in one line: this is what the teacher is already being shown.
    signIn();
    sessionState.mockResolvedValue(answer(["reading"]));

    const { result } = renderHook(() => useAccommodations());

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.reading).toBe(true);
  });

  it("asks for the signed-in child, not for somebody else", async () => {
    // The route takes a student id in the path. Reading another child's
    // accommodations would be a data leak, and reading nobody's is a 404.
    signIn();
    sessionState.mockResolvedValue(answer([]));

    renderHook(() => useAccommodations());

    await waitFor(() =>
      expect(sessionState).toHaveBeenCalledWith("student-1"),
    );
  });

  it("leaves the ones it was not told about off", async () => {
    /*
     * Without this a test that only ever checked the granted one would pass
     * against a hook that turned everything on.
     */
    signIn();
    sessionState.mockResolvedValue(answer(["attention"]));

    const { result } = renderHook(() => useAccommodations());

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.attention).toBe(true);
    expect(result.current?.reading).toBe(false);
    expect(result.current?.numerical).toBe(false);
  });

  it("carries more than one at a time", async () => {
    signIn();
    sessionState.mockResolvedValue(answer(["reading", "attention"]));

    const { result } = renderHook(() => useAccommodations());

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.reading).toBe(true);
    expect(result.current?.attention).toBe(true);
  });

  it("does not invent an accommodation when both reads fail", async () => {
    // A network error is not evidence that a child was granted anything.
    signIn();
    sessionState.mockRejectedValue(new ApiError(0, "Network"));
    accommodations.mockRejectedValue(new ApiError(0, "Network"));

    const { result } = renderHook(() => useAccommodations());

    await waitFor(() => expect(accommodations).toHaveBeenCalled());
    await settle();

    expect(result.current).toBeNull();
  });

  it("comes from the session-start read, not a second route", async () => {
    // One read, so the accommodations and the rest of the session's state
    // cannot disagree. The evidence route stays the teacher's.
    signIn();
    sessionState.mockResolvedValue(answer(["reading"]));

    const { result } = renderHook(() => useAccommodations());

    await waitFor(() => expect(result.current?.reading).toBe(true));
    expect(accommodations).not.toHaveBeenCalled();
  });

  it("turns none on when the answer carries no list", async () => {
    // `accommodations` is outside the schema's required list.
    signIn();
    sessionState.mockResolvedValue(answer());

    const { result } = renderHook(() => useAccommodations());

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toEqual({
      reading: false,
      attention: false,
      numerical: false,
    });
  });

  it("falls back to the confirmed route when a child's own token is refused", async () => {
    /*
     * The session-state route is not yet confirmed for a child's own token;
     * the accommodations route is (B22). A 403 is a scope refusal, not a dead
     * session, and must not cost the child their accommodation.
     */
    signIn();
    sessionState.mockRejectedValue(new ApiError(403, "Forbidden"));
    accommodations.mockResolvedValue(fallback(["reading"]));

    const { result } = renderHook(() => useAccommodations());

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.reading).toBe(true);
    expect(accommodations).toHaveBeenCalledWith("student-1");
  });

  it.each([
    ["missing", 404],
    ["rejected", 422],
    ["a server failure", 503],
    ["the network", 0],
  ])("falls back on %s too", async (_, status) => {
    signIn();
    sessionState.mockRejectedValue(new ApiError(status, "no"));
    accommodations.mockResolvedValue(fallback(["attention"]));

    const { result } = renderHook(() => useAccommodations());

    await waitFor(() => expect(result.current?.attention).toBe(true));
  });

  it("leaves a dead session to the client, and asks nothing more", async () => {
    // A 401 is `handleAuthFailure`'s; there is no child left to read for.
    signIn();
    sessionState.mockRejectedValue(new ApiError(401, "Unauthorized"));

    const { result } = renderHook(() => useAccommodations());

    await waitFor(() => expect(sessionState).toHaveBeenCalled());
    await settle();

    expect(accommodations).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("keeps the first frame waiting for the fallback's answer (rule 6)", async () => {
    signIn();
    sessionState.mockRejectedValue(new ApiError(403, "Forbidden"));
    let land: (v: unknown) => void = () => {};
    accommodations.mockReturnValue(new Promise((resolve) => (land = resolve)));

    const { result } = renderHook(() => useAccommodationsState());

    await waitFor(() => expect(accommodations).toHaveBeenCalled());
    await settle();
    expect(result.current.settled).toBe(false);

    await act(async () => land(fallback(["reading"])));

    expect(result.current.settled).toBe(true);
    expect(result.current.active?.reading).toBe(true);
  });

  it("does not ask on behalf of a signed-out visitor", async () => {
    // The walkthrough has no child to hold an accommodation, and the route is
    // Bearer-only — asking would be a guaranteed 401 on every lesson open.
    renderHook(() => useAccommodations());

    await new Promise((r) => setTimeout(r, 20));
    expect(sessionState).not.toHaveBeenCalled();
  });
});
