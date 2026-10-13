import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
import type { ProfileReads, StudentProfileState } from "@/hooks/useStudentProfile";

/**
 * WHAT THE PROFILE MAY CLAIM BEFORE ITS READS HAVE ANSWERED.
 *
 * A child with weeks of history was told - while the reads were in flight, or
 * after they failed - that Nevo was "still getting to know" them, with "No
 * profile yet" under their name. A failed mastery, recommendations,
 * adaptations or accommodations read simply removed its section.
 */

const READY: ProfileReads = {
  learnerProfile: "ready",
  mastery: "ready",
  recommendations: "ready",
  adaptations: "ready",
  accommodations: "ready",
};

const state = (reads: Partial<ProfileReads>, observed = false): StudentProfileState => ({
  profile: {
    student: { id: "s-1", firstName: "Amara", lastName: "Okafor", ageBand: "11 to 12" },
    profile: null,
    openFlagCount: 0,
  },
  concepts: [],
  helpSeeking: "",
  recommendations: [],
  adaptations: [],
  sessions: [],
  accommodations: null,
  observed,
  reads: { ...READY, ...reads },
  loading: false,
  missing: false,
  failed: false,
});

const show = (reads: Partial<ProfileReads>, observed = false) =>
  render(<LiveStudentProfile studentId="s-1" state={state(reads, observed)} />);

describe("while the learner profile is still on its way", () => {
  it("does not say Nevo has not seen enough of them", () => {
    show({ learnerProfile: "loading" });

    expect(screen.queryByText(/not seen enough|Still getting a picture/)).not.toBeInTheDocument();
  });

  it("does not say there is no profile yet", () => {
    show({ learnerProfile: "loading" });

    expect(screen.queryByText(/No profile yet/)).not.toBeInTheDocument();
  });
});

describe("when the learner profile could not be read", () => {
  it("claims neither an early profile nor no profile", () => {
    show({ learnerProfile: "failed" });

    expect(screen.queryByText(/not seen enough|Still getting a picture/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No profile yet/)).not.toBeInTheDocument();
  });
});

describe("when mastery has not answered", () => {
  it("does not call the profile early on the strength of an empty list", () => {
    show({ mastery: "loading" });

    expect(screen.queryByText(/not seen enough|Still getting a picture/)).not.toBeInTheDocument();
  });

  it("says the mastery read failed, under its own heading", () => {
    show({ mastery: "failed" });

    expect(screen.getByText("Concept mastery")).toBeInTheDocument();
    expect(screen.getByText(/couldn.t load these just now. Nothing has changed for Amara/)).toBeInTheDocument();
  });
});

describe("the other sections, when their read failed", () => {
  it("keeps What might help and says it could not be read", () => {
    show({ recommendations: "failed" });

    expect(screen.getByText("What might help")).toBeInTheDocument();
  });

  it("keeps What Nevo is offering and says it could not be read", () => {
    show({ accommodations: "failed" });

    expect(screen.getByText("What Nevo is offering")).toBeInTheDocument();
  });

  it("keeps the adaptations section and says it could not be read", () => {
    show({ adaptations: "failed" });

    expect(screen.getAllByText(/couldn.t load these just now/)).toHaveLength(1);
  });
});

describe("once everything has answered", () => {
  it("is the early state for a child Nevo genuinely does not know yet", () => {
    show({});

    expect(screen.getByText(/Nevo has not seen enough of Amara’s work yet/)).toBeInTheDocument();
    expect(screen.getByText(/No profile yet/)).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t load these/)).not.toBeInTheDocument();
  });

  it("says the profile is building once Nevo has observed", () => {
    show({}, true);

    expect(screen.getByText(/Learning profile building/)).toBeInTheDocument();
  });
});

describe("a state that carries no reads at all", () => {
  it("is treated as every read answered - the fixture path has none", () => {
    const { reads: _unused, ...withoutReads } = state({});
    void _unused;
    render(<LiveStudentProfile studentId="s-1" state={withoutReads} />);

    expect(screen.getByText(/Nevo has not seen enough of Amara’s work yet/)).toBeInTheDocument();
  });
});
