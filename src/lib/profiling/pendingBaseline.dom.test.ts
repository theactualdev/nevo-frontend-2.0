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
 * The baseline's write is Bearer. The profiling run is phase 0 of the
 * onboarding sequence; the account is not created until phase 2. So the submit
 * went out with no token, took the 401 as final (a 4xx is not retried), and a
 * `.finally()` purged the capture anyway - destroying the
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

/** What is parked since B9: the run's trials, raw, not a reduced vector. */
const TRIALS = [
  {
    dimension: "wmc",
    condition: "length_3",
    response: "5",
    correct: true,
    responseTimeMs: 420,
    probeItemId: null,
  },
];

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
    holdBaseline("sess-1", TRIALS);

    expect(readPendingBaseline()?.trials).toEqual(TRIALS);
  });

  it("goes out once the account it belongs to exists", async () => {
    const submit = vi
      .spyOn(baselineApi, "submitTrials")
      .mockResolvedValue(true);
    holdBaseline("sess-1", TRIALS);
    signInAs("child-a");

    // `sess-1` is the run that parked it, which is what makes it this child's.
    await expect(flushPendingBaseline("child-a", "sess-1")).resolves.toBe(true);

    expect(submit).toHaveBeenCalledWith("sess-1", TRIALS, {});
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
      .spyOn(baselineApi, "submitTrials")
      .mockResolvedValue(true);
    // Child A's onboarding parked this and never completed.
    holdBaseline("sess-a", TRIALS);
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
      .spyOn(baselineApi, "submitTrials")
      .mockResolvedValue(true);
    // Child A is signed in and their warm-up submit fails, so it parks WITH
    // their id on it.
    holdBaseline("sess-a", TRIALS, "child-a");
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
      .spyOn(baselineApi, "submitTrials")
      .mockResolvedValue(true);
    holdBaseline("sess-a", TRIALS, "child-a");
    signInAs("child-a");

    await expect(flushPendingBaseline("child-a")).resolves.toBe(true);

    expect(submit).toHaveBeenCalledWith("sess-a", TRIALS, {});
  });

  it("does not send a parked vector once consent has been withdrawn", async () => {
    // The case the capture-side gates cannot reach: parked while consent
    // stood, flushed after it was withdrawn.
    const submit = vi
      .spyOn(baselineApi, "submitTrials")
      .mockResolvedValue(true);
    vi.spyOn(consentsApi, "myConsentGate").mockResolvedValue({
      studentId: "child-a",
      granted: false,
      blocked: false,
      requiredType: "data_processing",
      status: "withdrawn",
    });
    holdBaseline("sess-1", TRIALS, "child-a");
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
      .spyOn(baselineApi, "submitTrials")
      .mockResolvedValue(true);
    vi.spyOn(consentsApi, "myConsentGate").mockResolvedValue({
      studentId: "child-a",
      granted: false,
      blocked: false,
      requiredType: "data_processing",
      status: "pending",
    });
    holdBaseline("sess-1", TRIALS, "child-a");
    signInAs("child-a");

    await expect(flushPendingBaseline("child-a")).resolves.toBe(true);
    expect(submit).toHaveBeenCalled();
  });

  it("treats a failed consent read as consent, not as withdrawal", async () => {
    // A bad minute at the backend must not silently stop delivering a
    // measurement for a guardian who did consent.
    const submit = vi
      .spyOn(baselineApi, "submitTrials")
      .mockResolvedValue(true);
    vi.spyOn(consentsApi, "myConsentGate").mockRejectedValue(
      new Error("offline"),
    );
    holdBaseline("sess-1", TRIALS, "child-a");
    signInAs("child-a");

    await expect(flushPendingBaseline("child-a")).resolves.toBe(true);
    expect(submit).toHaveBeenCalled();
  });
  it("refuses an anonymous vector when no run is named", async () => {
    const submit = vi
      .spyOn(baselineApi, "submitTrials")
      .mockResolvedValue(true);
    holdBaseline("sess-1", TRIALS);
    signInAs("child-a");

    await expect(flushPendingBaseline("child-a")).resolves.toBe(false);

    expect(submit).not.toHaveBeenCalled();
    // Kept: the run that parked it can still claim it.
    expect(readPendingBaseline()?.sessionId).toBe("sess-1");
  });

  it("is NOT sent to whoever's token happens to be on the device", async () => {
    // The shared-tablet case: child A never signed out, child B sits the run.
    const submit = vi
      .spyOn(baselineApi, "submitTrials")
      .mockResolvedValue(true);
    holdBaseline("sess-b", TRIALS);
    signInAs("child-a");

    await expect(flushPendingBaseline("child-b")).resolves.toBe(false);

    expect(submit).not.toHaveBeenCalled();
    // And it is kept, not discarded - it still belongs to child B.
    expect(readPendingBaseline()?.sessionId).toBe("sess-b");
  });

  it("is not sent when there is no session at all", async () => {
    const submit = vi
      .spyOn(baselineApi, "submitTrials")
      .mockResolvedValue(true);
    holdBaseline("sess-1", TRIALS);

    await expect(flushPendingBaseline("child-a")).resolves.toBe(false);
    expect(submit).not.toHaveBeenCalled();
    expect(readPendingBaseline()).not.toBeNull();
  });

  it("is kept when the submit fails, rather than thrown away", async () => {
    // This was the original defect in miniature: a failed submit took the only
    // copy of the measurement with it.
    vi.spyOn(baselineApi, "submitTrials").mockResolvedValue(false);
    holdBaseline("sess-1", TRIALS);
    signInAs("child-a");

    await expect(flushPendingBaseline("child-a")).resolves.toBe(false);
    expect(readPendingBaseline()?.trials).toEqual(TRIALS);
  });

  it("stops being worth sending after a week", () => {
    holdBaseline("sess-1", TRIALS);
    // An ownerless run is parked under its own run id (19 Oct).
    const key = "nevo.baseline.pending.run.sess-1";
    const raw = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    window.localStorage.setItem(
      key,
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

    expect(() => holdBaseline("sess-1", TRIALS)).not.toThrow();
    setItem.mockRestore();
  });

  it("ignores a corrupted entry rather than crashing onboarding", () => {
    window.localStorage.setItem("nevo.baseline.pending", "{not json");
    expect(readPendingBaseline()).toBeNull();
  });

  it("parks the trials, and sends them to the trials endpoint as they are", async () => {
    // B9: the device sends the run as it happened. Nothing is reduced on the
    // way in or on the way out.
    const submit = vi.spyOn(baselineApi, "submitTrials").mockResolvedValue(true);
    holdBaseline("sess-1", TRIALS, "child-a");
    signInAs("child-a");

    await flushPendingBaseline("child-a");

    expect(submit).toHaveBeenCalledWith("sess-1", TRIALS, {});
  });

  it("parks the run's context with its trials, and sends them together (B76)", async () => {
    // The band, the device and the motor step's skip are the run's, not the
    // trials', and they leave in the same request as the trials they explain.
    const submit = vi.spyOn(baselineApi, "submitTrials").mockResolvedValue(true);
    const context = {
      ageBand: "upper_primary",
      formFactor: "tablet_touch",
      motorStepSkipped: false,
    } as const;
    holdBaseline("sess-1", TRIALS, null, context);
    signInAs("child-a");

    await flushPendingBaseline("child-a", "sess-1");

    expect(submit).toHaveBeenCalledWith("sess-1", TRIALS, context);
  });

  it("sends a run parked before B76 without a context, rather than guessing one", async () => {
    // Parked on 7 Oct, before the request had anywhere to put it. Nothing on
    // the device knows its band or device now, so nothing is told.
    const submit = vi.spyOn(baselineApi, "submitTrials").mockResolvedValue(true);
    window.localStorage.setItem(
      "nevo.baseline.pending",
      JSON.stringify({
        sessionId: "sess-1",
        trials: TRIALS,
        capturedAt: Date.now(),
        ownerUserId: "child-a",
      }),
    );
    signInAs("child-a");

    await expect(flushPendingBaseline("child-a")).resolves.toBe(true);

    expect(submit).toHaveBeenCalledWith("sess-1", TRIALS, {});
  });

  it("drops a vector parked before B9 rather than sending it anywhere", async () => {
    // It holds what the device reduced - a measure of a child decided on the
    // tablet. `/trials` cannot take it, and nothing should.
    const submit = vi.spyOn(baselineApi, "submitTrials").mockResolvedValue(true);
    window.localStorage.setItem(
      "nevo.baseline.pending",
      JSON.stringify({
        sessionId: "sess-old",
        features: [{ module: "grid_span", maxSpan: 4, meanRecallGapMs: 300 }],
        capturedAt: Date.now(),
        ownerUserId: "child-a",
      }),
    );
    signInAs("child-a");

    await expect(flushPendingBaseline("child-a")).resolves.toBe(false);

    expect(submit).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("nevo.baseline.pending")).toBeNull();
  });

  it("parks nothing for a run with no answers, which the contract refuses", () => {
    holdBaseline("sess-1", []);

    expect(readPendingBaseline()).toBeNull();
  });

  it("clears cleanly", () => {
    holdBaseline("sess-1", TRIALS);
    clearPendingBaseline();
    expect(readPendingBaseline()).toBeNull();
  });
});

