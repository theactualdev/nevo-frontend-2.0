import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./client";
import { clearSession, setSession } from "@/lib/auth/session";
import { fakeIndexedDb } from "@/test/fakeIndexedDb";

/**
 * A WITHDRAWAL LEARNED FROM A REFUSAL TAKES THE RAW TAPS WITH IT (19 Oct
 * browser-storage audit).
 *
 * A signed-in child mid-baseline; the next signal batch is refused 403
 * `consent_withdrawn` (B44), and the refusal sends them to 00e by a full
 * page load. The run never got to stop its capture - the page left under it
 * - so the stream it last wrote, taps and where they landed, stayed in
 * IndexedDB until a sign-out or the week's sweep. The refusal starts the
 * purge as it leaves; 00e finishes it on arrival (`ConsentWithdrawn`).
 */

const DB = "nevo-baseline";
let idb: ReturnType<typeof fakeIndexedDb>;

const refuse = (status: number, code: string) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: { code } }), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
    ),
  );

beforeEach(() => {
  idb = fakeIndexedDb();
  vi.stubGlobal("indexedDB", idb.factory);
  idb.seed(DB, [
    [
      "baseline-run-1",
      {
        capturedAt: Date.now(),
        events: [{ kind: "tap", t: 1, payload: { cell: 3, x: 120, y: 340 } }],
      },
    ],
  ]);
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "child-1",
    role: "student",
  });
});

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe("a refusal that says consent is withdrawn", () => {
  it("purges the baseline's stored raw taps as it sends the child to 00e", async () => {
    refuse(403, "consent_withdrawn");

    await api.post("/api/signals", { events: [] }).catch(() => {});

    await vi.waitFor(() => expect(idb.records(DB)?.size).toBe(0));
  });
});

describe("a refusal about anything else", () => {
  it("leaves them for the run that wrote them", async () => {
    refuse(403, "forbidden");

    await api.post("/api/signals", { events: [] }).catch(() => {});
    await new Promise((r) => setTimeout(r, 50));

    expect(idb.records(DB)?.size).toBe(1);
  });
});
