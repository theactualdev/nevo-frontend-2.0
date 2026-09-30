import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { OutcomePeriod, SchoolHealth, SchoolConceptMastery } from "@/lib/api/analytics";
import { ReportsView } from "./ReportsView";

/**
 * Two rules this screen broke, and one it still keeps.
 *
 * KEPT: a failed outcomes read is not a school with no lessons. The trend card
 * branched on the array alone, so a 500 told a school that had taught all year
 * that it had not taught enough. Fixed in #269; pinned here.
 *
 * BROKEN UNTIL 30 SEP (architecture rule 3 - compute no thresholds):
 * - "enough for a trend" was a client count of three periods, so a school's
 *   first two periods were hidden behind "not enough lessons yet".
 * - concepts were ranked by a gap the console computed, and labelled "Reading
 *   is the barrier" above a 0.15 threshold it invented. The school mastery read
 *   carries no attribution; the screen now reports the two tracks and no
 *   verdict.
 */

const outcomes = vi.fn();
const mastery = vi.fn();
vi.mock("@/lib/api/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/analytics")>();
  return {
    ...actual,
    analyticsApi: {
      ...actual.analyticsApi,
      getSchoolHealth: async (): Promise<SchoolHealth> => ({
        schoolId: "sch1",
        studentCount: 240,
        activeStudentsLast30Days: 180,
        completedLessonSessions: 4200,
        participationRate: 0.75,
      }),
      getOutcomes: () => outcomes(),
      getSchoolMastery: () => mastery(),
      getTransformationMetrics: async () => null,
    },
  };
});

const period = (day: number, rate: number): OutcomePeriod => ({
  period: `2026-08-0${day}`,
  sessions: 100,
  completedSessions: Math.round(100 * rate),
  completionRate: rate,
  averageAdaptations: 2.4,
});

const concept = (i: number, c: number, r: number): SchoolConceptMastery => ({
  conceptId: `c${i}`,
  conceptName: `Concept ${i}`,
  studentCount: 30,
  masteryProbabilityConcept: c,
  masteryProbabilityReading: r,
});

describe("ReportsView outcomes trend", () => {
  it("does not blame the school for lessons when the read failed", async () => {
    mastery.mockResolvedValue([]);
    outcomes.mockRejectedValue(new Error("500"));

    const { container } = render(<ReportsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/couldn't read/i));

    expect(visibleText(container)).toMatch(/lesson outcomes/i);
    expect(visibleText(container)).not.toMatch(/Still gathering/i);
  });

  it("draws a school's first period instead of hiding it behind a count", async () => {
    mastery.mockResolvedValue([]);
    outcomes.mockResolvedValue({ schoolId: "sch1", outcomes: [period(1, 0.4)] });

    const { container } = render(<ReportsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/How often Nevo adapted/i));
    expect(visibleText(container)).not.toMatch(/enough lessons yet|with confidence/i);
  });

  it("says it is still gathering only when there is nothing at all", async () => {
    mastery.mockResolvedValue([]);
    outcomes.mockResolvedValue({ schoolId: "sch1", outcomes: [] });

    const { container } = render(<ReportsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Still gathering/i));
    expect(visibleText(container)).toMatch(/No lessons have finished yet/);
    expect(visibleText(container)).not.toMatch(/couldn't read/i);
  });
});

describe("ReportsView concepts", () => {
  it("names no barrier - the data reports two tracks, not a verdict", async () => {
    outcomes.mockResolvedValue({ schoolId: "sch1", outcomes: [period(1, 0.4)] });
    // A 0.5 gap: well past the old invented 0.15 line.
    mastery.mockResolvedValue([concept(1, 0.9, 0.4)]);

    const { container } = render(<ReportsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Concept 1/));
    expect(visibleText(container)).not.toMatch(/barrier|getting in the way/i);
  });

  it("keeps the server's order rather than ranking by a gap it computed", async () => {
    outcomes.mockResolvedValue({ schoolId: "sch1", outcomes: [period(1, 0.4)] });
    // The widest gap is last. A ranking would have put it first.
    mastery.mockResolvedValue([concept(1, 0.5, 0.5), concept(2, 0.6, 0.55), concept(3, 0.95, 0.2)]);

    const { container } = render(<ReportsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Concept 3/));
    const text = visibleText(container);
    expect(text.indexOf("Concept 1")).toBeLessThan(text.indexOf("Concept 3"));
  });

  it("caps what it shows, and says how many there are, never dropping them silently", async () => {
    outcomes.mockResolvedValue({ schoolId: "sch1", outcomes: [period(1, 0.4)] });
    mastery.mockResolvedValue(Array.from({ length: 11 }, (_, i) => concept(i + 1, 0.5, 0.5)));

    const { container } = render(<ReportsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Concept 8\b/));
    expect(visibleText(container)).not.toMatch(/Concept 9\b/);

    fireEvent.click(screen.getByRole("button", { name: "Show all 11 concepts" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/Concept 11\b/));
  });
});
