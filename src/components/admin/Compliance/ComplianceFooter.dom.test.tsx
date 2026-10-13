import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ComplianceView } from "./ComplianceView";

/**
 * The export is back (12 Oct): backend confirmed in writing that the PDF
 * never carries a finding's term or record id, which was the condition for
 * restoring it. The footer sentence follows the button, as before.
 */

const blob = vi.fn();

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, api: { ...actual.api, blob: (path: string) => blob(path) } };
});
vi.mock("@/lib/api/schoolIntelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/schoolIntelligence")>();
  return {
    ...actual,
    schoolIntelligenceApi: {
      ...actual.schoolIntelligenceApi,
      complianceAudit: async () => ({
        schoolId: "sch1",
        schoolName: "Brightgate Academy",
        generatedAt: "2026-09-29T08:00:00Z",
        studentsProfiled: 240,
        adaptationEventsLogged: 1240,
        diagnosticLabelsStored: 0,
        compliant: true,
        findings: [],
      }),
    },
  };
});
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, list: async () => [] } };
});
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: {
      ...actual.schoolApi,
      get: async () => ({ retentionPolicy: "contract", retentionDays: 365 }),
    },
  };
});
vi.mock("@/lib/api/consents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/consents")>();
  return {
    ...actual,
    consentsApi: {
      ...actual.consentsApi,
      rightsLog: async () => ({ entries: [], total: 0, limit: 20, offset: 0 }),
    },
  };
});

beforeEach(() => {
  blob.mockReset().mockResolvedValue(new Blob(["%PDF"], { type: "application/pdf" }));
  URL.createObjectURL = vi.fn(() => "blob:report");
  URL.revokeObjectURL = vi.fn();
});

describe("the compliance export", () => {
  it("offers the report, and the footer describes it", async () => {
    const { container } = render(<ComplianceView />);
    expect(await screen.findByRole("button", { name: "Export report (PDF)" })).toBeInTheDocument();
    expect(visibleText(container)).toMatch(/The exported report carries the same claims/);
    expect(visibleText(container)).toMatch(/placeholder/i);
  });

  it("reads the PDF through the authenticated client, not a bare link", async () => {
    render(<ComplianceView />);
    fireEvent.click(await screen.findByRole("button", { name: "Export report (PDF)" }));
    await waitFor(() => expect(blob).toHaveBeenCalledWith("/api/admin/compliance-audit/report.pdf"));
    expect(await screen.findByRole("button", { name: "Report downloaded" })).toBeInTheDocument();
  });

  it("offers it again when the download fails", async () => {
    blob.mockRejectedValue(new Error("502"));
    render(<ComplianceView />);
    fireEvent.click(await screen.findByRole("button", { name: "Export report (PDF)" }));
    expect(await screen.findByRole("button", { name: "Try the export again" })).toBeInTheDocument();
  });
});
