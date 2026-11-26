import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import { LEARNING_SUPPORT_REQUIRED } from "@/lib/api/learningSupport";
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
  // Mondays, as the server's date_trunc('week') writes them. The weeks
  // between 17 Aug and 14 Sep had no adaptation, so the server left them out.
  adaptationsPerWeek: [
    { weekStarting: "2026-08-10", count: 5 },
    { weekStarting: "2026-08-17", count: 4 },
    { weekStarting: "2026-09-14", count: 2 },
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

/** A Tuesday: the 12-week window runs from Monday 29 Jun to Monday 21 Sep. */
const NOW = Date.parse("2026-09-22T12:00:00Z");

beforeEach(() => {
  h.history.mockReset().mockResolvedValue(RESPONSE);
  // Only the clock is fixed; timers stay real for waitFor.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
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
    expect(screen.getByText(/in the week of 10 Aug/)).toBeInTheDocument();
    expect(
      weekBars(RESPONSE, NOW)
        .filter((b) => b.count !== null)
        .map((b) => [b.label, b.count, b.height]),
    ).toEqual([
      ["10 Aug", 5, 80],
      ["17 Aug", 4, 64],
      [expect.stringMatching(/^14 Sept?$/), 2, 32],
    ]);
  });

  it("gives each of the window's 13 weeks its own slot, and a quiet week an empty one", async () => {
    const { container } = render(<LearnerProfileView studentId="s1" />);
    const el = await section(container);
    const slots = [...el.querySelectorAll("li[data-week]")];

    // 12 weeks asked for are 13 calendar weeks, the first and last partial.
    expect(slots.map((s) => s.getAttribute("data-week"))).toEqual([
      "2026-06-29", "2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03",
      "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14",
      "2026-09-21",
    ]);
    // 17 Aug and 14 Sep are NOT neighbours: three quiet weeks sit between them.
    const at = (week: string) => slots.findIndex((s) => s.getAttribute("data-week") === week);
    expect(at("2026-09-14") - at("2026-08-17")).toBe(4);
    for (const quiet of ["2026-08-24", "2026-08-31", "2026-09-07"]) {
      const slot = slots[at(quiet)];
      // Its date, and nothing else: no bar, and no 0 we were never given.
      expect(slot.querySelector("[style]")).toBeNull();
      expect(slot.textContent).not.toMatch(/\d+\s*in the week|^0|\b0\b/);
      expect(slot.querySelector(".sr-only")).toBeNull();
    }
  });

  it("draws a 0 the server sends as a 0 (S15), and a week it leaves out as nothing", () => {
    const slots = weekBars(
      { ...RESPONSE, adaptationsPerWeek: [{ weekStarting: "2026-09-07", count: 0 }, ...RESPONSE.adaptationsPerWeek] },
      NOW,
    );
    const week = (key: string) => slots.find((s) => s.key === key);
    expect(week("2026-09-07")).toMatchObject({ count: 0, height: 0 });
    expect(week("2026-08-31")).toMatchObject({ count: null, height: 0 });
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
  it("says nothing started or stopped in the window when the record is empty", async () => {
    h.history.mockResolvedValue({ studentId: "s1", changes: [], adaptationsPerWeek: [], series: [] });
    const { container } = render(<LearnerProfileView studentId="s1" />);
    const el = await section(container);

    expect(visibleText(el)).toMatch(
      /Nevo hasn.t started or stopped any support for Amara in the last 12 weeks\./,
    );
    expect(visibleText(el)).not.toMatch(/Adaptations per week/);
  });

  it("says the same under a chart of adaptations, which that line does not contradict", async () => {
    h.history.mockResolvedValue({ ...RESPONSE, changes: [] });
    const { container } = render(<LearnerProfileView studentId="s1" />);
    const el = await section(container);

    expect(visibleText(el)).toMatch(/Adaptations per week/);
    expect(visibleText(el)).toMatch(/hasn.t started or stopped any support for Amara/);
    expect(visibleText(el)).not.toMatch(/No change/);
  });

  it("never says nothing changed when every change it was sent is one it has no words for", async () => {
    h.history.mockResolvedValue({
      ...RESPONSE,
      changes: [{ accommodation: "sensory", action: "added", occurredAt: "2026-09-01T10:00:00Z" }],
    });
    const { container } = render(<LearnerProfileView studentId="s1" />);
    const el = await section(container);

    expect(visibleText(el)).not.toMatch(/hasn.t started or stopped/);
    expect(visibleText(el)).not.toMatch(/sensory/);
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
    // The code the backend sends (api/learning_support.py), as the client holds it.
    h.history.mockRejectedValue(
      new ApiError(403, "Forbidden", { detail: { code: LEARNING_SUPPORT_REQUIRED } }),
    );
    const { container } = render(<LearnerProfileView studentId="s1" />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/You don.t have access to Amara\s?.s record of changes/),
    );
    // Any 403 says the line above; only this refusal names the way to it.
    expect(visibleText(container)).toMatch(/It needs Learning Support/);
    expect(visibleText(container)).not.toMatch(/couldn.t read Amara\s?.s record of changes/);
  });
});
