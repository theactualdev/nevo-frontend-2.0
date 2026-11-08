import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { ParentChild, ParentLearningEvidence } from "@/lib/api/parent";

const { myChildren, learningEvidence, search } = vi.hoisted(() => ({
  myChildren: vi.fn(),
  learningEvidence: vi.fn(),
  search: { value: "" },
}));

// Replaced wholesale - see ParentDataManagement.test.tsx for why importOriginal
// deadlocks the jsdom worker on the parent module.
vi.mock("@/lib/api/parent", () => ({ parentApi: { myChildren, learningEvidence } }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search.value),
}));

import { ParentChanges } from "./ParentChanges";

/**
 * D02b What Changed (design 1397ec4), reduced to what the server returns:
 * the concepts its own marking says this child has strengthened, each with
 * its day. No "since you last looked", no subject, no "new this week", no
 * "holding onto it" - the read carries none of them (raised, rule 10). No
 * number of any kind.
 */

const AMARA: ParentChild = {
  studentId: "s-1",
  firstName: "Amara",
  lastName: "Okafor",
  status: "active",
  schoolId: "sc-1",
  schoolName: "Corona Secondary School",
};
const TUNDE: ParentChild = { ...AMARA, studentId: "s-2", firstName: "Tunde" };

const evidence = (names: string[]): ParentLearningEvidence => ({
  studentId: "s-1",
  strengthenedConcepts: names.map((n, i) => ({
    conceptId: `c-${i}`,
    conceptName: n,
    recordedAt: `2026-11-0${i + 1}T10:00:00Z`,
    source: "server_marked_practice",
  })),
  scheduledReturns: [{ conceptId: "c-0", conceptName: names[0] ?? "x", dueAt: "2026-11-20T00:00:00Z" }],
  outOfSchoolLearning: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  search.value = "";
  myChildren.mockResolvedValue([AMARA, TUNDE]);
  learningEvidence.mockResolvedValue(evidence(["Equivalent fractions", "Photosynthesis"]));
});

describe("what a child has strengthened", () => {
  it("lists each strengthened concept with its day, under the frame's heading", async () => {
    const { container } = render(<ParentChanges />);
    expect(await screen.findByText("Equivalent fractions")).toBeInTheDocument();
    const text = visibleText(container);
    expect(text).toMatch(/What Amara ?'s strengthened/);
    expect(text).toMatch(/Corona Secondary School/);
    expect(text).toMatch(/Photosynthesis/);
    expect(text).toMatch(/1 November 2026/);
    expect(learningEvidence).toHaveBeenCalledWith("s-1");
  });

  it("says what each row means in Lydia's words (SCRUM-321): the child crossed the mark", async () => {
    render(<ParentChanges />);
    await screen.findByText("Equivalent fractions");
    expect(screen.getAllByText("Amara crossed the mark on this idea.")).toHaveLength(2);
  });

  it("claims nothing the server doesn't say - no 'since', subject, 'new this week' or 'holding onto it'", async () => {
    const { container } = render(<ParentChanges />);
    await screen.findByText("Equivalent fractions");
    const text = visibleText(container);
    expect(text).not.toMatch(/since you last looked|new this week|first met|holding onto|secure/i);
    expect(text).not.toMatch(/%|score|level/i);
    expect(text).not.toMatch(/\b(she|her|he|his)\b/i);
  });

  it("reads the child the home linked to", async () => {
    search.value = "child=s-2";
    const { container } = render(<ParentChanges />);
    await screen.findByText("Equivalent fractions");
    expect(learningEvidence).toHaveBeenCalledWith("s-2");
    expect(visibleText(container)).toMatch(/What Tunde ?'s strengthened/);
  });

  it("says nothing it can't know when nothing is strengthened yet", async () => {
    learningEvidence.mockResolvedValue(evidence([]));
    const { container } = render(<ParentChanges />);
    expect(await screen.findByText(/See all Amara.s subjects/)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
    // Lydia's one state for "starting out" and "nothing yet", which the read
    // can't tell apart (SCRUM-321) - a kept link or Back can land here empty.
    expect(screen.getByText("Nothing has strengthened here yet.")).toBeInTheDocument();
    expect(visibleText(container)).not.toMatch(/just getting started|nothing to compare/i);
  });

  it("says a failed read failed, and asks again on Try again", async () => {
    learningEvidence.mockRejectedValueOnce(new Error("down"));
    render(<ParentChanges />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Equivalent fractions")).toBeInTheDocument();
    expect(learningEvidence).toHaveBeenCalledTimes(2);
  });
});
