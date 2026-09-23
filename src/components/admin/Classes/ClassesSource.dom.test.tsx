import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminClass } from "@/lib/api/classes";
import type { SsoStatus } from "@/lib/api/sso";
import { ClassesView } from "./ClassesView";

/**
 * The SSO source line named neither the provider nor the last sync, on a
 * TODO(api) in this screen's own docblock which had already been corrected to
 * say the gap was ours - and then sat there, corrected and unacted.
 *
 * Every clause is conditional on having been told. A status we could not read
 * leaves the generic sentence rather than inventing a provider, and a school
 * that has never completed a sync gets no "last synced" clause rather than the
 * word "never".
 */

const list = vi.fn();
const ssoStatus = vi.fn();

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      list: (includeArchived?: boolean) => list(includeArchived),
      classTeachers: async () => [],
    },
  };
});

vi.mock("@/lib/api/sso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/sso")>();
  return {
    ...actual,
    ssoApi: { ...actual.ssoApi, status: () => ssoStatus() },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const klass = (id: string, source: AdminClass["source"]): AdminClass => ({
  id,
  name: `Class ${id}`,
  code: null,
  yearGroup: "jss2",
  source,
  subjects: [],
  studentCount: 20,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  archivedAt: null,
});

const status = (over: Partial<SsoStatus> = {}): SsoStatus => ({
  provider: "microsoft",
  status: "connected",
  schoolUrlSlug: "brightgate",
  schoolEntryUrl: "https://nevolearning.com/s/brightgate",
  lastConnectionError: null,
  connectionCheckedAt: null,
  reauthorisedAt: null,
  lastSuccessfulSyncAt: new Date(Date.now() - 20 * 60_000).toISOString(),
  nextScheduledSyncAt: null,
  credentialExpiresAt: null,
  credentialExpiresInDays: null,
  credentialExpiringSoon: false,
  disconnectedAt: null,
  dataFlow: [],
  ...over,
});

beforeEach(() => {
  list.mockReset();
  ssoStatus.mockReset();
  list.mockResolvedValue([klass("a", "roster_sync"), klass("b", "roster_sync")]);
  ssoStatus.mockResolvedValue(status());
});

describe("the SSO source line", () => {
  it("names the provider and the last sync", async () => {
    const { container } = render(<ClassesView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /These classes come from your school's Microsoft 365 roster/,
      ),
    );
    expect(visibleText(container)).toMatch(/Last synced 20 minutes ago/);
  });

  it("falls back to the generic sentence when the status could not be read", async () => {
    // A 404 here is the ordinary "no provider" answer, and this line only
    // renders for a roster-sourced list anyway - but a failed read must not
    // put a provider's name on the screen.
    ssoStatus.mockRejectedValue(new Error("404"));
    const { container } = render(<ClassesView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/your school's connected roster/),
    );
    expect(visibleText(container)).not.toMatch(/Microsoft/);
    expect(visibleText(container)).not.toMatch(/Last synced/);
  });

  it("says nothing about a sync that has never completed", async () => {
    ssoStatus.mockResolvedValue(status({ lastSuccessfulSyncAt: null }));
    const { container } = render(<ClassesView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Microsoft 365 roster/),
    );
    expect(visibleText(container)).not.toMatch(/Last synced/);
    expect(visibleText(container)).not.toMatch(/never/i);
  });

  it("is absent for a school that made its own classes", async () => {
    list.mockResolvedValue([klass("a", null)]);
    const { container } = render(<ClassesView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Class a/));
    expect(visibleText(container)).not.toMatch(/come from your school/);
  });

  it("does not hold the list up waiting for it", async () => {
    // `sso/status` 404s for most schools, and the line above the table is a
    // nicety. A read that never settles must not cost the roster.
    ssoStatus.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ClassesView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Class a/));
  });
});
