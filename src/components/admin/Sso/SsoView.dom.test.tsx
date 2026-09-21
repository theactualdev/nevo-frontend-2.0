import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { School } from "@/lib/api/school";
import type { SsoStatus } from "@/lib/api/sso";
import { SsoView } from "./SsoView";

/*
 * `SsoView` reads `roster` scope to decide whether the mapping-gap banner
 * offers a way to fix it - `it_sso` can be held on its own, and a link to
 * Classes would then be a link to a refusal. Granted here so the banner's
 * action renders; the scope-less case has its own test.
 */
vi.mock("@/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks")>();
  return {
    ...actual,
    usePermissions: () => ({
      scopes: ["it_sso", "roster"],
      resolved: true,
      status: "ready" as const,
      refresh: () => {},
      hasScope: () => true,
    }),
  };
});

/**
 * The worst of the five failed-read claims: a school whose sync history did not
 * answer was told its roster sync was "Healthy".
 *
 * The mechanism was `history?.failedRuns ?? 0` - a failed read coalesces to 0
 * and falls straight into the healthy branch, so absence of evidence rendered
 * as evidence of health, on the one operation that creates, matches and
 * deactivates real student and staff records. Fixed in #269; pinned here.
 */

/*
 * THESE FIXTURES WERE snake_case, AND THE ENDPOINT ANSWERS camelCase.
 *
 * `RosterSyncHistoryResponse` is `{windowDays, successfulRuns, failedRuns}`.
 * The fixtures below were copied from the CLIENT INTERFACE rather than from
 * the spec, and the interface was wrong - so "names real failures when the
 * history reports them" passed here while, against the real API,
 * `failedRuns` was `undefined`, `?? 0` made it zero, and the screen said
 * "Healthy" no matter how many syncs had failed.
 *
 * A fixture copied from the type under test can only ever prove the code
 * agrees with itself. `npm run contract` compares the type to the deployed
 * document, which is the thing that caught this.
 */
const status = vi.fn();
const syncHistory = vi.fn();

vi.mock("@/lib/api/sso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/sso")>();
  return {
    ...actual,
    ssoApi: {
      ...actual.ssoApi,
      status: () => status(),
      syncHistory: () => syncHistory(),
    },
  };
});

vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: {
      ...actual.schoolApi,
      get: async () =>
        ({ id: "sch1", name: "Brightgate", code: "BGA-4827" }) as School,
    },
  };
});

const CONNECTED: SsoStatus = {
  provider: "microsoft",
  status: "connected",
  schoolUrlSlug: "brightgate",
  schoolEntryUrl: "https://nevolearning.com/s/brightgate",
  lastConnectionError: null,
  connectionCheckedAt: null,
  reauthorisedAt: null,
  lastSuccessfulSyncAt: "2026-09-08T06:00:00Z",
  nextScheduledSyncAt: null,
  credentialExpiresAt: null,
  credentialExpiresInDays: null,
  credentialExpiringSoon: false,
  disconnectedAt: null,
  dataFlow: [],
};


describe("SsoView roster sync health", () => {
  it("does not claim Healthy when the run history failed to load", async () => {
    status.mockResolvedValue(CONNECTED);
    syncHistory.mockRejectedValue(new Error("500"));

    const { container } = render(<SsoView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/sync history unavailable/i),
    );

    // The claim must be GONE, not merely qualified further down the card.
    expect(visibleText(container)).not.toMatch(/\bHealthy\b/);
    expect(visibleText(container)).toMatch(/does not account for failed runs/i);
  });

  it("says Healthy only when the history actually reports no failures", async () => {
    status.mockResolvedValue(CONNECTED);
    syncHistory.mockResolvedValue({
      windowDays: 30,
      successfulRuns: 12,
      failedRuns: 0,
      runs: [],
    });

    const { container } = render(<SsoView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/\bHealthy\b/));
    expect(visibleText(container)).toMatch(/12 successful runs in the last 30 days/i);
    expect(visibleText(container)).not.toMatch(/unavailable/i);
  });

  it("names real failures when the history reports them", async () => {
    status.mockResolvedValue(CONNECTED);
    syncHistory.mockResolvedValue({
      windowDays: 30,
      successfulRuns: 9,
      failedRuns: 3,
      runs: [],
    });

    const { container } = render(<SsoView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/failures to look at/i));
    expect(visibleText(container)).toMatch(/3 failed/i);
    expect(visibleText(container)).not.toMatch(/\bHealthy\b/);
  });
});
