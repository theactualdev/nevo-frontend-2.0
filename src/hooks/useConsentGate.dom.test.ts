import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useConsentGate } from "./useConsentGate";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * A child whose guardian had withdrawn consent kept being profiled.
 *
 * `GET /api/v1/students/me/consent-gate` has been deployed for some time, and
 * `consentsApi.myConsentGate` had **zero callers**. Nothing in the student app
 * ever asked. The baseline and the daily warm-up read this hook now - see
 * `ProfilingFlow` and `WarmUpRun`.
 *
 * The delicate part is the DEFAULT, and it cuts both ways:
 *   - Defaulting to withdrawn would silently stop measuring children whose
 *     guardians consented, every time the network hiccupped.
 *   - Defaulting to allowed means a bounded window — one request — where a
 *     withdrawn child is still captured.
 *
 * The second is chosen, and both halves are pinned here, because a default that
 * drifts either way is the whole behaviour.
 */

const { myConsentGate } = vi.hoisted(() => ({ myConsentGate: vi.fn() }));
vi.mock("@/lib/api/consents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/consents")>();
  return { ...actual, consentsApi: { ...actual.consentsApi, myConsentGate } };
});

const gate = (status: string) => ({
  studentId: "student-1",
  granted: status === "granted",
  requiredType: "learning_data",
  status,
});

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });

beforeEach(() => {
  myConsentGate.mockReset();
  clearSession();
  window.localStorage.clear();
});

afterEach(() => {
  clearSession();
  window.localStorage.clear();
});

describe("useConsentGate", () => {
  it("reports a withdrawal, which is the one answer it may act on", async () => {
    signIn();
    myConsentGate.mockResolvedValue(gate("withdrawn"));

    const { result } = renderHook(() => useConsentGate());

    await waitFor(() => expect(result.current.withdrawn).toBe(true));
  });

  it("does not treat a granted gate as a withdrawal", async () => {
    signIn();
    myConsentGate.mockResolvedValue(gate("granted"));

    const { result } = renderHook(() => useConsentGate());

    await waitFor(() => expect(result.current.known).toBe(true));
    expect(result.current.withdrawn).toBe(false);
  });

  it("does not treat a pending gate as a withdrawal either", async () => {
    // `not_sent` and `pending` are not refusals. Only withdrawal is.
    signIn();
    myConsentGate.mockResolvedValue(gate("pending"));

    const { result } = renderHook(() => useConsentGate());

    await waitFor(() => expect(result.current.known).toBe(true));
    expect(result.current.withdrawn).toBe(false);
  });

  it("does not stop measuring a consented child because the read failed", async () => {
    /*
     * A failed read is not a withdrawal. Treating it as one would silently stop
     * profiling children whose guardians consented, every time the network
     * hiccupped, and nobody would ever see it happen.
     *
     * The wait below is on the CALL, not on `known` — `known` is false before
     * the request and false after it fails, so waiting on it asserted nothing
     * and this test passed against a hook that did treat failure as refusal.
     */
    signIn();
    myConsentGate.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useConsentGate());

    await waitFor(() => expect(myConsentGate).toHaveBeenCalled());
    // Let the rejection and its setState settle before asking.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.withdrawn).toBe(false);
  });

  it("does not claim to know before the answer arrives", async () => {
    // `known` is what separates "consent is fine" from "we have not asked".
    signIn();
    myConsentGate.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useConsentGate());

    expect(result.current.known).toBe(false);
    expect(result.current.withdrawn).toBe(false);
  });

  it("does not ask on behalf of a signed-out visitor", async () => {
    // The walkthrough has no child to have consent for, and the endpoint is
    // Bearer-only — asking would be a guaranteed 401 on every page load.
    renderHook(() => useConsentGate());

    await new Promise((r) => setTimeout(r, 20));
    expect(myConsentGate).not.toHaveBeenCalled();
  });
});