/*
 * NEVER TOKENLESS (19 Oct browser-storage audit). The flush checks whose
 * session it is, then waits on the consent read - and a 401 elsewhere in that
 * time cleared the session, so the parked run went up with no Authorization
 * at all. It asks again at the send; the run stays parked for its owner.
 */
describe("a parked baseline whose child's session ends while it is flushed", () => {
  it("is not sent once the session has gone, and stays parked for them", async () => {
    signInAs("child-a");
    holdBaseline("baseline-run-A", TRIALS, "child-a");
    vi.spyOn(consentsApi, "myConsentGate").mockImplementation(async () => {
      // A 401 elsewhere ends the session while this read is out.
      clearSession();
      return { status: "granted" } as never;
    });
    const submit = vi.spyOn(baselineApi, "submitTrials");

    await expect(flushPendingBaseline("child-a")).resolves.toBe(false);

    expect(submit).not.toHaveBeenCalled();
    expect(readPendingBaseline()).toMatchObject({
      sessionId: "baseline-run-A",
      ownerUserId: "child-a",
    });
  });

  it("is not sent as the next child who signed in meanwhile", async () => {
    signInAs("child-a");
    holdBaseline("baseline-run-A", TRIALS, "child-a");
    vi.spyOn(consentsApi, "myConsentGate").mockImplementation(async () => {
      signInAs("child-b");
      return { status: "granted" } as never;
    });
    const submit = vi.spyOn(baselineApi, "submitTrials");

    await flushPendingBaseline("child-a");

    expect(submit).not.toHaveBeenCalled();
    expect(readPendingBaseline()?.ownerUserId).toBe("child-a");
  });
});

