import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { sessionsState } = vi.hoisted(() => ({
  sessionsState: { value: { sessions: [] as unknown[], total: 0, loading: false, failed: false } },
}));
vi.mock("@/hooks/useStudentFlags", () => ({
  useStudentFlags: () => ({ noticed: [], failed: false, loading: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/hooks/useStudentSessions", () => ({
  useStudentSessions: () => sessionsState.value,
  useStudentSession: () => ({ detail: null, loading: false, failed: false }),
}));

import { LiveStudentProfile } from "./LiveStudentProfile";
import type { StudentProfileState } from "@/hooks/useStudentProfile";

/**
 * C14 A5's "Recent sessions" for a child who has none.
 *
 * An empty list rendered nothing at all, so a child who had never started a
 * lesson looked the same as a page still loading. The frame draws the line:
 * "No sessions yet - Amara hasn't started a lesson."
 */

const state = (): StudentProfileState => ({
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
});

const sessions = (over: Partial<typeof sessionsState.value>) => {
  sessionsState.value = { sessions: [], total: 0, loading: false, failed: false, ...over };
};

beforeEach(() => sessions({}));

describe("recent sessions, for a child with none", () => {
  it("says C14's line, with this child's own name", () => {
    render(<LiveStudentProfile studentId="s-1" state={state()} />);

    expect(screen.getByText("Recent sessions")).toBeInTheDocument();
    expect(
      screen.getByText("No sessions yet - Amara hasn’t started a lesson."),
    ).toBeInTheDocument();
  });

  it("says nothing while the sessions are still loading", () => {
    sessions({ loading: true });
    render(<LiveStudentProfile studentId="s-1" state={state()} />);

    expect(screen.queryByText(/No sessions yet/)).not.toBeInTheDocument();
  });

  it("does not say there are none when the read failed", () => {
    sessions({ failed: true });
    render(<LiveStudentProfile studentId="s-1" state={state()} />);

    expect(screen.queryByText(/No sessions yet/)).not.toBeInTheDocument();
    expect(screen.getByText(/couldn.t load these just now/)).toBeInTheDocument();
  });
});
