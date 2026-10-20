import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { submitBatch } = vi.hoisted(() => ({ submitBatch: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, signalsApi: { submitBatch } };
});
vi.mock("@/lib/signals/ephemeralStore", () => ({
  setEphemeralStudent: vi.fn(),
  endEphemeralSession: vi.fn(() => Promise.resolve()),
}));

// Loading the provider is what wires the clean-up to the session store, as
// it is on every page of the app.
import { AuthProvider } from "./AuthContext";
import { useAuth } from "@/hooks";
import { api, authApi } from "@/lib/api";
import { rememberedChildren } from "@/lib/auth/deviceRoster";
import {
  claimOnboardingDraft,
  arriveAtEntry,
  arriveAtSequence,
  getOnboardingDraft,
  markRunFinished,
  startOnboardingDraft,
} from "@/lib/auth/onboarding";
import {
  clearSession,
  getSession,
  rememberProfile,
  setSession,
} from "@/lib/auth/session";
import { holdAnswer, holdProgress } from "@/lib/lessons/pendingProgress";
import { holdBaseline } from "@/lib/profiling/pendingBaseline";
import { holdSignals } from "@/lib/signals/outbox";
import { fakeIndexedDb } from "@/test/fakeIndexedDb";

/**
 * WHAT A CHILD LEAVES ON A SHARED TABLET GOES WHEN THEIR SESSION DOES (19 Oct
 * browser-storage audit): their unsent signal events after one last try, the
 * after-lesson picks in this tab, and the old single remembered profile -
 * through every way a session ends, and only ever the leaving child's.
 *
 * NOT THEIR WORK: held answers, held progress and a parked baseline stay
 * exactly as they were, for Olayinka's decision.
 */

const OUTBOX = "nevo.signals.outbox";
const LEGACY = "nevo.auth.profile";
const ENVELOPE = {
  sessionId: "fd0cba6c-0828-48e3-8510-c78146a5d449",
  lessonId: "9c1e77aa-1111-4222-8333-444455556666",
  sessionType: "lesson" as const,
  startedAt: "2026-10-19T09:00:00.000Z",
};
const feeling = {
  type: "feeling_checkin" as const,
  timestamp: "2026-10-19T09:00:01.000Z",
  payload: { feeling: "tired" },
};

const settle = () => new Promise<void>((r) => setTimeout(r, 0));

const signInAs = (userId: string, expiresAt = Date.now() + 3600_000) =>
  setSession({
    token: `tok-${userId}`,
    expiresAt: new Date(expiresAt).toISOString(),
    userId,
    role: "student",
  });

/** Ids are per test: a sign-out is remembered by the outbox for the page. */
let n = 0;
let a = "";
let b = "";

/** Child A signed in, with leftovers of their own and child B's beside them. */
async function aSharedTablet() {
  n += 1;
  a = `child-a${n}`;
  b = `child-b${n}`;
  holdSignals(a, ENVELOPE, [feeling]);
  holdSignals(b, ENVELOPE, [feeling, feeling]);
  window.sessionStorage.setItem(`nevo:review:${a}:lesson-1`, "[]");
  window.sessionStorage.setItem(`nevo:check-outcome:${a}:lesson-1`, "{}");
  window.sessionStorage.setItem(`nevo:review:${b}:lesson-1`, "[]");
  rememberProfile({
    schoolCode: "NEVO-1",
    loginIdentifier: "ada.o",
    displayName: "Ada",
    initials: "AO",
    userId: a,
  });
  // The old single-profile record, as a build from before 19 Oct left it:
  // nothing writes it now, and sign-out retires what is there.
  window.localStorage.setItem(
    LEGACY,
    JSON.stringify({
      schoolCode: "NEVO-1",
      loginIdentifier: "ada.o",
      displayName: "Ada",
      initials: "AO",
      userId: a,
    }),
  );
  signInAs(a);
  // Anything the setup itself ended has run its course.
  await settle();
  submitBatch.mockClear();
}

const heldFor = () =>
  (
    JSON.parse(window.localStorage.getItem(OUTBOX) ?? "[]") as {
      userId: string;
    }[]
  ).map((h) => h.userId);

