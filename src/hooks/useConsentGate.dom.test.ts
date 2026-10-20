import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { consentAnswer, useConsentGate } from "./useConsentGate";
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
 *
 * AND SINCE 19 OCT, NEITHER IS PERMISSION. A failed read is still not a
 * withdrawal, but it is its own answer now - `unreadable` - and a capture
 * holds on it rather than proceeding (the last block below).
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

/*
 * NOT KNOWING IS NOT PERMISSION (19 Oct browser-storage audit; rule 5). A
 * failed read still stops nothing - it is not a withdrawal - but it is no
 * longer the same as an answer either: a capture holds on it. So the hook
 * says which of the three it is, and never one child's answer for another.
 */
describe("useConsentGate — answered, still asking, or no answer to be had", () => {
  const flush = () =>
    act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

  it("says a failed read could not be read: not known, and not withdrawn", async () => {
    signIn();
    myConsentGate.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useConsentGate());
    await waitFor(() => expect(myConsentGate).toHaveBeenCalled());
    await flush();

    expect(result.current).toEqual({
      withdrawn: false,
      known: false,
      unreadable: true,
    });
    expect(consentAnswer(result.current)).toBe("unknown");
  });

  it("says nobody signed in cannot be read for", async () => {
    const { result } = renderHook(() => useConsentGate());
    await flush();

    expect(result.current.unreadable).toBe(true);
    expect(consentAnswer(result.current)).toBe("unknown");
  });

  it("is still asking while the read is in flight, which is neither", () => {
    signIn();
    myConsentGate.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useConsentGate());

    expect(result.current).toEqual({
      withdrawn: false,
      known: false,
      unreadable: false,
    });
    expect(consentAnswer(result.current)).toBe("pending");
  });

  it("allows a capture only on an answer that is not a withdrawal", async () => {
    signIn();
    myConsentGate.mockResolvedValue(gate("pending"));

    const { result } = renderHook(() => useConsentGate());
    await waitFor(() => expect(result.current.known).toBe(true));

    expect(consentAnswer(result.current)).toBe("allowed");
  });

  it("never hands one child's answer to the next child on the tablet", async () => {
    signIn();
    myConsentGate.mockResolvedValueOnce(gate("withdrawn"));
    const { result } = renderHook(() => useConsentGate());
    await waitFor(() => expect(result.current.withdrawn).toBe(true));

    // The next child signs in; their own read has not answered yet.
    myConsentGate.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      setSession({
        token: "tok-2",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        userId: "student-2",
        role: "student",
      });
      await Promise.resolve();
    });

    expect(result.current.withdrawn).toBe(false);
    expect(consentAnswer(result.current)).toBe("pending");
    expect(myConsentGate).toHaveBeenCalledTimes(2);
  });
});
