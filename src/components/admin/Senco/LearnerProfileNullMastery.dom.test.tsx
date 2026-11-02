import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { LearnerProfileView } from "./LearnerProfileView";

/**
 * SCRUM-200 (Lydia, 28 Oct): a mastery estimate the server sends as null is
 * no estimate, never a zero. An empty bar reads as zero - "a claim we have
 * not earned" - so a track with no estimate says "Not enough yet to show
 * this." instead, and a track that has one keeps its bar.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
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
      adaptations: async () => [],
      mastery: async () => [
        {
          studentId: "s1",
          conceptId: "c1",
          conceptName: "Fractions",
          masteryProbabilityConcept: 0.6,
          masteryProbabilityReading: 0.4,
          attentionWeights: {},
          practiceCount: 12,
        },
        {
          studentId: "s1",
          conceptId: "c2",
          conceptName: "Ratios",
          // The concept track has no estimate yet; the reading track has one.
          masteryProbabilityConcept: null,
          masteryProbabilityReading: 0.3,
          attentionWeights: {},
          practiceCount: 1,
        },
      ],
    },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return { ...actual, classesApi: { ...actual.classesApi, list: async () => [] } };
});

/** A concept's row, from its name. */
const row = (name: string) => screen.getByText(name).closest("div.px-6") as HTMLElement;
const bars = (el: HTMLElement) => el.querySelectorAll('[style*="width"]');

describe("a concept the engine has no estimate for yet (SCRUM-200)", () => {
  it("says so in words on that track, never an empty bar, and keeps the other track's bar", async () => {
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Ratios/));
    const ratios = row("Ratios");
    expect(visibleText(ratios)).toMatch(/Understands the idea Not enough yet to show this\./);
    // One bar left: the reading track's - and none at 0%.
    expect(bars(ratios)).toHaveLength(1);
    expect((bars(ratios)[0] as HTMLElement).style.width).toBe("30%");
  });

  it("draws both bars where both estimates exist, and says nothing about 'not enough'", async () => {
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Fractions/));
    const fractions = row("Fractions");
    expect(bars(fractions)).toHaveLength(2);
    expect(visibleText(fractions)).not.toMatch(/Not enough yet/);
  });
});
