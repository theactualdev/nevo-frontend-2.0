import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingBaseline,
  flushPendingBaseline,
  holdBaseline,
  readPendingBaseline,
} from "./pendingBaseline";
import { baselineApi } from "@/lib/api/baseline";
import { consentsApi } from "@/lib/api/consents";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * What this exists to stop happening.
 *
 * `POST /api/baseline/submit` is Bearer. The profiling run is phase 0 of the
 * onboarding sequence; the account is not created until phase 2. So the submit
 * went out with no token, took the 401 as final (`submitWithRetry` does not
 * retry a 4xx), and a `.finally()` purged the capture anyway - destroying the
 * whole measurement, in the run that happens once, for every child except those
 * arriving by SSO.
 *
 * And on a shared school tablet it was worse than destroyed. `/student/onboarding`
 * lets a signed-in child straight through, so where the previous child had not
 * signed out their token was still there - the submit SUCCEEDED, and one child's
 * cognitive assessment was written to another child's account.
 *
 * So the two tests that matter are: it is never thrown away, and it is never
 * sent to the wrong child.
 */

const FEATURES = [{ module: "grid_span", span: 4 }];

const signInAs = (userId: string) =>
  setSession({
    token: `tok-${userId}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId,
    role: "student",
  });

beforeEach(() => {
  window.localStorage.clear();
  clearSession();
  vi.restoreAllMocks();
});

afterEach(() => {
  window.localStorage.clear();
  clearSession();
});

describe("a baseline waiting for its account", () => {
  it("survives the run that captured it", () => {
    // The component that captured this unmounts two screens before the account
    // exists. Holding it in a ref is how the original was lost.
    holdBaseline("sess-1", FEATURES);

    expect(readPendingBaseline()?.features).toEqual(FEATURES);
  });

  it("goes out once the account it belongs to exists", async () => {
    const submit = vi
      .spyOn(baselineApi, "submitWithRetry")
      .mockResolvedValue(true);
    holdBaseline("sess-1", FEATURES);
    signInAs("child-a");

    // `sess-1` is the run that parked it, which is what makes it this child's.
    await expect(flushPendingBaseline("child-a", "sess-1")).resolves.toBe(true);

    expect(submit).toHaveBeenCalledWith("sess-1", FEATURES);
    expect(readPendingBaseline()).toBeNull();
  });

  /*
   * THE HOLE THAT OPENED WHEN THE INVITE PATH STARTED STORING A SESSION.
   *
   * The session check below used to be the whole guard, and it only ever
   * worked because an invite-link child had no token: `session.userId` could
   * not match the new account, so nothing was sent. Now that `acceptJoin`
   * stores a session, that match is true by construction for the new child -
   * and without these two tests it would happily send a vector the PREVIOUS
   * child left parked when their warm-up failed.
   */
  it("does not send an earlier run's vector to the child onboarding now", async () => {
    const submit = vi
      .spyOn(baselineApi, "submitWithRetry")
      .mockResolvedValue(true);
    // Child A's onboarding parked this and never completed.
    holdBaseline("sess-a", FEATURES);
    // Child B now finishes onboarding on the same tablet, with their OWN
    // session - the state the old guard could not tell from the good one.
    signInAs("child-b");

    await expect(flushPendingBaseline("child-b", "sess-b")).resolves.toBe(
      false,
    );

    expect(submit).not.toHaveBeenCalled();
    expect(readPendingBaseline()?.sessionId).toBe("sess-a");
  });

  it("does not send one child's warm-up under another child's account", async () => {
    const submit = vi
      .spyOn(baselineApi, "submitWithRetry")
      .mockResolvedValue(true);
    // Child A is signed in and their warm-up submit fails, so it parks WITH
    // their id on it.
    holdBaseline("sess-a", FEATURES, "child-a");
    // Child B then onboards on the same device.
    signInAs("child-b");

    await expect(flushPendingBaseline("child-b", "sess-b")).resolves.toBe(
      false,
    );

    expect(submit).not.toHaveBeenCalled();
    expect(readPendingBaseline()?.ownerUserId).toBe("child-a");
  });

  it("delivers an owned warm-up vector to its owner, with no run id", async () => {
    // What the student shell does on every screen: no run to name, so only a
    // vector that carries its owner can go.
    const submit = vi
      .spyOn(baselineApi, "submitWithRetry")
      .mockResolvedValue(true);
    holdBaseline("sess-a", FEATURES, "child-a");
    signInAs("child-a");

    await expect(flushPendingBaseline("child-a")).resolves.toBe(true);

    expect(submit).toHaveBeenCalledWith("sess-a", FEATURES);
  });

  it("does not send a parked vector once consent has been withdrawn", async () => {
    // The case the capture-side gates cannot reach: parked while consent
    // stood, flushed after it was withdrawn.
    const submit = vi
      .spyOn(baselineApi, "submitWithRetry")
      .mockResolvedValue(true);
    vi.spyOn(consentsApi, "myConsentGate").mockResolvedValue({
      studentId: "child-a",
      granted: false,
      blocked: false,
      requiredType: "data_processing",
      status: "withdrawn",
    });
    holdBaseline("sess-1", FEATURES, "child-a");
    signInAs("child-a");

    await expect(flushPendingBaseline("child-a")).resolves.toBe(false);

    expect(submit).not.toHaveBeenCalled();
    // Discarded, not kept: retaining it would leave the measurements on the
    // device after the moment we were told to stop processing them.
    expect(readPendingBaseline()).toBeNull();
  });

  it("still sends where consent was never granted but was not withdrawn", async () => {
    // Three of the four statuses are `granted: false`, and only one of them
    // means stop. Reading `granted` instead of `status` would stop all three.
    const submit = vi
      .spyOn(baselineApi, "submitWithRetry")
      .mockResolvedValue(true);
    vi.spyOn(consentsApi, "myConsentGate").mockResolvedValue({
      studentId: "child-a",
      granted: false,
      blocked: false,
      requiredType: "data_processing",
      status: "pending",
    });
    holdBaseline("sess-1", FEATURES, "child-a");
    signInAs("child-a");

    await expect(flushPendingBaseline("child-a")).resolves.toBe(true);
    expect(submit).toHaveBeenCalled();
  });

  it("treats a failed consent read as consent, not as withdrawal", async () => {
    // A bad minute at the backend must not silently stop delivering a
    // measurement for a guardian who did consent.
    const submit = vi
      .spyOn(baselineApi, "submitWithRetry")
      .mockResolvedValue(true);
    vi.spyOn(consentsApi, "myConsentGate").mockRejectedValue(
      new Error("offline"),
    );
    holdBaseline("sess-1", FEATURES, "child-a");
    signInAs("child-a");

    await expect(flushPendingBaseline("child-a")).resolves.toBe(true);
    expect(submit).toHaveBeenCalled();
  });
  it("refuses an anonymous vector when no run is named", async () => {
    const submit = vi
      .spyOn(baselineApi, "submitWithRetry")
      .mockResolvedValue(true);
    holdBaseline("sess-1", FEATURES);
    signInAs("child-a");

    await expect(flushPendingBaseline("child-a")).resolves.toBe(false);

    expect(submit).not.toHaveBeenCalled();
    // Kept: the run that parked it can still claim it.
    expect(readPendingBaseline()?.sessionId).toBe("sess-1");
  });

  it("is NOT sent to whoever's token happens to be on the device", async () => {
    // The shared-tablet case: child A never signed out, child B sits the run.
    const submit = vi
      .spyOn(baselineApi, "submitWithRetry")
      .mockResolvedValue(true);
    holdBaseline("sess-b", FEATURES);
    signInAs("child-a");

    await expect(flushPendingBaseline("child-b")).resolves.toBe(false);

    expect(submit).not.toHaveBeenCalled();
    // And it is kept, not discarded - it still belongs to child B.
    expect(readPendingBaseline()?.sessionId).toBe("sess-b");
  });

  it("is not sent when there is no session at all", async () => {
    const submit = vi
      .spyOn(baselineApi, "submitWithRetry")
      .mockResolvedValue(true);
    holdBaseline("sess-1", FEATURES);

    await expect(flushPendingBaseline("child-a")).resolves.toBe(false);
    expect(submit).not.toHaveBeenCalled();
    expect(readPendingBaseline()).not.toBeNull();
  });

  it("is kept when the submit fails, rather than thrown away", async () => {
    // This was the original defect in miniature: a failed submit took the only
    // copy of the measurement with it.
    vi.spyOn(baselineApi, "submitWithRetry").mockResolvedValue(false);
    holdBaseline("sess-1", FEATURES);
    signInAs("child-a");

    await expect(flushPendingBaseline("child-a")).resolves.toBe(false);
    expect(readPendingBaseline()?.features).toEqual(FEATURES);
  });

  it("stops being worth sending after a week", () => {
    holdBaseline("sess-1", FEATURES);
    const raw = JSON.parse(
      window.localStorage.getItem("nevo.baseline.pending") ?? "{}",
    );
    window.localStorage.setItem(
      "nevo.baseline.pending",
      JSON.stringify({
        ...raw,
        capturedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
      }),
    );

    // A child who abandoned onboarding and came back weeks later is not the
    // same measurement.
    expect(readPendingBaseline()).toBeNull();
  });

  it("survives storage being unavailable without throwing", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceeded");
      });

    expect(() => holdBaseline("sess-1", FEATURES)).not.toThrow();
    setItem.mockRestore();
  });

  it("ignores a corrupted entry rather than crashing onboarding", () => {
    window.localStorage.setItem("nevo.baseline.pending", "{not json");
    expect(readPendingBaseline()).toBeNull();
  });

  it("clears cleanly", () => {
    holdBaseline("sess-1", FEATURES);
    clearPendingBaseline();
    expect(readPendingBaseline()).toBeNull();
  });
});
