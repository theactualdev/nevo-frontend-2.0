import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ParentChild } from "@/lib/api/parent";

const { myChildren, subjectProgress, getSession, learningEvidence } = vi.hoisted(() => ({
  myChildren: vi.fn(),
  subjectProgress: vi.fn(),
  getSession: vi.fn(),
  learningEvidence: vi.fn(),
}));

// Replaced wholesale - see ParentDataManagement.test.tsx for why importOriginal
// deadlocks the jsdom worker here.
vi.mock("@/lib/api/parent", () => ({
  parentApi: { myChildren, subjectProgress, learningEvidence },
}));
vi.mock("@/lib/auth/session", () => ({ getSession }));

import { ParentHome } from "./ParentHome";

/**
 * D02b's way in. No frame draws one, so it is the screen's own heading as a
 * line on the home - and only when the server has strengthened something for
 * this child. Nothing to show, or a read that failed: no line (rule 5).
 */

const CHILD: ParentChild = {
  studentId: "s-1",
  firstName: "Amara",
  lastName: "Okafor",
  status: "active",
  schoolId: "sc-1",
  schoolName: "Brightgate Academy",
};

const empty = { studentId: "s-1", strengthenedConcepts: [], scheduledReturns: [], outOfSchoolLearning: [] };

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockReturnValue({ token: "t", expiresAt: "2026-12-01T00:00:00Z", userId: "p-1", role: "parent_guardian" });
  myChildren.mockResolvedValue([CHILD]);
  subjectProgress.mockResolvedValue({
    studentId: "s-1",
    window: { startsOn: "2026-10-05", endsOn: "2026-10-11", state: "in_term", inProgress: false },
    subjects: [],
  });
  learningEvidence.mockResolvedValue(empty);
});

describe("the way to what a child has strengthened", () => {
  it("appears when the server has something to show", async () => {
    learningEvidence.mockResolvedValue({
      ...empty,
      strengthenedConcepts: [
        { conceptId: "c1", conceptName: "Equivalent fractions", recordedAt: "2026-11-01T10:00:00Z" },
      ],
    });
    render(<ParentHome />);
    expect(await screen.findByRole("link", { name: /What Amara.s strengthened/ })).toHaveAttribute(
      "href",
      "/parent-portal/changes?child=s-1",
    );
    expect(learningEvidence).toHaveBeenCalledWith("s-1");
  });

  it("is absent when nothing is strengthened", async () => {
    render(<ParentHome />);
    await waitFor(() => expect(learningEvidence).toHaveBeenCalledWith("s-1"));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("link", { name: /strengthened/ })).toBeNull();
  });

  it("is absent when the read fails", async () => {
    learningEvidence.mockRejectedValue(new Error("down"));
    render(<ParentHome />);
    await waitFor(() => expect(learningEvidence).toHaveBeenCalledWith("s-1"));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("link", { name: /strengthened/ })).toBeNull();
  });
});
