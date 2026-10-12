import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";

/**
 * SCRUM-247: "A person who does not hold it sees the progress report exporter
 * and adaptation history as unavailable, not as missing."
 */

const { holders, adaptations, list } = vi.hoisted(() => ({
  holders: vi.fn(),
  adaptations: vi.fn(),
  list: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/senco/s1",
}));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ userId: "u1", role: "other_admin", name: "Folake Adebayo" }),
}));
vi.mock("@/lib/api/learningSupport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/learningSupport")>();
  return {
    ...actual,
    learningSupportApi: { ...actual.learningSupportApi, holders: () => holders() },
  };
});
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      get: async () => ({
        id: "s1",
        firstName: "Ada",
        lastName: "Obi",
        loginIdentifier: "NV-1",
        email: null,
        status: "active",
        ageBand: "11-14",
        classIds: [],
        firstUse: false,
        consent: { status: "confirmed", actorId: null, actorName: null, timestamp: null, channel: null },
      }),
      accommodations: async () => null,
      mastery: async () => [],
      adaptations: () => adaptations(),
      list: () => list(),
    },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return { ...actual, classesApi: { ...actual.classesApi, list: async () => [] } };
});

import { LearnerProfileView } from "./LearnerProfileView";
import { IepExporterView } from "./IepExporterView";

const ROLE_REFUSAL = new ApiError(403, "Forbidden", {
  detail: { code: "learning_support_role_required", message: "…from the compliance screen…" },
});

beforeEach(() => {
  holders.mockResolvedValue({ holders: [], viewerHoldsIt: false });
  adaptations.mockRejectedValue(ROLE_REFUSAL);
  list.mockResolvedValue([]);
});

describe("the learner profile, without Learning Support", () => {
  it("keeps the adaptation history section and says how to get it", async () => {
    // `visibleText` joins text nodes with a space: "Ada 's", "history .".
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /You don.t have access to Ada\s?.s adaptation history\s?\. It needs Learning Support, which another administrator can give you on your record in Admin Team\./,
      ),
    );
    // Never the backend's pointer to Compliance, which is not where it lives.
    expect(visibleText(container)).not.toMatch(/compliance screen/);
  });

  it("shows the progress report control switched off, not gone", async () => {
    render(<LearnerProfileView studentId="s1" />);
    const control = await screen.findByRole("button", { name: "Create a progress report" });
    expect(control).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Create a progress report" })).toBeNull();
    expect(control).toHaveAccessibleDescription(/Progress reports need Learning Support/);
  });

  it("names Learning Support even before the holders read answers, from the refusal itself", async () => {
    holders.mockReturnValue(new Promise(() => {}));
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/adaptation history\s?\. It needs Learning Support/),
    );
  });

  it("is the ordinary profile for a holder", async () => {
    holders.mockResolvedValue({ holders: [], viewerHoldsIt: true });
    adaptations.mockResolvedValue([]);
    render(<LearnerProfileView studentId="s1" />);
    expect(await screen.findByRole("link", { name: "Create a progress report" })).toBeInTheDocument();
  });
});

describe("the progress report exporter, without Learning Support", () => {
  it("is still a page, and says why it can't be used", async () => {
    const { container } = render(<IepExporterView />);
    expect(await screen.findByText(/Progress reports aren.t available to you/)).toBeInTheDocument();
    expect(visibleText(container)).toMatch(/It needs Learning Support/);
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
