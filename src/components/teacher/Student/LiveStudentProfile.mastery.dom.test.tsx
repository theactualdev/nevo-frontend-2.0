import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";

vi.mock("@/hooks/useStudentFlags", () => ({
  useStudentFlags: () => ({ noticed: [], failed: false, loading: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/hooks/useStudentSessions", () => ({
  useStudentSessions: () => ({ sessions: [], total: 0, loading: false, failed: false }),
  useStudentSession: () => ({ detail: null, loading: false, failed: false }),
}));

import { LiveStudentProfile } from "./LiveStudentProfile";
import type {
  MasteryConcept,
  ProfileReads,
  StudentProfileState,
} from "@/hooks/useStudentProfile";

/**
 * C08's Concept mastery on the By Level design (S21, live 27 Nov), HELD until
 * Lydia says the screens switch (her 9 Nov ruling: together, in one go).
 *
 * A state per curriculum level instead of two bars, and each way the read can
 * end draws its own thing (Hub, 28 Nov): a failure says so, a refusal and a
 * child out of reach draw nothing.
 */

const READY: ProfileReads = {
  learnerProfile: "ready",
  mastery: "ready",
  recommendations: "ready",
  adaptations: "ready",
  accommodations: "ready",
};

const state = (concepts: MasteryConcept[], reads: Partial<ProfileReads> = {}): StudentProfileState => ({
  profile: {
    student: { id: "s-1", firstName: "Amara", lastName: "Okafor", ageBand: "11 to 12" },
    profile: null,
    openFlagCount: 0,
  },
  concepts,
  helpSeeking: "",
  recommendations: [],
  adaptations: [],
  sessions: [],
  accommodations: null,
  observed: true,
  reads: { ...READY, ...reads },
  loading: false,
  missing: false,
  failed: false,
});

const show = (concepts: MasteryConcept[], reads: Partial<ProfileReads> = {}) =>
  render(<LiveStudentProfile studentId="s-1" state={state(concepts, reads)} />);

const FAILED_LINE = /couldn.t load these just now/;

describe("C08's Concept mastery, by level", () => {
  it("draws each concept's levels in the frame's words, with no bar and no number", () => {
    const { container } = show([
      {
        conceptId: "c-1",
        name: "Solving linear equations",
        levels: { knowing_and_understanding: "reached", application: "working", analysis_and_evaluation: "not" },
        reading: "at",
      },
      {
        conceptId: "c-2",
        name: "Simplifying expressions",
        levels: { knowing_and_understanding: "reached" },
        reading: "support",
      },
    ]);

    expect(screen.getByRole("heading", { name: "Concept mastery" })).toBeInTheDocument();
    const text = visibleText(container);
    expect(text).toMatch(/Solving linear equations\s*Knowing and understanding\s*Reached\s*Application\s*Working at it\s*Analysis and evaluation\s*Not arrived yet\s*Reading level\s*At level/);
    // Nothing observed at Application or Analysis: "Not checked yet" (Lydia,
    // L99), never "Not arrived yet".
    expect(text).toMatch(
      /Simplifying expressions\s*Knowing and understanding\s*Reached\s*Application\s*Not checked yet\s*Analysis and evaluation\s*Not checked yet\s*Reading level\s*Support needed/,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(text).not.toMatch(/\d+%|Understanding\b/);
  });

  it("keeps the live lead line, not the frame's line about two tracks", () => {
    const { container } = show([
      { conceptId: "c-1", name: "Fractions", levels: { application: "working" }, reading: null },
    ]);
    expect(visibleText(container)).toMatch(
      /How well each idea has landed, and how much the reading itself is shaping that\./,
    );
    expect(visibleText(container)).not.toMatch(/Two tracks|tracks part company/);
  });
});

describe("C08's Concept mastery, when the read does not answer", () => {
  it("says a failed read, under the heading", () => {
    const { container } = show([], { mastery: "failed" });
    expect(screen.getByRole("heading", { name: "Concept mastery" })).toBeInTheDocument();
    expect(visibleText(container)).toMatch(FAILED_LINE);
  });

  it("draws nothing on a refusal - no heading, no failure line, no retry", () => {
    const { container } = show([], { mastery: "refused" });
    expect(screen.queryByRole("heading", { name: "Concept mastery" })).toBeNull();
    expect(visibleText(container)).not.toMatch(FAILED_LINE);
  });

  it("draws nothing for a child out of reach - no heading, no failure line", () => {
    const { container } = show([], { mastery: "missing" });
    expect(screen.queryByRole("heading", { name: "Concept mastery" })).toBeNull();
    expect(visibleText(container)).not.toMatch(FAILED_LINE);
  });
});
