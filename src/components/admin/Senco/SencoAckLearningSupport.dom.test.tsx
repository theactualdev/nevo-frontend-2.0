import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { AttentionFlag } from "@/lib/api/intelligence";

/**
 * Only a Learning Support holder can mark a flag as seen (Teslim, 13 Oct) - so
 * that "learning support saw it" is true. Without the role the control stays,
 * switched off, and says why: unavailable, not missing (SCRUM-247).
 */

const { holders, getFlags, acknowledgeFlag } = vi.hoisted(() => ({
  holders: vi.fn(),
  getFlags: vi.fn(),
  acknowledgeFlag: vi.fn(),
}));

vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: {
      ...actual.intelligenceApi,
      allFlags: async () => ({ flags: await getFlags(), complete: true }),
      acknowledgeFlag: (id: string) => acknowledgeFlag(id),
    },
  };
});
vi.mock("@/lib/api/learningSupport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/learningSupport")>();
  return {
    ...actual,
    learningSupportApi: { ...actual.learningSupportApi, holders: () => holders() },
  };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, list: async () => [] } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { SencoView } from "./SencoView";

const flag: AttentionFlag = {
  id: "f1",
  studentId: "s-1",
  flagType: "pacing",
  description: "Something worth a look",
  generatedAt: "2026-09-01T00:00:00Z",
  acknowledged: false,
};

const NOTE =
  "Marking a concern or a flag as seen, and starting a progress report, need Learning Support. Another administrator can give it to you on your record in Admin Team.";

beforeEach(() => {
  getFlags.mockResolvedValue([flag]);
  acknowledgeFlag.mockReset();
});

describe("marking a flag as seen, without Learning Support", () => {
  it("keeps the control, switched off, and says why", async () => {
    holders.mockResolvedValue({ holders: [], viewerHoldsIt: false });
    render(<SencoView />);
    expect(await screen.findByText(NOTE)).toBeInTheDocument();
    const mark = screen.getByRole("button", { name: "Mark as seen" });
    expect(mark).toBeDisabled();
    expect(mark).toHaveAccessibleDescription(NOTE);
  });

  it("learns it from the refusal when the holders read didn't answer", async () => {
    holders.mockReturnValue(new Promise(() => {}));
    acknowledgeFlag.mockRejectedValue(
      new ApiError(403, "Forbidden", {
        detail: { code: "learning_support_role_required", message: "…" },
      }),
    );
    render(<SencoView />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark as seen" }));
    expect(await screen.findByText(NOTE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as seen" })).toBeDisabled();
    // A refusal is not a write that failed.
    expect(screen.queryByText(/couldn.t record that as seen/i)).toBeNull();
  });

  it("is the ordinary control for a holder", async () => {
    holders.mockResolvedValue({ holders: [], viewerHoldsIt: true });
    render(<SencoView />);
    expect(await screen.findByRole("button", { name: "Mark as seen" })).toBeEnabled();
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});