/*
 * ONE SLOT PER OWNER, AND AN OWNERLESS RUN UNDER ITS OWN RUN ID (19 Oct
 * browser-storage audit). There was one slot for the device: Tobi's
 * finished pre-account run overwrote Amara's parked warm-up, and her trials
 * were gone. Who may send each is unchanged - its owner, or the run that
 * parked it - and so is the week.
 */
describe("parked runs on a shared tablet", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("never overwrite another child's: a new child's pre-account run leaves Amara's", () => {
    holdBaseline("warmup-amara", TRIALS, "amara");
    holdBaseline("run-tobi", TRIALS, null);

    expect(readPendingBaseline({ owner: "amara" })?.sessionId).toBe(
      "warmup-amara",
    );
    expect(readPendingBaseline({ run: "run-tobi" })?.ownerUserId).toBeNull();
  });

  it("go only to whom each belongs", async () => {
    const submit = vi.spyOn(baselineApi, "submitTrials").mockResolvedValue(true);
    holdBaseline("warmup-amara", TRIALS, "amara");
    holdBaseline("run-tobi", TRIALS, null);
    signInAs("amara");

    await expect(flushPendingBaseline("amara")).resolves.toBe(true);

    expect(submit.mock.calls.map(([run]) => run)).toEqual(["warmup-amara"]);
    expect(readPendingBaseline({ run: "run-tobi" })).not.toBeNull();
  });

  it("become their owner's once the run that parked them proves it, so a failed send is not stranded", async () => {
    const submit = vi
      .spyOn(baselineApi, "submitTrials")
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    holdBaseline("run-tobi", TRIALS, null);
    signInAs("tobi");

    // The PIN step: the run proves it with its id, and the send fails.
    await expect(flushPendingBaseline("tobi", "run-tobi")).resolves.toBe(false);
    expect(readPendingBaseline({ owner: "tobi" })?.sessionId).toBe("run-tobi");

    // Any later student screen, with no run id to prove anything with.
    await expect(flushPendingBaseline("tobi")).resolves.toBe(true);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(readPendingBaseline()).toBeNull();
  });

  it("each go after a week, on the same clock", () => {
    holdBaseline("warmup-amara", TRIALS, "amara");
    holdBaseline("run-tobi", TRIALS, null);
    const key = "nevo.baseline.pending.amara";
    const raw = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    window.localStorage.setItem(
      key,
      JSON.stringify({ ...raw, capturedAt: Date.now() - 8 * DAY }),
    );

    expect(readPendingBaseline({ owner: "amara" })).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
    expect(readPendingBaseline({ run: "run-tobi" })).not.toBeNull();
  });

  it("move a run from the old single slot onto its owner's shelf", () => {
    window.localStorage.setItem(
      "nevo.baseline.pending",
      JSON.stringify({
        sessionId: "warmup-amara",
        trials: TRIALS,
        capturedAt: Date.now(),
        ownerUserId: "amara",
        context: {},
      }),
    );

    expect(readPendingBaseline({ owner: "amara" })?.sessionId).toBe(
      "warmup-amara",
    );
    expect(window.localStorage.getItem("nevo.baseline.pending")).toBeNull();
    expect(window.localStorage.getItem("nevo.baseline.pending.amara")).not.toBeNull();
  });

  it("are deleted for a withdrawn child only, never another's", async () => {
    vi.spyOn(consentsApi, "myConsentGate").mockResolvedValue({
      status: "withdrawn",
    } as never);
    holdBaseline("warmup-amara", TRIALS, "amara");
    holdBaseline("warmup-kofi", TRIALS, "kofi");
    signInAs("amara");

    await flushPendingBaseline("amara");

    expect(readPendingBaseline({ owner: "amara" })).toBeNull();
    expect(readPendingBaseline({ owner: "kofi" })).not.toBeNull();
  });
});

