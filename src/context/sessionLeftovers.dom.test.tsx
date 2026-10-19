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
      "nevo.baseline.pending",
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
