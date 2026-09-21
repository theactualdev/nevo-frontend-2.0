import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
 * A failed disconnect wrote its only explanation to the page BEHIND the modal
 * that was still covering the screen.
 *
 * So the IT lead saw nothing change and pressed the button again - and again -
 * each press firing another disconnect at a provider mid-migration. A message
 * nobody can see is not a message; this one renders inside the dialog.
 */

const disconnect = vi.fn();

vi.mock("@/lib/api/sso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/sso")>();
  return {
    ...actual,
    ssoApi: {
      ...actual.ssoApi,
      status: async (): Promise<SsoStatus> => ({
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
      }),
      syncHistory: async () => ({
        windowDays: 30,
        successfulRuns: 4,
        failedRuns: 0,
        runs: [],
      }),
      disconnect: () => disconnect(),
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

async function openDialog() {
  fireEvent.click(
    await screen.findByRole("button", { name: /Disconnect Microsoft 365/ }),
  );
  return screen.findByRole("dialog");
}

describe("SsoView disconnect", () => {
  it("puts the failure inside the dialog the admin is looking at", async () => {
    disconnect.mockRejectedValue(new Error("500"));

    render(<SsoView />);
    const dialog = await openDialog();
    fireEvent.click(
      screen.getByRole("button", { name: "Disconnect and use our school code" }),
    );

    // Inside the dialog, not on the page behind it.
    await waitFor(() =>
      expect(visibleText(dialog)).toMatch(
        /couldn't disconnect Microsoft 365/i,
      ),
    );
    expect(visibleText(dialog)).toMatch(/nothing has changed/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("clears the failure when the admin backs out", async () => {
    disconnect.mockRejectedValue(new Error("500"));

    render(<SsoView />);
    const dialog = await openDialog();
    fireEvent.click(
      screen.getByRole("button", { name: "Disconnect and use our school code" }),
    );
    await waitFor(() =>
      expect(visibleText(dialog)).toMatch(/couldn't disconnect/i),
    );

    fireEvent.click(screen.getByRole("button", { name: "Keep it connected" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Reopening must not show a stale failure from last time.
    const again = await openDialog();
    expect(visibleText(again)).not.toMatch(/couldn't disconnect/i);
  });

  it("closes and reports the retained accounts when it succeeds", async () => {
    disconnect.mockResolvedValue({
      provider: "microsoft",
      disconnectedAt: "2026-09-08T10:00:00Z",
      retainedUserCount: 412,
    });

    const { container } = render(<SsoView />);
    await openDialog();
    fireEvent.click(
      screen.getByRole("button", { name: "Disconnect and use our school code" }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(visibleText(container)).toMatch(/412 accounts kept exactly as they are/);
    expect(visibleText(container)).not.toMatch(/couldn't disconnect/i);
  });
});
