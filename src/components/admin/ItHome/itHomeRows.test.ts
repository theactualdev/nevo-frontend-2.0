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
  /*
   * A SCHOOL THAT RECORDED ITS EXPIRY. This defaulted to null, which is now a
   * state of its own - "nobody told us when this lapses" - so every test below
   * that means "healthy" was quietly asserting the opposite.
   */
  credentialExpiresAt: "2026-12-20T00:00:00Z",
  credentialExpiresInDays: 90,
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

  it("says what lapsing does, and whose end it happens at", () => {
    /*
     * THE INVERSE OF WHAT THIS TEST USED TO ASSERT. It required the copy to
     * claim NO consequence, because the contract stated none. Backend answered
     * on 24 Sep: *"nothing on our side changes when it passes... What breaks
     * is at Microsoft's end: the token exchange starts failing, so SSO sign-in
     * stops for everyone at that school."*
     *
     * The attribution is the point. A school told "we will lock you out" takes
     * the problem to the wrong people; the lockout is at the provider and so
     * is the fix.
     */
    const rows = itHomeRows(
      status({ credentialExpiresInDays: 12, credentialExpiringSoon: true }),
      null,
      false,
    );
    const row = rows.find((r) => r.key === "credential")!;
    const text = `${row.title} ${row.sub}`;

    expect(text).toMatch(/your provider stops letting anyone sign in/i);
    // Nothing has broken yet - it is a warning, not a report.
    expect(text).toMatch(/Nothing has changed yet/i);
  });

  it("speaks in the present tense once it has actually lapsed", () => {
    const rows = itHomeRows(
      status({ credentialExpiresInDays: 0, credentialExpiringSoon: true }),
      null,
      false,
    );
    const row = rows.find((r) => r.key === "credential")!;
    expect(row.sub).toMatch(/that stops until it.s reconnected/i);
    expect(row.sub).not.toMatch(/Nothing has changed yet/i);
  });

  it("counts the credential as something wanting a decision", () => {
    const rows = itHomeRows(
      status({ credentialExpiresInDays: 12, credentialExpiringSoon: true }),
      null,
      false,
    );
    expect(attentionCount(rows)).toBe(1);
  });

  it("does not let an unrecorded expiry pass for health", () => {
    /*
     * THE DEFECT THIS ROW EXISTS FOR. The expiry cannot be read back from the
     * provider - it is recorded by hand at setup - so null means the school
     * never told us and we CANNOT warn them. The first version of this row
     * rendered nothing here, and the hero then said "Nothing needs your
     * attention" to exactly the school we cannot protect.
     */
    const rows = itHomeRows(status({ credentialExpiresAt: null }), null, false);
    const row = rows.find((r) => r.key === "credential-unknown")!;
    expect(row).toBeDefined();
    expect(attentionCount(rows)).toBe(1);
  });

  it("does not claim an unrecorded expiry is something we can look up", () => {
    const rows = itHomeRows(status({ credentialExpiresAt: null }), null, false);
    const row = rows.find((r) => r.key === "credential-unknown")!;
    // No endpoint records it, so the row must not offer to.
    expect(row.sub).toMatch(/can't be read back|cannot be read back/i);
    expect(`${row.title} ${row.action}`).not.toMatch(/add|record|enter|tell us/i);
  });

  it("stays quiet about an unknown expiry when there is no live connection", () => {
    for (const s of ["disconnected", "needs_attention"] as const) {
      const rows = itHomeRows(status({ status: s, credentialExpiresAt: null }), null, false);
      expect(keys(rows)).not.toContain("credential-unknown");
    }
  });

  it("raises the expiry once, never as both a warning and an unknown", () => {
    // `credentialExpiringSoon` is independent of the date in the schema, so
    // "soon, and no date" is expressible and must not produce two rows.
    const rows = itHomeRows(
      status({ credentialExpiresAt: null, credentialExpiringSoon: true }),
      null,
      false,
    );
    expect(keys(rows)).toContain("credential");
    expect(keys(rows)).not.toContain("credential-unknown");
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
