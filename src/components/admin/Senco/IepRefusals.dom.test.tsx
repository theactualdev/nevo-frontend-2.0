import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { AdminStudentRow, ParentLink } from "@/lib/api/students";
import type { IepExport } from "@/lib/api/export";
import { IepExporterView } from "./IepExporterView";

/**
 * QA, 10 Oct: the exporter said "You don't have access" to an admin who could
 * draft perfectly well. Finalising is refused by ROLE (403
 * `senco_review_required`) and a share to an unlinked guardian by TARGET (403
 * `parent_share_target_invalid`); neither is about access to the exporter.
 */

const list = vi.fn();
const parentLinks = vi.fn();
const create = vi.fn();
const review = vi.fn();
const share = vi.fn();
let role: string | null = null;

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => (role ? { userId: "u1", role, name: "Folake Adebayo" } : null),
}));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, list: () => list(), parentLinks: (id: string) => parentLinks(id) },
  };
});
vi.mock("@/lib/api/export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/export")>();
  return {
    ...actual,
    exportApi: {
      ...actual.exportApi,
      create: (p: unknown) => create(p),
      review: (id: string, p: unknown) => review(id, p),
      share: (id: string, p: unknown) => share(id, p),
      listShares: async () => [],
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

const exportOf = (status: IepExport["status"]): IepExport => ({
  id: "e1",
  studentId: "s1",
  requestedByUserId: "u1",
  periodStart: "2026-05-01",
  periodEnd: "2026-09-01",
  status,
  exportContent: "Amara has been working steadily.",
  sourceSummary: {},
  annotations: [],
  aiGatewayCallId: null,
  reviewedByUserId: status === "final" ? "u1" : null,
  reviewedAt: status === "final" ? "2026-09-14T09:00:00Z" : null,
  reviewNote: null,
});

const guardian: ParentLink = {
  id: "pl1",
  schoolId: "sch1",
  studentId: "s1",
  parentId: "p1",
  parentName: "Ngozi Okafor",
  parentContact: "ngozi@example.com",
  contactMethod: "email",
  accountCreated: true,
};

async function generate(container: HTMLElement) {
  await screen.findByRole("button", { name: "Generate draft" });
  const select = container.querySelector("select")!;
  select.value = "s1";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Generate draft" })).toBeEnabled());
  screen.getByRole("button", { name: "Generate draft" }).click();
}

beforeEach(() => {
  vi.clearAllMocks();
  role = null;
  list.mockResolvedValue([student]);
  parentLinks.mockResolvedValue([guardian]);
  create.mockResolvedValue(exportOf("draft"));
});

describe("finalising, which is the SENCo's", () => {
  it("tells an admin who is not the SENCo before they press it", async () => {
    role = "other_admin";
    const { container } = render(<IepExporterView />);
    await generate(container);
    const finalise = await screen.findByRole("button", { name: "Finalise report" });
    expect(finalise).toBeDisabled();
    expect(visibleText(container)).toMatch(/Only your school.s SENCo can finalise a report/);
    // Drafting is theirs: Save stays open, and nothing says "no access".
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
    expect(visibleText(container)).not.toMatch(/don.t have access/);
  });

  it("keeps the draft when the server refuses, rather than closing the exporter", async () => {
    review.mockRejectedValue(
      new ApiError(403, "Forbidden", {
        detail: {
          code: "senco_review_required",
          message: "SENCo review is required before this export can be finalized.",
        },
      }),
    );
    const { container } = render(<IepExporterView />);
    await generate(container);
    (await screen.findByRole("button", { name: "Finalise report" })).click();
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Only your school.s SENCo can finalise a report/),
    );
    expect(visibleText(container)).not.toMatch(/don.t have access to the IEP exporter/);
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  });

  it("lets the SENCo finalise", async () => {
    role = "senco_admin";
    const { container } = render(<IepExporterView />);
    await generate(container);
    expect(await screen.findByRole("button", { name: "Finalise report" })).toBeEnabled();
    expect(visibleText(container)).not.toMatch(/Only your school.s SENCo/);
  });
});

describe("a share the server refuses", () => {
  it("says the guardian is not linked, and that nothing was shared", async () => {
    create.mockResolvedValue(exportOf("final"));
    share.mockRejectedValue(
      new ApiError(403, "Forbidden", {
        detail: {
          code: "parent_share_target_invalid",
          message: "The parent or guardian account is not linked to this student.",
        },
      }),
    );
    const { container } = render(<IepExporterView />);
    await generate(container);
    (await screen.findByRole("button", { name: "Share" })).click();
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/not linked to this student/),
    );
    expect(visibleText(container)).not.toMatch(/don.t have access to the IEP exporter/);
    expect(visibleText(container)).not.toMatch(/may still have reached them/);
  });
});
