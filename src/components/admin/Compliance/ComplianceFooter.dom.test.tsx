import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ComplianceView } from "./ComplianceView";

/**
 * The footer promised "the exported report" to a school whose Export button
 * is switched off until counsel clears the PDF. The sentence follows the
 * button now.
 */

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

describe("the compliance footer", () => {
  it("does not promise an export the page does not offer", async () => {
    const { container } = render(<ComplianceView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/placeholder/i));

    expect(screen.queryByRole("button", { name: /Export/i })).toBeNull();
    expect(visibleText(container)).not.toMatch(/exported report/i);
  });
});
