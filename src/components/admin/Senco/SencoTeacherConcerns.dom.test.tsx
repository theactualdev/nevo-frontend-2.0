import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { Escalation } from "@/lib/api/escalations";
import type { AttentionFlag } from "@/lib/api/intelligence";

/**
 * D8's "Escalated by a teacher", above Nevo's flags - held only by counsel
 * until Olayinka deferred them on 12 Oct.
 */

const { allOpen, acknowledge, getFlags, holders } = vi.hoisted(() => ({
  allOpen: vi.fn(),
  acknowledge: vi.fn(),
  getFlags: vi.fn(),
  holders: vi.fn(),
}));

vi.mock("@/lib/api/escalations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/escalations")>();
  return {
    ...actual,
    escalationsApi: {
      ...actual.escalationsApi,
      allOpen: () => allOpen(),
      acknowledge: (id: string) => acknowledge(id),
    },
  };
});
vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: {
      ...actual.intelligenceApi,
      allFlags: async () => ({ flags: await getFlags(), complete: true }),
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
vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return {
    ...actual,
    teachersApi: {
      ...actual.teachersApi,
      list: async () => [{ id: "t-bello", name: "Mr. Bello", email: null, status: "active" }],
    },
  };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      list: async () => [
        {
          id: "s-chidera",
          name: "Chidera Nwosu",
          loginIdentifier: "chidera",
          status: "active",
          ageBand: "11-14",
          consent: { status: "confirmed", actorId: null, actorName: null, timestamp: null, channel: null },
        },
      ],
    },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { SencoView } from "./SencoView";

const concern = (id: string, over: Partial<Escalation> = {}): Escalation => ({
  id,
  studentId: "s-chidera",
  studentFirstName: "Chidera",
  teacherId: "t-bello",
  note: "She's been quiet in written work and mentioned finding the reading heavy.",
  recentPicture: "",
  generatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  acknowledged: false,
  ...over,
});
const flag: AttentionFlag = {
  id: "f1",
  studentId: "s-chidera",
  flagType: "pacing",
  description: "Taking longer to settle into lessons this week",
  generatedAt: "2026-09-01T00:00:00Z",
  acknowledged: false,
};
const EMPTY = /Nothing needs your attention right now/;

beforeEach(() => {
  // The server filters to open ones (`openOnly=true`, 14 Oct).
  allOpen.mockReset().mockResolvedValue({ open: [concern("e1")], complete: true });
  acknowledge.mockReset();
  getFlags.mockResolvedValue([flag]);
  holders.mockResolvedValue({ holders: [], viewerHoldsIt: true });
});

describe("Escalated by a teacher", () => {
  it("shows each open concern above Nevo's flags, in the teacher's words", async () => {
    const { container } = render(<SencoView />);
    const section = await screen.findByRole("region", { name: "Escalated by a teacher" });
    expect(within(section).getByText("Chidera Nwosu")).toBeInTheDocument();
    expect(within(section).getByText(/escalated by Mr\. Bello · 2 days ago/)).toBeInTheDocument();
    expect(within(section).getByText(/“She's been quiet in written work/)).toBeInTheDocument();
    // One open; the seen one is not here.
    expect(within(section).getAllByRole("article")).toHaveLength(1);
    expect(within(section).getByText("1")).toBeInTheDocument();

    const text = visibleText(container);
    expect(text.indexOf("Escalated by a teacher")).toBeLessThan(text.indexOf("Flagged by Nevo"));
  });

  it("starts a progress report for that child, and comes back here", async () => {
    render(<SencoView />);
    const start = await screen.findByRole("link", { name: /Start a progress report/ });
    const url = new URL(start.getAttribute("href")!, "http://x");
    expect(url.pathname).toBe("/admin/senco/export");
    expect(url.searchParams.get("student")).toBe("s-chidera");
    expect(url.searchParams.get("back")).toBe("/admin/senco");
  });

  it("leaves once marked as seen and the server agrees", async () => {
    acknowledge.mockResolvedValue(concern("e1", { acknowledged: true }));
    render(<SencoView />);
    const section = await screen.findByRole("region", { name: "Escalated by a teacher" });
    fireEvent.click(within(section).getByRole("button", { name: "Mark as seen" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Escalated by a teacher" })).toBeNull());
    expect(acknowledge).toHaveBeenCalledWith("e1");
  });

  it("says so when the concerns can't be read, and never says nothing is waiting", async () => {
    allOpen.mockRejectedValue(new Error("down"));
    getFlags.mockResolvedValue([]);
    const { container } = render(<SencoView />);
    expect(await screen.findByText(/couldn.t read teachers.? concerns just now/)).toBeInTheDocument();
    expect(visibleText(container)).not.toMatch(EMPTY);
  });

  it("gives no count and no all-clear when the pages ran out before the end", async () => {
    allOpen.mockResolvedValue({ open: [], complete: false });
    getFlags.mockResolvedValue([]);
    const { container } = render(<SencoView />);
    await waitFor(() => expect(allOpen).toHaveBeenCalled());
    // Give every read time to land: the all-clear, if it were coming, would.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(visibleText(container)).not.toMatch(EMPTY);
  });

  it("says nothing is waiting only when both reads came back empty", async () => {
    allOpen.mockResolvedValue({ open: [], complete: true });
    getFlags.mockResolvedValue([]);
    render(<SencoView />);
    expect(await screen.findByText(EMPTY)).toBeInTheDocument();
    expect(screen.getByText(/When a teacher escalates a student, or Nevo notices a pattern/)).toBeInTheDocument();
  });

  it("switches its controls off without Learning Support, beside the one line saying why", async () => {
    holders.mockResolvedValue({ holders: [], viewerHoldsIt: false });
    render(<SencoView />);
    const section = await screen.findByRole("region", { name: "Escalated by a teacher" });
    await waitFor(() =>
      expect(within(section).getByRole("button", { name: "Start a progress report" })).toBeDisabled(),
    );
    expect(within(section).getByRole("button", { name: "Mark as seen" })).toBeDisabled();
    expect(
      screen.getByText(/Marking a concern or a flag as seen, and starting a progress report, need Learning Support/),
    ).toBeInTheDocument();
  });

  it("learns the role is missing from a refused acknowledgement", async () => {
    acknowledge.mockRejectedValue(
      new ApiError(403, "Forbidden", { detail: { code: "learning_support_role_required", message: "…" } }),
    );
    holders.mockReturnValue(new Promise(() => {}));
    render(<SencoView />);
    const section = await screen.findByRole("region", { name: "Escalated by a teacher" });
    fireEvent.click(within(section).getByRole("button", { name: "Mark as seen" }));
    await waitFor(() =>
      expect(within(section).getByRole("button", { name: "Mark as seen" })).toBeDisabled(),
    );
    expect(screen.queryByText(/couldn.t record that as seen/i)).toBeNull();
  });
});