/** Everything the leaving child left is gone, and the other child's is not. */
function expectALeftovers(gone: boolean) {
  expect(heldFor().includes(a)).toBe(!gone);
  expect(window.sessionStorage.getItem(`nevo:review:${a}:lesson-1`) === null).toBe(gone);
  expect(
    window.sessionStorage.getItem(`nevo:check-outcome:${a}:lesson-1`) === null,
  ).toBe(gone);
  expect(window.localStorage.getItem(LEGACY) === null).toBe(gone);
  // Never another child's, and never the device's memory of who uses it.
  expect(heldFor()).toContain(b);
  expect(window.sessionStorage.getItem(`nevo:review:${b}:lesson-1`)).toBe("[]");
  expect(rememberedChildren().map((c) => c.loginIdentifier)).toEqual(["ada.o"]);
}

beforeEach(() => {
  submitBatch.mockReset();
  submitBatch.mockResolvedValue({ acceptedEvents: 1 });
});

afterEach(async () => {
  clearSession();
  await settle();
  vi.unstubAllGlobals();
});

describe("a child's session ending, every way it ends", () => {
  it("Sign out: their unsent signals get one last try with their token, then go", async () => {
    await aSharedTablet();

    clearSession();
    await settle();

    expectALeftovers(true);
    expect(submitBatch).toHaveBeenCalledTimes(1);
    const [, events, options] = submitBatch.mock.calls[0]!;
    expect(events).toEqual([feeling]);
    expect(options).toMatchObject({ keepalive: true, token: `tok-${a}` });
  });

  it("deletes them even when the last try fails", async () => {
    await aSharedTablet();
    submitBatch.mockRejectedValue(new Error("offline"));

    clearSession();
    await settle();

    expectALeftovers(true);
  });

  it("useAuth's Sign out goes the same way", async () => {
    await aSharedTablet();
    vi.spyOn(authApi, "session").mockResolvedValue({
      userId: a,
      role: "student",
    } as never);
    vi.spyOn(authApi, "logout").mockResolvedValue();
    function SignOut() {
      const { signOut } = useAuth();
      return (
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      );
    }
    render(
      <AuthProvider>
        <SignOut />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await settle();

    expect(getSession()).toBeNull();
    expectALeftovers(true);
  });

  it("a lapse, found as the session is read", async () => {
    await aSharedTablet();
    signInAs(a, Date.now() - 1_000);
    await settle();

    expect(getSession()).toBeNull();
    await settle();

    expectALeftovers(true);
  });

  it("a session the server refused (401), as a lesson's read finds it", async () => {
    await aSharedTablet();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );

    await api.get("/api/v1/students/me/dashboard").catch(() => {});
    await settle();

    expect(getSession()).toBeNull();
    expectALeftovers(true);
  });

  it("the next child signing in over a session nobody ended", async () => {
    await aSharedTablet();

    signInAs(b);
    await settle();

    expectALeftovers(true);
  });

  it("but not a token refresh, which is the same child", async () => {
    await aSharedTablet();

    setSession({
      token: "tok-refreshed",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      userId: a,
      role: "student",
    });
    await settle();

    expectALeftovers(false);
    expect(submitBatch).not.toHaveBeenCalled();
  });
});

describe("what a sign-out leaves alone: the child's work", () => {
  it("keeps held answers, held progress and a parked baseline exactly as they were", async () => {
    await aSharedTablet();
    holdAnswer("lesson-1", {
      sessionId: "sess-1",
      body: {
        problemId: "cp-1",
        source: "assessment",
        answer: 1,
        clientAttemptId: "00000001-0000-4000-8000-000000000000",
      },
    } as never);
    holdProgress("lesson-1", {
      sessionId: "sess-1",
      status: "exited" as never,
      segment: 3,
    });
    holdBaseline("run-1", [{ dimension: "ps" } as never], a);
    const work = [
      `nevo.lesson.pendingAnswers.${a}`,
      `nevo.lesson.pendingProgress.${a}`,
      // Parked on the child's own shelf (19 Oct).
      `nevo.baseline.pending.${a}`,
    ];
    const before = work.map((k) => window.localStorage.getItem(k));
    expect(before.every(Boolean)).toBe(true);

    clearSession();
    await settle();

    expect(work.map((k) => window.localStorage.getItem(k))).toEqual(before);
  });
});

