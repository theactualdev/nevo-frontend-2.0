import { describe, expect, it } from "vitest";
import type { RosterSyncHistory, RosterSyncRun, SsoStatus } from "@/lib/api/sso";
import { attentionCount, itHomeRows } from "./itHomeRows";

/**
 * What the IT home is allowed to tell an administrator about their sign-in.
 *
 * Three of these pin mistakes that were made in the first draft of this screen
 * and caught in review, which is why they are worth keeping: a status enum read
 * as three values when it has four, a neutral report counted as an attention
 * item, and a failed history read passing for a clean one.
 */

const status = (over: Partial<SsoStatus> = {}): SsoStatus => ({
  provider: "microsoft",
  status: "connected",
  schoolUrlSlug: "brightgate",
  schoolEntryUrl: "https://nevo.example/brightgate",
  lastConnectionError: null,
  connectionCheckedAt: "2026-09-14T08:00:00Z",
  reauthorisedAt: null,
  lastSuccessfulSyncAt: "2026-09-14T06:00:00Z",
  nextScheduledSyncAt: null,
  credentialExpiresAt: null,
  credentialExpiresInDays: null,
  credentialExpiringSoon: false,
  disconnectedAt: null,
  dataFlow: [],
  ...over,
});

const run = (over: Partial<RosterSyncRun> = {}): RosterSyncRun => ({
  id: "r1",
  provider: "microsoft",
  status: "completed",
  importedStudents: 8,
  importedTeachers: 2,
  missingTeacherClassMappings: 0,
  failureReason: null,
  triggeredManually: false,
  startedAt: "2026-09-14T06:00:00Z",
  completedAt: "2026-09-14T06:04:00Z",
  issues: [],
  ...over,
});

const history = (runs: RosterSyncRun[], failedRuns = 0): RosterSyncHistory => ({
  windowDays: 30,
  successfulRuns: runs.length,
  failedRuns,
  runs,
});

const keys = (rows: ReturnType<typeof itHomeRows>) => rows.map((r) => r.key);

