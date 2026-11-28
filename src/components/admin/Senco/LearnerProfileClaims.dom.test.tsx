import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { LearnerProfileView } from "./LearnerProfileView";

// The profile's "What changed, and when" read (backlog 42), answered empty
// so this file never reaches the network for it.
vi.mock("@/lib/api/accommodationHistory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/accommodationHistory")>()),
  accommodationHistoryApi: {
    forStudent: async () => ({ studentId: "s1", changes: [], adaptationsPerWeek: [] }),
  },
}));

/**
 * Architecture rule 3: the frontend computes no thresholds. The learner
 * profile used to say "Reading is the barrier here" about a named child
 * whenever its two bars differed by more than 0.15 - a cut-off this screen
 * made up, turned into a statement the engine never made.
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
      // Knowing reached, reading needing support: the gap the old label fired on.
      masteryByLevel: async () => ({
        studentId: "s1",
        concepts: [
          {
            conceptId: "c1",
            conceptName: "Fractions",
            levels: { knowing_and_understanding: "reached" },
            reading: "support",
          },
        ],
      }),
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

describe("the learner profile's concept rows", () => {
  it("state no diagnosis of their own, however far apart the level and the reading are", async () => {
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Fractions/));
    // The per-concept verdict about this child went with the bars; By Level
    // draws only the engine's states, in the frame's words.
    expect(visibleText(container)).not.toMatch(/Reading is the barrier here/);
    expect(visibleText(container)).not.toMatch(/\d+\s*%/);
  });
});
