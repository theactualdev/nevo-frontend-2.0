import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { School } from "@/lib/api/school";
import type { SsoStatus } from "@/lib/api/sso";
import { SsoView } from "./SsoView";

/**
 * A DISCONNECTED SCHOOL GOT THE CONNECTED PAGE.
 *
 * `SsoConnectionStatus` has three members and this screen branched on two, so
 * every section gated on "we hold a status record" rendered for a school that
 * had turned its provider off: a "Healthy" roster sync with a Sync now button,
 * a sign-in URL nobody can use, and an offer to disconnect Microsoft 365 -
 * which is already disconnected.
 *
 * What that school actually needs is the school code its people sign in with.
 */

vi.mock("@/lib/api/sso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/sso")>();
  return {
    ...actual,
    ssoApi: {
      ...actual.ssoApi,
      status: async (): Promise<SsoStatus> => ({
        provider: "microsoft",
        status: "disconnected",
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
        disconnectedAt: "2026-09-12T10:00:00Z",
        dataFlow: [
          { key: "name", description: "Name", purpose: "so people appear as themselves" },
        ],
      }),
      syncHistory: async () => ({
        windowDays: 30,
        successfulRuns: 4,
        failedRuns: 0,
        runs: [],
      }),
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
        ({ id: "s1", name: "Brightgate", code: "BGA-4827" }) as School,
    },
  };
});

vi.mock("@/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks")>();
  return {
    ...actual,
    usePermissions: () => ({
      scopes: ["it_sso"],
      resolved: true,
      status: "ready" as const,
      refresh: () => {},
      hasScope: () => false,
    }),
  };
});

describe("a school whose provider is disconnected", () => {
  it("is not shown a roster sync, a sign-in URL or a way to disconnect", async () => {
    const { container } = render(<SsoView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Sign-in provider/),
    );
    const text = visibleText(container);
    expect(text).not.toMatch(/Roster sync/);
    expect(text).not.toMatch(/Healthy/);
    expect(text).not.toMatch(/Sync now/);
    expect(text).not.toMatch(/School sign-in URL/);
    expect(text).not.toMatch(/Disconnect Microsoft 365/);
  });

  it("is given the school code its people sign in with instead", async () => {
    const { container } = render(<SsoView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/BGA-4827/));
    expect(visibleText(container)).toMatch(/works right now/);
  });

  it("is told what happened, and that nothing of theirs was lost", async () => {
    const { container } = render(<SsoView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Microsoft 365 was disconnected/),
    );
    const text = visibleText(container);
    expect(text).toMatch(/stayed exactly as it was/);
    expect(text).toMatch(/school code now/);
  });

  it("keeps the disclosure, in the past tense", async () => {
    // The reader most likely to be asking what their provider ever had, and
    // whether it still does, is the one this section used to vanish for.
    const { container } = render(<SsoView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /What moved between Nevo and Microsoft 365/,
      ),
    );
    const text = visibleText(container);
    expect(text).toMatch(/What we read from Microsoft 365/);
    expect(text).toMatch(/What we never touch/);
    expect(text).toMatch(/Consent records/);
    expect(text).toMatch(/What we store about students/);
  });

  it("stamps neither provider card 'Not in use.' as a pill", async () => {
    const { container } = render(<SsoView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Google Workspace/),
    );
    // Google, never chosen, carries the words as its description; Microsoft,
    // this school's own, says how people get in now.
    const text = visibleText(container);
    expect(text).toMatch(/Not in use\. Everyone signs in with your school code/);
    expect(text).not.toMatch(/Needs reauthorising/);
    expect(text).not.toMatch(/\bConnected\b/);
  });
});
