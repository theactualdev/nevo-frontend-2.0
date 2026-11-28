import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { LearnerMastery } from "@/lib/api/students";
import { LearnerProfileView } from "./LearnerProfileView";

/**
 * D08b's concept mastery, BY LEVEL (the "Nevo Mastery By Level" design; S21's
 * read, live 27 Nov), drawn by the same component as the teacher's profile,
 * to the hub's five answers (28 Nov):
 *  1. only the levels with an entry, in curriculum order; none at all is
 *     "Nothing recorded at any level yet.";
 *  2. a value this client doesn't know is the same as no entry;
 *  3. no stale lead line, and no "· dual-track";
 *  4. a failed read says so; a 403 or 404 leaves the section out, silently;
 *  5. reading beside the levels, "none" draws no row; no flag, no number.
 */

const masteryByLevel = vi.fn<(id: string) => Promise<LearnerMastery>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    conversationEvidenceApi: {
      forStudent: async () => ({
        studentId: "s1",
        periodDays: 14,
        interactionCount: 0,
        categories: {},
        privacy: "withheld_below_minimum",
        minimumInteractions: 3,
      }),
    },
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
      masteryByLevel: (id: string) => masteryByLevel(id),
    },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return { ...actual, classesApi: { ...actual.classesApi, list: async () => [], classStudents: async () => [] } };
});

const concepts = (...c: LearnerMastery["concepts"]): LearnerMastery => ({ studentId: "s1", concepts: c });

/** The concept block for this name: its own words only. */
const block = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll("[data-concept]")].find((el) => el.textContent?.includes(name)) as HTMLElement;

beforeEach(() => {
  masteryByLevel.mockReset();
});

describe("D08b's concept mastery, by level", () => {
  it("draws each observed level in the frame's words and curriculum order, and leaves an unobserved one out", async () => {
    masteryByLevel.mockResolvedValue(
      concepts({
        conceptId: "c1",
        conceptName: "Fractions",
        levels: { application: "working", knowing_and_understanding: "reached" },
        reading: "at",
      }),
    );
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() => expect(block(container, "Fractions")).toBeTruthy());
    expect(masteryByLevel).toHaveBeenCalledWith("s1");
    expect(visibleText(block(container, "Fractions"))).toBe(
      "Fractions Knowing and understanding Reached Application Working at it Reading level At level",
    );
    // Analysis and evaluation has no entry: not drawn, and never "Not arrived yet".
    expect(visibleText(container)).not.toMatch(/Analysis and evaluation|Not arrived yet/);
  });

  it("says Not arrived yet only for `not`, and treats a value it doesn't know as no entry", async () => {
    masteryByLevel.mockResolvedValue(
      concepts({
        conceptId: "c1",
        conceptName: "Ratios",
        levels: { knowing_and_understanding: "not", application: "mastered" as never },
      }),
    );
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() => expect(block(container, "Ratios")).toBeTruthy());
    expect(visibleText(block(container, "Ratios"))).toBe("Ratios Knowing and understanding Not arrived yet");
  });

  it("says the frame's sentence when nothing is recorded at any level, with reading beside it", async () => {
    masteryByLevel.mockResolvedValue(
      concepts(
        { conceptId: "c1", conceptName: "Algebra", levels: {}, reading: "support" },
        { conceptId: "c2", conceptName: "Decimals", levels: {}, reading: "none" },
      ),
    );
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() => expect(block(container, "Algebra")).toBeTruthy());
    expect(visibleText(block(container, "Algebra"))).toBe(
      "Algebra Nothing recorded at any level yet. Reading level Support needed",
    );
    // Reading "none": no reading row at all.
    expect(visibleText(block(container, "Decimals"))).toBe("Decimals Nothing recorded at any level yet.");
  });

  it("has no dual-track label, no stale two-tracks line, and no number anywhere in it", async () => {
    masteryByLevel.mockResolvedValue(
      concepts({ conceptId: "c1", conceptName: "Fractions", levels: { knowing_and_understanding: "reached" } }),
    );
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await screen.findByText("Concept mastery");
    expect(visibleText(container)).not.toMatch(/dual-track|Two tracks per concept|part company/i);
    expect(visibleText(block(container, "Fractions"))).not.toMatch(/\d/);
  });
});

describe("a learner with no concepts yet", () => {
  // As C08 draws it (Hub, 28 Nov): no section at all - and not the old "No
  // concepts have enough practice behind them yet.", which was in neither
  // frame and described the bars' probability threshold.
  it("draws no Concept mastery section, and no line about practice", async () => {
    masteryByLevel.mockResolvedValue(concepts());
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() => expect(masteryByLevel).toHaveBeenCalled());
    await screen.findByText("Current accommodations");
    await waitFor(() => expect(screen.queryByText("Concept mastery")).toBeNull());
    expect(visibleText(container)).not.toMatch(/enough practice/);
  });
});

describe("when the mastery read doesn't answer", () => {
  it("says a failed read failed, with the profile's own line and a retry", async () => {
    masteryByLevel.mockRejectedValue(new ApiError(500, "Server error"));
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await screen.findByText("Concept mastery");
    await waitFor(() => expect(visibleText(container)).toMatch(/concept record/));
    expect(container.querySelector("[data-concept]")).toBeNull();
  });

  it.each([
    ["a refusal (403)", new ApiError(403, "Forbidden", { detail: { code: "staff_role_required" } })],
    ["a child out of reach (404)", new ApiError(404, "Not found")],
  ])("leaves the section out for %s, with no line", async (_, err) => {
    masteryByLevel.mockRejectedValue(err);
    const { container } = render(<LearnerProfileView studentId="s1" />);
    await waitFor(() => expect(masteryByLevel).toHaveBeenCalled());
    await screen.findByText(/Help-seeking|Current accommodations/);
    expect(screen.queryByText("Concept mastery")).toBeNull();
    expect(visibleText(container)).not.toMatch(/concept record/);
  });
});
