import { act, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { visibleText } from "@/test/visibleText";
import type { Escalation } from "@/lib/api/escalations";
import type { AttentionFlag } from "@/lib/api/intelligence";

/**
 * Learning Support gap 1 (Hub, 26 Nov): "Nothing needs your attention" over a
 * list the server narrowed.
 *
 * For a viewer WITHOUT Learning Support the server returns less than the
 * school's lists, and neither response says so (backend 608b880): flags narrow
 * to the classes they teach when they also teach, and teachers' concerns to
 * the ones sent to them or about their own classes. The all-clear and the
 * totals are claims about the school, so they are made only to a holder.
 */

const { allOpen, getFlags, holders } = vi.hoisted(() => ({
  allOpen: vi.fn(),
  getFlags: vi.fn(),
  holders: vi.fn(),
}));

vi.mock("@/lib/api/escalations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/escalations")>();
  return {
    ...actual,
    escalationsApi: { ...actual.escalationsApi, allOpen: () => allOpen() },
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
    studentsApi: { ...actual.studentsApi, list: async () => [] },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { SencoView } from "./SencoView";

const EMPTY = /Nothing needs your attention right now/;
const NEEDS_ROLE = /need Learning Support/;

const flag = (id: string): AttentionFlag => ({
  id,
  studentId: `s-${id}`,
  flagType: "pacing",
  description: `Taking longer to settle (${id})`,
  generatedAt: "2026-09-01T00:00:00Z",
  acknowledged: false,
});
const concern = (id: string): Escalation => ({
  id,
  studentId: "s-chidera",
  studentFirstName: "Chidera",
  teacherId: "t-bello",
  note: "Quiet in written work.",
  recentPicture: "",
  generatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  acknowledged: false,
});

/** Long enough for every read to land: the all-clear, if it were coming, would. */
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

beforeEach(() => {
  allOpen.mockReset().mockResolvedValue({ open: [], complete: true });
  getFlags.mockReset().mockResolvedValue([]);
  holders.mockReset().mockResolvedValue({ holders: [], viewerHoldsIt: true });
});

describe("the all-clear", () => {
  it("is said to a holder, whose lists the server does not narrow", async () => {
    render(<SencoView />);
    expect(await screen.findByText(EMPTY)).toBeInTheDocument();
  });

  it("is not said to a viewer without Learning Support, whose lists it may narrow", async () => {
    holders.mockResolvedValue({ holders: [], viewerHoldsIt: false });
    const { container } = render(<SencoView />);

    // The role has landed: the one line saying what it gates is drawn.
    await waitFor(() => expect(visibleText(container)).toMatch(NEEDS_ROLE));
    await settle();
    expect(visibleText(container)).not.toMatch(EMPTY);
  });

  it("is not said while the role isn't known", async () => {
    holders.mockReturnValue(new Promise(() => {}));
    const { container } = render(<SencoView />);

    await waitFor(() => expect(allOpen).toHaveBeenCalled());
    await settle();
    expect(visibleText(container)).not.toMatch(EMPTY);
  });
});

describe("the totals", () => {
  it("counts a holder's flags as a total", async () => {
    getFlags.mockResolvedValue([flag("a"), flag("b")]);
    const { container } = render(<SencoView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/\b2 to look at/));
    expect(visibleText(container)).not.toMatch(/At least/);
  });

  it("counts a narrowed flag list as a floor", async () => {
    holders.mockResolvedValue({ holders: [], viewerHoldsIt: false });
    getFlags.mockResolvedValue([flag("a"), flag("b")]);
    const { container } = render(<SencoView />);

    await waitFor(() => expect(visibleText(container)).toMatch(NEEDS_ROLE));
    await waitFor(() => expect(visibleText(container)).toMatch(/At least 2 to look at/));
  });

  it("gives no concern total to a viewer without Learning Support", async () => {
    holders.mockResolvedValue({ holders: [], viewerHoldsIt: false });
    allOpen.mockResolvedValue({ open: [concern("e1")], complete: true });
    const { container } = render(<SencoView />);

    const section = await screen.findByRole("region", { name: "Escalated by a teacher" });
    await waitFor(() => expect(visibleText(container)).toMatch(NEEDS_ROLE));
    expect(within(section).getAllByRole("article")).toHaveLength(1);
    expect(within(section).queryByText("1")).toBeNull();
  });
});
