import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useStudentFlags } = vi.hoisted(() => ({ useStudentFlags: vi.fn() }));
vi.mock("@/hooks/useStudentFlags", () => ({ useStudentFlags }));
// Added when the session panel gave this profile its first navigation; without
// it every render here dies on "invariant expected app router to be mounted".
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/hooks/useStudentSessions", () => ({
  useStudentSessions: () => ({ sessions: [], total: 0, loading: false, failed: false }),
  useStudentSession: () => ({ detail: null, loading: false, failed: false }),
}));

import { LiveStudentProfile } from "./LiveStudentProfile";
import type { StudentProfileState } from "@/hooks/useStudentProfile";

/**
 * C08's noticing banner on the live profile.
 *
 * WHAT THIS GUARDS. Until today this screen had a stand-in: a count, and a
 * link sending the teacher to the dashboard to read what the count was about.
 * The two must not both appear - a banner saying what Nevo noticed, above a
 * line saying two things are worth your attention, is the same fact twice with
 * a pointer away from the page that now carries it. And the count must not
 * disappear when the banner cannot render, because a failed flags read is the
 * one case where a number is all we honestly have.
 */

const state = (over: Partial<StudentProfileState> = {}): StudentProfileState => ({
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
  observed: true,
  loading: false,
  missing: false,
  failed: false,
  ...over,
});

const withCount = (openFlagCount: number) =>
  state({
    profile: {
      student: { id: "s-1", firstName: "Amara", lastName: "Okafor", ageBand: "11 to 12" },
      profile: null,
      openFlagCount,
    },
  });

const NOTICED = {
  id: "f-1",
  note: "Sessions have been getting shorter over the last fortnight.",
  generatedAt: "2026-09-15T09:00:00Z",
};

const flags = (noticed: (typeof NOTICED)[], failed = false) =>
  useStudentFlags.mockReturnValue({ noticed, failed, loading: false });

const COUNT_LINE = /worth your attention/;

beforeEach(() => {
  useStudentFlags.mockReset();
  flags([]);
});

describe("the banner", () => {
  it("shows what Nevo noticed, in Nevo's own words", () => {
    flags([NOTICED]);

    render(<LiveStudentProfile studentId="s-1" state={state()} />);

    expect(screen.getByText(NOTICED.note)).toBeInTheDocument();
    expect(screen.getByText("What Nevo noticed")).toBeInTheDocument();
  });

  it("dates each line rather than claiming a week", () => {
    // The frame labels this "This week:". A flag carries `generatedAt` and the
    // route declares no window, so the date is what may be said.
    flags([NOTICED]);

    render(<LiveStudentProfile studentId="s-1" state={state()} />);

    // `Sept` is what en-GB abbreviates September to, and it is what the
    // sessions and adaptations lists on this same screen already print.
    expect(screen.getByText(/15 Sept?/)).toBeInTheDocument();
  });

  it("shows every open flag, not just the newest", () => {
    flags([
      NOTICED,
      { id: "f-2", note: "Two lessons left partway through this week.", generatedAt: "2026-09-11T09:00:00Z" },
    ]);

    render(<LiveStudentProfile studentId="s-1" state={state()} />);

    expect(screen.getByText(NOTICED.note)).toBeInTheDocument();
    expect(
      screen.getByText("Two lessons left partway through this week."),
    ).toBeInTheDocument();
  });

  it("asks about this student and no one else", () => {
    flags([NOTICED]);

    render(<LiveStudentProfile studentId="s-1" state={state()} />);

    expect(useStudentFlags).toHaveBeenCalledWith("s-1");
  });

  it("is absent when Nevo has noticed nothing", () => {
    render(<LiveStudentProfile studentId="s-1" state={state()} />);

    expect(screen.queryByText("What Nevo noticed")).not.toBeInTheDocument();
    expect(screen.queryByText(COUNT_LINE)).not.toBeInTheDocument();
  });
});

describe("the count it replaces", () => {
  it("stands down once the prose is on the page", () => {
    flags([NOTICED]);

    render(<LiveStudentProfile studentId="s-1" state={withCount(2)} />);

    expect(screen.getByText(NOTICED.note)).toBeInTheDocument();
    expect(screen.queryByText(COUNT_LINE)).not.toBeInTheDocument();
  });

  it("still speaks when the flags read failed", () => {
    // Saying nothing here would hide a flag the profile read told us about.
    flags([], true);

    render(<LiveStudentProfile studentId="s-1" state={withCount(2)} />);

    expect(screen.getByText(COUNT_LINE)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "See what Nevo noticed" }),
    ).toBeInTheDocument();
  });
});

describe("the calm early note", () => {
  const EARLY = /not seen enough|Still getting a picture/;

  it("appears for a child with nothing observed yet", () => {
    render(
      <LiveStudentProfile studentId="s-1" state={state({ observed: false })} />,
    );

    expect(screen.getByText(EARLY)).toBeInTheDocument();
  });

  it("stands down beside a flag, which contradicts it", () => {
    flags([NOTICED]);

    render(
      <LiveStudentProfile studentId="s-1" state={state({ observed: false })} />,
    );

    expect(screen.getByText(NOTICED.note)).toBeInTheDocument();
    expect(screen.queryByText(EARLY)).not.toBeInTheDocument();
  });
});
