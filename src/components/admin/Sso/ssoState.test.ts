import { describe, expect, it } from "vitest";
import type { RosterSyncHistory, RosterSyncRun, SsoStatus } from "@/lib/api/sso";
import {
  dataFlowHeading,
  isDisconnected,
  isLive,
  neverTouched,
  providerDescription,
  syncReport,
} from "./ssoState";

/**
 * What this screen is allowed to say about a school's sign-in.
 *
 * Every case below is one the screen has answered wrongly at some point, and
 * the direction is always the same: a state we could not read, or had not
 * checked for, rendering as a healthy one.
 */

const status = (over: Partial<SsoStatus> = {}): SsoStatus => ({
  provider: "microsoft",
  status: "connected",
  schoolUrlSlug: "brightgate",
  schoolEntryUrl: "https://nevolearning.com/s/brightgate",
  lastConnectionError: null,
  connectionCheckedAt: null,
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

const history = (
  runs: RosterSyncRun[],
  failedRuns = 0,
): RosterSyncHistory => ({
  windowDays: 30,
  successfulRuns: runs.length,
  failedRuns,
  runs,
});

describe("isLive", () => {
  it("is false for a provider that was disconnected", () => {
    // The whole finding: `status !== null` was read as "a provider is live",
    // so a disconnected school got the connected page.
    expect(isLive(status({ status: "disconnected" }))).toBe(false);
    expect(isDisconnected(status({ status: "disconnected" }))).toBe(true);
  });

  it("is true while access merely needs renewing", () => {
    // Everyone can still sign in. This is not the same as disconnected, and
    // the page must keep its management sections.
    expect(isLive(status({ status: "needs_attention" }))).toBe(true);
    expect(isDisconnected(status({ status: "needs_attention" }))).toBe(false);
  });

  it("is false when there is no provider at all", () => {
    expect(isLive(null)).toBe(false);
    expect(isDisconnected(null)).toBe(false);
  });
});

describe("syncReport", () => {
  it("never reads as healthy when the history could not be read", () => {
    const r = syncReport(status(), null, true);
    expect(r.word).toBe("unknown");
    expect(r.label).not.toMatch(/healthy/i);
    expect(r.sub).toMatch(/couldn't read the run history/);
  });

  it("waits, rather than calling a sync that never happened healthy", () => {
    // "Healthy · Last synced never" is what this said to a school in its
    // first hour.
    const r = syncReport(
      status({ lastSuccessfulSyncAt: null }),
      history([]),
      false,
    );
    expect(r.word).toBe("waiting");
    expect(r.label).toBe("Waiting for the first sync");
    expect(r.sub).not.toMatch(/never/);
  });

  it("names the scheduled time, which was fetched and never rendered", () => {
    const r = syncReport(
      status({
        lastSuccessfulSyncAt: null,
        nextScheduledSyncAt: "2026-09-16T06:00:00Z",
      }),
      history([]),
      false,
    );
    expect(r.sub).toMatch(/scheduled for 16 September/);
  });

  it("offers a start rather than a shrug when nothing is scheduled", () => {
    const r = syncReport(
      status({ lastSuccessfulSyncAt: null }),
      history([]),
      false,
    );
    expect(r.sub).toMatch(/You can start one now/);
  });

  it("reports failures over health", () => {
    const r = syncReport(status(), history([run()], 3), false);
    expect(r.word).toBe("failures");
    expect(r.sub).toMatch(/3 failed in the last 30 days/);
  });

  it("is paused, not healthy, while access has expired", () => {
    const r = syncReport(
      status({ status: "needs_attention" }),
      history([run()]),
      false,
    );
    expect(r.word).toBe("paused");
  });

  it("names the mapping gap the frame draws, instead of Healthy", () => {
    const r = syncReport(
      status(),
      history([run({ missingTeacherClassMappings: 3 })]),
      false,
    );
    expect(r.word).toBe("unfinished");
    expect(r.label).toBe("Synced with one thing to finish");
    expect(r.mappingGap).toBe(3);
  });

  it("claims no mapping gap from a history it could not read", () => {
    const r = syncReport(status(), null, true);
    expect(r.mappingGap).toBe(0);
  });

  it("is healthy only when every check passed", () => {
    const r = syncReport(status(), history([run()]), false);
    expect(r.word).toBe("healthy");
    expect(r.sub).toMatch(/1 successful run in the last 30 days/);
  });
});

describe("providerDescription", () => {
  it("puts 'Not in use.' on a provider the school never chose", () => {
    expect(providerDescription("google", false, false)).toBe("Not in use.");
  });

  it("says how people sign in instead, for a live provider", () => {
    expect(providerDescription("microsoft", true, true)).toBe(
      "Staff and students sign in with their school Microsoft account.",
    );
  });

  it("tells a disconnected school how its people get in now", () => {
    // "Not in use." alone, on the school's OWN provider, leaves an IT lead
    // with no answer to the only question they have.
    expect(providerDescription("microsoft", true, false)).toMatch(
      /school code/,
    );
  });
});

describe("the disclosure", () => {
  it("puts the integration in the past for a disconnected school", () => {
    expect(dataFlowHeading(status({ status: "disconnected" }))).toBe(
      "What moved between Nevo and Microsoft 365",
    );
    expect(dataFlowHeading(status())).toBe(
      "What moves between Nevo and Microsoft 365",
    );
  });

  it("names the boundary as well as the reach", () => {
    // `dataFlow` carries what we read. Nothing in the contract carries what
    // we do not, and nothing can: an endpoint cannot enumerate an absence.
    const rows = neverTouched("Microsoft 365");
    expect(rows.map((r) => r.name)).toEqual([
      "Consent records",
      "How a student is learning",
      "What teachers write about their class",
      "Anything in the other direction",
    ]);
    expect(rows[3].purpose).toBe("we never write to your Microsoft 365");
  });
});