/*
 * THE BASELINE'S RAW TAPS, left in IndexedDB by a run nobody finished - the
 * coordinates of every touch (19 Oct browser-storage audit). They go at a
 * sign-out, and a week after they were written whoever opens the app next.
 */
describe("raw taps an abandoned baseline run left behind", () => {
  const DB = "nevo-baseline";
  const DAY = 24 * 60 * 60 * 1000;
  const run = (daysAgo: number) => ({
    capturedAt: Date.now() - daysAgo * DAY,
    events: [{ kind: "tap", t: 1, payload: { x: 120, y: 340 } }],
  });

  it("go when a session ends", async () => {
    const idb = fakeIndexedDb();
    vi.stubGlobal("indexedDB", idb.factory);
    idb.seed(DB, [["abandoned", run(1)]]);
    await aSharedTablet();

    clearSession();

    await vi.waitFor(() => expect(idb.records(DB)?.size).toBe(0));
  });

  it("go a week on, when the app is next opened", async () => {
    const idb = fakeIndexedDb();
    vi.stubGlobal("indexedDB", idb.factory);
    idb.seed(DB, [
      ["abandoned", run(8)],
      ["this-week", run(2)],
    ]);

    render(
      <AuthProvider>
        <p>app</p>
      </AuthProvider>,
    );
    await vi.waitFor(() =>
      expect([...(idb.records(DB)?.keys() ?? [])]).toEqual(["this-week"]),
    );
  });
});

/*
 * THE ONBOARDING DRAFT A CHILD WALKED AWAY FROM (19 Oct browser-storage
 * audit): their school code, Student ID and first name, kept in the tab
 * through every later child's sign-in and sign-out. It goes when a session
 * ends - unless a child is onboarding on the page right now
 * (`ObservedInteractionSequence.draft`, `StudentEntryStep`).
 */
describe("an onboarding draft nobody is using", () => {
  const walkedAway = {
    schoolCode: "K7DQ",
    admissionNumber: "BGA/2031",
    name: "Amara",
    consent: "given" as const,
  };

  it("goes when a later child signs out in the same tab", async () => {
    startOnboardingDraft(walkedAway);
    await aSharedTablet();

    clearSession();
    await settle();

    expect(getOnboardingDraft()).toEqual({});
  });

  it("goes when another child's sign-in replaces the session", async () => {
    startOnboardingDraft(walkedAway);
    await aSharedTablet();

    signInAs(b);
    await settle();

    expect(getOnboardingDraft()).toEqual({});
  });

  it("stays while a child is onboarding on this page, consent answer and all", async () => {
    startOnboardingDraft(walkedAway);
    const release = claimOnboardingDraft();
    await aSharedTablet();

    clearSession();
    await settle();
    release();

    expect(getOnboardingDraft()).toEqual(walkedAway);
  });
});

/*
 * THE BARE CHOSEN-NAME KEY builds from 25 Aug wrote (19 Oct browser-storage
 * audit): one child's name, whoever last renamed themselves here, read by
 * nothing since names became per account. Retired at sign-out, as the old
 * single profile is; every account's own name stays.
 */
describe("the bare chosen-name key an older build left", () => {
  it("goes at sign-out, and every account's own name stays", async () => {
    window.localStorage.setItem("nevo.auth.displayName", "Ada");
    window.localStorage.setItem("nevo.auth.displayName.child-x", "Bayo");
    await aSharedTablet();

    clearSession();
    await settle();

    expect(window.localStorage.getItem("nevo.auth.displayName")).toBeNull();
    expect(window.localStorage.getItem("nevo.auth.displayName.child-x")).toBe(
      "Bayo",
    );
  });
});

/*
 * A SESSION ENDED FOR A NEW CHILD LEAVES THAT CHILD'S DRAFT (19 Oct, a
 * regression in aa7b2db). The sequence and 05 end a stored session as they
 * first render, and claim the draft only after; the ending's clean-up ran in
 * between and took the draft - so a child sent straight to the sequence was
 * bounced to an empty 05. Asserted here with the clean-up running BEFORE any
 * screen has claimed the draft, which is the order a browser runs them in.
 */