/*
 * ONE FLUSH AT A TIME FOR EACH CHILD (19 Oct browser-storage audit). After a
 * sign-in at the door two flushes started together and both sent the parked
 * run: two consent reads, the same trials twice, one run id.
 */
describe("two flushes for the same child at once", () => {
  it("send the parked run once, and ask about consent once", async () => {
    const submit = vi.spyOn(baselineApi, "submitTrials").mockResolvedValue(true);
    const gate = vi
      .spyOn(consentsApi, "myConsentGate")
      .mockResolvedValue({ status: "granted" } as never);
    holdBaseline("warmup-amara", TRIALS, "amara");
    signInAs("amara");

    const results = await Promise.all([
      flushPendingBaseline("amara"),
      flushPendingBaseline("amara"),
    ]);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(gate).toHaveBeenCalledTimes(1);
    expect(results).toEqual([true, false]);
  });

  it("do not hold up another child's", async () => {
    let land: (ok: boolean) => void = () => {};
    vi.spyOn(baselineApi, "submitTrials").mockImplementation(
      (run) =>
        run === "warmup-amara"
          ? new Promise<boolean>((r) => {
              land = r;
            })
          : Promise.resolve(true),
    );
    vi.spyOn(consentsApi, "myConsentGate").mockResolvedValue({
      status: "granted",
    } as never);
    holdBaseline("warmup-amara", TRIALS, "amara");
    holdBaseline("warmup-kofi", TRIALS, "kofi");

    signInAs("amara");
    const amaras = flushPendingBaseline("amara");
    await Promise.resolve();
    signInAs("kofi");

    await expect(flushPendingBaseline("kofi")).resolves.toBe(true);
    land(true);
    await amaras;
  });
});

/*
 * ed123cb (Teslim, 29 Oct) refuses a whole run whose Word Conflict is not all
 * forty trials - eight practice, thirty-two scored, each with its target. A
 * senior-band run parked before it holds the thirty-two with neither, and the
 * practice was never kept, so retried as it was it would be refused on every
 * flush for the week it is kept, and the rest of the child's baseline with it.
 */
describe("a senior-band run parked before ed123cb", () => {
  const conflict = Array.from({ length: 32 }, (_, i) => ({
    dimension: "inhibition",
    condition: i % 2 ? "congruent" : "incongruent",
    response: i % 4 < 2 ? "left" : "right",
    correct: true,
    responseTimeMs: 600,
    probeItemId: null,
  }));

  it("resends, without the Word Conflict the server can no longer take", async () => {
    const submit = vi.spyOn(baselineApi, "submitTrials").mockResolvedValue(true);
    holdBaseline("sess-ss", [...TRIALS, ...conflict], null, { ageBand: "senior_secondary" });
    signInAs("child-ss");

    await expect(flushPendingBaseline("child-ss", "sess-ss")).resolves.toBe(true);

    expect(submit).toHaveBeenCalledWith("sess-ss", TRIALS, { ageBand: "senior_secondary" });
    expect(readPendingBaseline()).toBeNull();
  });

  it("sends a run built since whole, all forty with it", async () => {
    const submit = vi.spyOn(baselineApi, "submitTrials").mockResolvedValue(true);
    const forty = [
      ...conflict.slice(0, 8).map((t) => ({ ...t, practice: true, target: t.response === "left" ? "LEFT" : "RIGHT" })),
      ...conflict.map((t) => ({ ...t, target: t.response === "left" ? "LEFT" : "RIGHT" })),
    ] as typeof conflict;
    holdBaseline("sess-ss2", [...TRIALS, ...forty], null, { ageBand: "senior_secondary" });
    signInAs("child-ss2");

    await expect(flushPendingBaseline("child-ss2", "sess-ss2")).resolves.toBe(true);

    expect(submit).toHaveBeenCalledWith("sess-ss2", [...TRIALS, ...forty], { ageBand: "senior_secondary" });
  });
});
