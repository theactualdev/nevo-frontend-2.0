import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminStudentRow, ParentLink } from "@/lib/api/students";
import type { IepExport, IepExportShare } from "@/lib/api/export";
import { IepExporterView } from "./IepExporterView";

/**
 * WHERE A CHILD'S SEN REPORT HAS ALREADY GONE.
 *
 * `GET /exports/iep/{id}/shares` was a pre-launch blocker until 21 Sep: the
 * share record was written by one endpoint and read by none, so on reload a
 * SENCo could not tell whether a report had already reached a guardian.
 *
 * Every test here pins something the screen is now able to say and previously
 * could not - and two of them pin things it must still refuse to say.
 */

const list = vi.fn();
const parentLinks = vi.fn();
const create = vi.fn();
const listShares = vi.fn();
const share = vi.fn();

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      list: () => list(),
      parentLinks: (id: string) => parentLinks(id),
    },
  };
});

vi.mock("@/lib/api/export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/export")>();
  return {
    ...actual,
    exportApi: {
      ...actual.exportApi,
      create: (p: unknown) => create(p),
      listShares: (id: string) => listShares(id),
      share: (id: string, p: unknown) => share(id, p),
    },
  };
});

const student: AdminStudentRow = {
  id: "s1",
  name: "Amara Okafor",
  loginIdentifier: "amara",
  status: "active",
  ageBand: "11-14",
  consent: { status: "not_sent", actorId: null, actorName: null, timestamp: null, channel: null },
};

const guardian = (over: Partial<ParentLink> = {}): ParentLink => ({
  id: "pl1",
  schoolId: "sch1",
  studentId: "s1",
  parentId: "p1",
  parentName: "Ngozi Okafor",
  parentContact: "ngozi@example.com",
  contactMethod: "email",
  accountCreated: true,
  ...over,
});

/** A FINAL export, so the share card renders without driving the whole flow. */
const finalExport: IepExport = {
  id: "e1",
  studentId: "s1",
  requestedByUserId: "u1",
  periodStart: "2026-05-01",
  periodEnd: "2026-09-01",
  status: "final",
  exportContent: "Amara has been working steadily.",
  sourceSummary: {},
  annotations: [],
  aiGatewayCallId: null,
  reviewedByUserId: "u1",
  reviewedAt: "2026-09-14T09:00:00Z",
  reviewNote: null,
};

const shareRecord = (over: Partial<IepExportShare> = {}): IepExportShare => ({
  id: "sh1",
  exportId: "e1",
  studentId: "s1",
  parentId: "p1",
  sharedByUserId: "u1",
  status: "shared",
  sharedAt: "2026-09-15T10:00:00Z",
  ...over,
});

/** Drive the picker to a finalised export, where the share card lives. */
async function reachShareCard(container: HTMLElement) {
  await screen.findByRole("button", { name: "Generate draft" });
  const select = container.querySelector("select")!;
  select.value = "s1";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Generate draft" })).toBeEnabled(),
  );
  screen.getByRole("button", { name: "Generate draft" }).click();
  await screen.findByText(/Share with parent/i);
}

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([student]);
  parentLinks.mockResolvedValue([guardian()]);
  create.mockResolvedValue(finalExport);
  listShares.mockResolvedValue([]);
});

describe("IEP share history", () => {
  it("names who already has the report, and when", async () => {
    listShares.mockResolvedValue([shareRecord()]);

    const { container } = render(<IepExporterView />);
    await reachShareCard(container);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Shared with Ngozi Okafor on 15 September 2026/),
    );
  });

  it("says a revoked share is NOT someone who has it", async () => {
    /*
     * The difference that matters most on this screen. A revoked share is a
     * guardian who no longer holds a child's SEN report; rendering it as
     * "Shared with" states the opposite of the truth about who can read it.
     */
    listShares.mockResolvedValue([shareRecord({ status: "revoked" })]);

    const { container } = render(<IepExporterView />);
    await reachShareCard(container);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/no longer has access/i),
    );
    expect(visibleText(container)).not.toMatch(/Shared with Ngozi Okafor on/);
  });

  it("does not read a failed share lookup as a report nobody has", async () => {
    /*
     * The worst sentence available on this screen. A GET that fell over must
     * never render as "this hasn't been shared with anyone yet".
     */
    listShares.mockRejectedValue(new Error("500"));

    const { container } = render(<IepExporterView />);
    await reachShareCard(container);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn't check who this has already been shared with/i),
    );
    expect(visibleText(container)).not.toMatch(/hasn't been shared with anyone/i);
    expect(visibleText(container)).toMatch(/don't read that as nobody/i);
  });

  it("states an empty history as a fact, now that it is one", async () => {
    listShares.mockResolvedValue([]);

    const { container } = render(<IepExporterView />);
    await reachShareCard(container);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/hasn't been shared with anyone yet/i),
    );
  });

  it("states the event without a name when the guardian is no longer linked", async () => {
    // `ParentLink.parentId` is nullable and a guardian can be unlinked after a
    // share. The line must not invent "Unknown guardian" on a SEN record.
    listShares.mockResolvedValue([shareRecord({ parentId: "someone-else" })]);

    const { container } = render(<IepExporterView />);
    await reachShareCard(container);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Shared with a linked guardian on 15 September 2026/),
    );
    expect(visibleText(container)).not.toMatch(/unknown|undefined|null/i);
  });

  it("stops warning about an unconfirmed share once the record proves it landed", async () => {
    /*
     * The failure this screen has always warned about is a transport error
     * that still committed the share. That used to be unknowable, so the copy
     * told a SENCo to go and check the parent's account. Now we look.
     */
    share.mockRejectedValue(new Error("network"));
    listShares.mockResolvedValueOnce([]).mockResolvedValue([shareRecord()]);

    const { container } = render(<IepExporterView />);
    await reachShareCard(container);
    await waitFor(() => expect(screen.getByRole("button", { name: "Share" })).toBeEnabled());
    screen.getByRole("button", { name: "Share" }).click();

    await waitFor(() => expect(listShares).toHaveBeenCalledTimes(2));
    expect(visibleText(container)).not.toMatch(/didn't confirm/i);
  });
});
