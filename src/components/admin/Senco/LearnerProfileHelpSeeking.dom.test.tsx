import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import { LearnerProfileView } from "./LearnerProfileView";

/**
 * Backlog 41, D08b's HELP-SEEKING: the ratified aggregate line (30 Aug;
 * design's words 31 Aug) with the child's name in front - how often, never
 * what - and nothing at all below the server's own minimum.
 */

const evidence = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    conversationEvidenceApi: { forStudent: (id: string, days?: number) => evidence(id, days) },
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
      mastery: async () => [],
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

const ev = (over: object = {}) => ({
  studentId: "s1",
  periodDays: 14,
  interactionCount: 14,
  categories: { lesson_help: 9, concept_question: 5 },
  categoryLabels: { lesson_help: "Lesson help", concept_question: "Questions about an idea" },
  helpfulResponseRate: 0.8,
  privacy: "aggregate_only",
  minimumInteractions: 3,
  ...over,
});

// A block, not an arrow's value: a function returned from beforeEach is run as
// its teardown, so returning the mock would call it - and a rejecting mock
// called there has nobody to catch it.
beforeEach(() => {
  evidence.mockReset();
});

describe("Help-seeking on a learner's profile (D08b)", () => {
  it("says how often over the fortnight and mostly about what, in the ratified words - never what was asked", async () => {
    evidence.mockResolvedValue(ev());
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /Amara asked Nevo for help 14 times this fortnight, mostly about lesson help\./,
      ),
    );
    expect(evidence).toHaveBeenCalledWith("s1", 14);
    expect(visibleText(container)).toMatch(/What Amara and Nevo said to each other is never shown here\./);
    // No per-topic counts: the server floors no topic, so none are listed.
    expect(visibleText(container)).not.toMatch(/\b9\b|\b5\b/);
    expect(visibleText(container)).not.toMatch(/helpful/i);
  });

  it("draws nothing at all when the server withholds it below its minimum", async () => {
    evidence.mockResolvedValue(ev({ privacy: "withheld_below_minimum", interactionCount: 0, categories: {} }));
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() => expect(evidence).toHaveBeenCalled());
    await waitFor(() => expect(visibleText(container)).toMatch(/What Nevo has noticed/i));
    expect(container.querySelector("[data-help-seeking]")).toBeNull();
    expect(visibleText(container)).not.toMatch(/Help-seeking|asked Nevo for help/i);
  });

  it("says a failed read is unknown, not an empty record", async () => {
    evidence.mockRejectedValue(new Error("500"));
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() =>
      // `visibleText` keeps the gap between the name's and the "'s" text nodes.
      expect(visibleText(container)).toMatch(/couldn.t read Amara ?.s help-seeking just now/),
    );
  });

  it("names a refusal as access, with no Try again", async () => {
    evidence.mockRejectedValue(new ApiError(403, "Forbidden"));
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/You don.t have access to Amara ?.s help-seeking/));
    expect(visibleText(container)).not.toMatch(/couldn.t read Amara ?.s help-seeking/);
  });
});