describe("itHomeRows", () => {
  it("says nothing at all when no provider is connected", () => {
    expect(itHomeRows(null, null, false)).toEqual([]);
  });

  it("raises a run the provider left for manual review", () => {
    // THE FOURTH ENUM VALUE. An earlier draft handled running/completed/failed
    // only, so a run explicitly named "manual review" produced no row and the
    // hero then said nothing needed attention.
    const rows = itHomeRows(
      status(),
      history([run({ status: "partial_manual_review" })]),
      false,
    );
    expect(keys(rows)).toContain("manual-review");
    expect(attentionCount(rows)).toBe(1);
  });

  it("counts an attention row but never the neutral report", () => {
    // A healthy school gets the "N imported" row and must NOT be told it has
    // something worth a glance.
    const healthy = itHomeRows(status(), history([run()]), false);
    expect(keys(healthy)).toEqual(["imported"]);
    expect(attentionCount(healthy)).toBe(0);

    const busy = itHomeRows(
      status(),
      history([run({ missingTeacherClassMappings: 3 })]),
      false,
    );
    expect(attentionCount(busy)).toBe(1);
  });

  it("says TEACHERS, not accounts, for an unmatched mapping", () => {
    // The only field behind the frame's "3 accounts couldn't be matched" is
    // `missingTeacherClassMappings`. Calling them accounts would widen a
    // teacher-to-class gap into a claim about students' sign-ins.
    const rows = itHomeRows(
      status(),
      history([run({ missingTeacherClassMappings: 3 })]),
      false,
    );
    const row = rows.find((r) => r.key === "unmatched")!;
    expect(row.title).toBe(
      "3 teachers couldn't be matched to a class automatically",
    );
    expect(row.title).not.toMatch(/account/i);
  });

  it("reads naturally at one", () => {
    const rows = itHomeRows(
      status(),
      history([run({ missingTeacherClassMappings: 1 })]),
      false,
    );
    expect(rows.find((r) => r.key === "unmatched")!.title).toBe(
      "1 teacher couldn't be matched to a class automatically",
    );
  });

  it("does not report a failed run when the history could not be read", () => {
    // `failedRuns ?? 0` once coalesced an unread history into a healthy
    // verdict. The inverse is just as wrong: claiming a failure we did not see.
    const rows = itHomeRows(status(), null, true);
    expect(keys(rows)).not.toContain("failed-run");
  });

  it("raises a reauthorisation without claiming anyone is locked out", () => {
    const rows = itHomeRows(status({ status: "needs_attention" }), null, false);
    const row = rows.find((r) => r.key === "reauthorise")!;
    expect(row.sub).toMatch(/can still sign in/);
    expect(row.sub).not.toMatch(/blocked|locked out|cannot sign in/i);
  });

  it("omits the imported row when the sync brought nothing in", () => {
    const rows = itHomeRows(
      status(),
      history([run({ importedStudents: 0, importedTeachers: 0 })]),
      false,
    );
    expect(keys(rows)).not.toContain("imported");
  });

  it("reads the server's own judgement of \"soon\", and never recomputes it", () => {
    // THE WHOLE POINT OF THIS TEST. A 25-day expiry with the server saying
    // NOT soon must produce nothing. Any client-side "days < 30" would fire
    // here, which is rule 3 - the frontend does not decide what soon means
    // for a school's signing credential.
    const rows = itHomeRows(
      status({ credentialExpiresInDays: 25, credentialExpiringSoon: false }),
      null,
      false,
    );
    expect(keys(rows)).not.toContain("credential");
  });

  it("raises the credential when the server says soon, even with no day count", () => {
    // `credentialExpiresInDays` is nullable and `credentialExpiringSoon` is not,
    // so this is a real state. The row must still appear, and must not print
    // the null.
    const rows = itHomeRows(
      status({ credentialExpiresInDays: null, credentialExpiringSoon: true }),
      null,
      false,
    );
    const row = rows.find((r) => r.key === "credential")!;
    expect(row).toBeDefined();
    expect(row.title).not.toMatch(/null|undefined|NaN/);
    expect(row.title).toMatch(/expires soon/i);
  });

  it("counts a day rather than days when there is one left", () => {
    const rows = itHomeRows(
      status({ credentialExpiresInDays: 1, credentialExpiringSoon: true }),
      null,
      false,
    );
    expect(rows.find((r) => r.key === "credential")!.title).toMatch(
      /in 1 day$/,
    );
  });

  it("says a lapsed credential has expired, not that it expires in 0 days", () => {
    const rows = itHomeRows(
      status({ credentialExpiresInDays: 0, credentialExpiringSoon: true }),
      null,
      false,
    );
    const row = rows.find((r) => r.key === "credential")!;
    expect(row.title).toMatch(/has expired/i);
    expect(row.title).not.toMatch(/0 day/);
    // "Nothing has changed yet" is false once it has lapsed.
    expect(row.sub).not.toMatch(/nothing has changed/i);
  });

  it("does not tell a school its access needs renewing twice", () => {
    // `needs_attention` already owns the renewal message. Saying both makes
    // the urgent one read as the lesser of two.
    const rows = itHomeRows(
      status({
        status: "needs_attention",
        credentialExpiresInDays: 3,
        credentialExpiringSoon: true,
      }),
      null,
      false,
    );
    expect(keys(rows)).toContain("reauthorise");
    expect(keys(rows)).not.toContain("credential");
  });

  it("does not claim what lapsing does, because the contract does not say", () => {
    const rows = itHomeRows(
      status({ credentialExpiresInDays: 12, credentialExpiringSoon: true }),
      null,
      false,
    );
    const row = rows.find((r) => r.key === "credential")!;
    const text = `${row.title} ${row.sub}`;
    expect(text).not.toMatch(/locked out|lose access|stop working|cannot sign in/i);
  });

  it("counts the credential as something wanting a decision", () => {
    const rows = itHomeRows(
      status({ credentialExpiresInDays: 12, credentialExpiringSoon: true }),
      null,
      false,
    );
    expect(attentionCount(rows)).toBe(1);
  });

  it("sends every row to IT & SSO, never to a roster screen", () => {
    // This reader holds `it_sso`. Assigning a teacher to a class is `roster`,
    // so a link there is a link to a refusal.
    const rows = itHomeRows(
      status({ status: "needs_attention" }),
      history([run({ missingTeacherClassMappings: 2 })], 1),
      false,
    );
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) expect(r.href).toBe("/admin/sso");
  });
});
