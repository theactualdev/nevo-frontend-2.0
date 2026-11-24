import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import { LearnerProfileView } from "./LearnerProfileView";
import { changeRows, weekBars } from "./useAccommodationHistory";

/**
 * D08b's "What changed, and when" (admin backlog 42): a dated list of what
 * Nevo started and stopped doing, and the raw adaptations per week - never
 * the engine's series about the child, which the same response carries.
 */

const h = vi.hoisted(() => ({ history: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/senco/s1",
}));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      get: async () => ({
        id: "s1",
        firstName: "Amara",
        lastName: "Okafor",
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
      adaptations: async () => [],
    },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: { ...actual.classesApi, list: async () => [], classStudents: async () => [] },
  };
});
vi.mock("@/lib/api/accommodationHistory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/accommodationHistory")>();
  return {
    ...actual,
    accommodationHistoryApi: { forStudent: (id: string, weeks?: number) => h.history(id, weeks) },
  };
});

/** As the live route sends it - series and all. */
const RESPONSE = {
  studentId: "s1",
  changes: [
    {
      accommodation: "attention" as const,
      action: "removed" as const,
      promptedBy: "pattern_no_longer_seen",
      observedOverLessons: 4,
      occurredAt: "2026-09-18T10:00:00Z",
    },
    {
      accommodation: "reading" as const,
      action: "added" as const,
      promptedBy: "reading_accommodation_active",
      observedOverLessons: 3,
      occurredAt: "2026-09-04T10:00:00Z",
    },
  ],
  adaptationsPerWeek: [
    { weekStarting: "2026-08-11", count: 5 },
    { weekStarting: "2026-08-18", count: 4 },
    { weekStarting: "2026-09-15", count: 2 },
  ],
  series: [
    {
      dimension: "cognitiveLoadThreshold",
      points: [{ recordedAt: "2026-09-04T10:00:00Z", value: "0.62", confidence: "high" }],
    },
    {
      dimension: "processingSpeed",
      points: [{ recordedAt: "2026-09-04T10:00:00Z", value: "slow", confidence: "medium" }],
    },
  ],
};

const section = async (container: HTMLElement) => {
  await screen.findByText("What changed, and when");
  await waitFor(() => expect(container.querySelector("[data-what-changed]:not([aria-busy])")).not.toBeNull());
  return container.querySelector("[data-what-changed]") as HTMLElement;
};

beforeEach(() => {
  h.history.mockReset().mockResolvedValue(RESPONSE);
});

describe("what changed, and when", () => {
  it("lists what Nevo started and stopped, oldest first, in sentences about Nevo", async () => {
    const { container } = render(<LearnerProfileView studentId="s1" />);
    const el = await section(container);
    const text = visibleText(el);

    // en-GB writes September "Sept", as the rest of this page does.
    expect(text).toMatch(
      /4 Sept? Started: Nevo keeps the reading level of each step within reach\. 18 Sept? Stopped: Nevo breaks work into shorter stretches, with more pauses\./,
    );
    expect(h.history).toHaveBeenCalledWith("s1", undefined);
  });

  it("draws the raw adaptations per week, each labelled with its Monday", async () => {
    const { container } = render(<LearnerProfileView studentId="s1" />);
    const el = await section(container);

    expect(visibleText(el)).toMatch(/Adaptations per week/);
    expect(screen.getByText(/in the week of 11 Aug/)).toBeInTheDocument();
    expect(weekBars(RESPONSE).map((b) => [b.label, b.count, b.height])).toEqual([
      ["11 Aug", 5, 80],
      ["18 Aug", 4, 64],
      [expect.stringMatching(/^15 Sept?$/), 2, 32],
    ]);
  });

  it("never renders the engine's series, its codes or its lesson counts", async () => {
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await section(container);
    const text = visibleText(container);

    for (const never of [
      /cognitive/i,
      /processing/i,
      /threshold/i,
      /confidence/i,
      /0\.62/,
      /\bslow\b/,
      /pattern_no_longer_seen/,
      /accommodation_active/,
      /over \d+ lessons/,
    ]) {
      expect(text).not.toMatch(never);
    }
  });

  it("never claims to say what prompted each change", async () => {
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await section(container);

    expect(visibleText(container)).toMatch(
      /A dated record of what Nevo did for Amara\. Not a rising line: a list of changes\./,
    );
    expect(visibleText(container)).not.toMatch(/prompted/);
  });

  it("leaves out a change it has no words for, never showing the raw value", () => {
    const rows = changeRows({
      ...RESPONSE,
      changes: [{ accommodation: "sensory" as never, action: "added", occurredAt: "2026-09-01T10:00:00Z" }],
    });
    expect(rows).toEqual([]);
  });
});

describe("the nothing and the failures", () => {
  it("says nothing changed in the window when the record is empty", async () => {
    h.history.mockResolvedValue({ studentId: "s1", changes: [], adaptationsPerWeek: [], series: [] });
    const { container } = render(<LearnerProfileView studentId="s1" />);
    const el = await section(container);

    expect(visibleText(el)).toMatch(/No change to what Nevo does for Amara in the last 12 weeks\./);
    expect(visibleText(el)).not.toMatch(/Adaptations per week/);
  });

  it("says a lost read is lost, and reads again on Try again", async () => {
    h.history.mockRejectedValueOnce(new ApiError(500, "down"));
    const { container } = render(<LearnerProfileView studentId="s1" />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn.t read Amara\s?.s record of changes/),
    );
    const tries = screen.getAllByRole("button", { name: "Try again" });
    fireEvent.click(tries[tries.length - 1]);

    await waitFor(() => expect(visibleText(container)).toMatch(/Started: Nevo keeps the reading level/));
    expect(h.history).toHaveBeenCalledTimes(2);
  });

  it("names Learning Support when the route is refused for want of it", async () => {
    h.history.mockRejectedValue(
      new ApiError(403, "Forbidden", { detail: { code: "learning_support_required" } }),
    );
    const { container } = render(<LearnerProfileView studentId="s1" />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/You don.t have access to Amara\s?.s record of changes/),
    );
    expect(visibleText(container)).not.toMatch(/couldn.t read Amara\s?.s record of changes/);
  });
});