describe("a session ended for a new child who is starting", () => {
  const tobi = {
    schoolCode: "K7DQ",
    admissionNumber: "BGA/2031",
    name: "Tobi",
    consent: "given" as const,
  };

  it("leaves the draft the sequence is about to use, and the rest still goes", async () => {
    await aSharedTablet();
    startOnboardingDraft(tobi);

    arriveAtSequence();
    await settle();

    expect(getSession()).toBeNull();
    expect(getOnboardingDraft()).toEqual(tobi);
    expect(heldFor()).not.toContain(a);
  });

  it("on 05, takes it: 05 writes its own on the next match (19 Oct)", async () => {
    await aSharedTablet();
    startOnboardingDraft(tobi);

    arriveAtEntry();
    await settle();

    expect(getSession()).toBeNull();
    expect(getOnboardingDraft()).toEqual({});
  });

  it("spares it once: a later ordinary sign-out takes a draft nobody is using", async () => {
    await aSharedTablet();
    startOnboardingDraft(tobi);
    arriveAtSequence();
    await settle();

    signInAs(a);
    await settle();
    clearSession();
    await settle();

    expect(getOnboardingDraft()).toEqual({});
  });
});

/*
 * A CHILD THE DEVICE DOES NOT REMEMBER KEEPS NOTHING OF THEIR OWN ON IT (19
 * Oct). The chosen name and the accessibility settings are kept per account
 * for the next sign-in - which only a remembered child has. An SSO child is
 * never on the picker, so theirs stayed for nobody.
 */
describe("per-child settings at sign-out", () => {
  const sso = (userId: string) =>
    setSession({
      token: `tok-${userId}`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      userId,
      role: "student",
      method: "sso",
    });

  it("go for a child the device does not remember", async () => {
    sso("sso-child");
    await settle();
    window.localStorage.setItem("nevo.auth.displayName.sso-child", "Sade");
    window.localStorage.setItem("nevo:a11y:sso-child", '{"textSize":"l"}');

    clearSession();
    await settle();

    expect(window.localStorage.getItem("nevo.auth.displayName.sso-child")).toBeNull();
    expect(window.localStorage.getItem("nevo:a11y:sso-child")).toBeNull();
  });

  it("stay for a child the device remembers, for their next sign-in", async () => {
    await aSharedTablet();
    window.localStorage.setItem(`nevo.auth.displayName.${a}`, "Ada");
    window.localStorage.setItem(`nevo:a11y:${a}`, '{"textSize":"l"}');

    clearSession();
    await settle();

    expect(window.localStorage.getItem(`nevo.auth.displayName.${a}`)).toBe("Ada");
    expect(window.localStorage.getItem(`nevo:a11y:${a}`)).not.toBeNull();
  });

  it("stay for a teacher, whose settings are theirs to keep", async () => {
    setSession({
      token: "tok-t",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      userId: "teacher-1",
      role: "teacher",
    });
    await settle();
    window.localStorage.setItem("nevo:a11y:teacher-1", '{"textSize":"l"}');

    clearSession();
    await settle();

    expect(window.localStorage.getItem("nevo:a11y:teacher-1")).not.toBeNull();
  });
});

/*
 * THIS TAB'S MARK THAT ITS RUN FINISHED AS A CHILD (19 Oct) is what lets
 * Back from the first lesson route them on. It goes when their session does,
 * so it can never route anyone into a session that has ended.
 */
describe("this tab's finished-run mark", () => {
  const MARK = "nevo.onboarding.finishedRun";

  it("goes when that child's session ends", async () => {
    await aSharedTablet();
    markRunFinished(a);

    clearSession();
    await settle();

    expect(window.sessionStorage.getItem(MARK)).toBeNull();
  });

  it("stays when a different child's session ends", async () => {
    await aSharedTablet();
    markRunFinished("someone-else");

    clearSession();
    await settle();

    expect(window.sessionStorage.getItem(MARK)).toBe("someone-else");
  });
});
