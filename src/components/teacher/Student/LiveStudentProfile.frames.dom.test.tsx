import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { sessionsState, useTeacherClasses } = vi.hoisted(() => ({
  sessionsState: { value: { sessions: [] as unknown[], total: 0, loading: false, failed: false } },
  useTeacherClasses: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/hooks/useStudentSessions", () => ({
  useStudentSessions: () => sessionsState.value,
  useStudentSession: () => ({ detail: null, loading: false, failed: false }),
}));
vi.mock("@/hooks/useStudentFlags", () => ({
  useStudentFlags: () => ({ noticed: [], loading: false, failed: false }),
}));
vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses }));

import { LiveStudentProfile } from "./LiveStudentProfile";
import type { StudentProfileState } from "@/hooks/useStudentProfile";

/**
 * C08 and C14 A5, word for word, on a real student - where the profile used
 * to say things no frame draws: one early card of our own, "Back to the
 * class", a button carrying the sheet's title, and the adaptations above the
 * lesson history with an "After noticing" line nobody drew.
 */

const STATE = (over: Partial<StudentProfileState> = {}): StudentProfileState =>
  ({
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
    observed: false,
    loading: false,
    missing: false,
    failed: false,
    ...over,
  }) as unknown as StudentProfileState;

const SESSION = {
  sessionId: "se-1",
  lessonTitle: "Fractions 3",
  occurredAt: "2026-10-01T09:00:00Z",
  completionStatus: "completed",
  sitting: 1,
};

beforeEach(() => {
  sessionsState.value = { sessions: [], total: 0, loading: false, failed: false };
  useTeacherClasses.mockReturnValue({ liveClasses: [], classes: [], options: [], live: true, loading: false, sample: false });
});

describe("a child Nevo has seen nothing of", () => {
  it("gets C14 A5's line under What Nevo has noticed", () => {
    render(<LiveStudentProfile studentId="s-1" state={STATE()} />);

    expect(screen.getByText("What Nevo has noticed")).toBeInTheDocument();
    expect(
      screen.getByText("Nevo has not seen enough of Amara’s work yet to say anything useful."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Still getting a picture/)).not.toBeInTheDocument();
  });

  it("says neither while the sessions are still being read", () => {
    sessionsState.value = { sessions: [], total: 0, loading: true, failed: false };
    render(<LiveStudentProfile studentId="s-1" state={STATE()} />);

    expect(screen.queryByText(/not seen enough/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Still getting a picture/)).not.toBeInTheDocument();
  });
});

describe("a child Nevo has started to see", () => {
  it("gets C08's early card, and not A5's line", () => {
    sessionsState.value = { sessions: [SESSION], total: 1, loading: false, failed: false };
    render(<LiveStudentProfile studentId="s-1" state={STATE()} />);

    expect(
      screen.getByText(
        "Still getting a picture of Amara’s work. A few more sessions and this will fill in - for now, here’s the early picture.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not seen enough/)).not.toBeInTheDocument();
  });
});

describe("the way back", () => {
  it("names the class and its roster, as C08 draws it", () => {
    useTeacherClasses.mockReturnValue({
      liveClasses: [{ classId: "c-1", className: "JSS 2B" }],
      classes: [],
      options: [],
      live: true,
      loading: false,
      sample: false,
    });
    render(
      <LiveStudentProfile studentId="s-1" classId="c-1" classHref="/teacher/classes/c-1" state={STATE()} />,
    );

    // Twice since C19: the page's own link, and the phone's back bar. Both
    // go to the same place under the same name.
    const back = screen.getAllByRole("link", { name: "JSS 2B · Roster" });
    expect(back).toHaveLength(2);
    for (const b of back) expect(b).toHaveAttribute("href", "/teacher/classes/c-1");
  });

  it("is My Classes when the profile was opened without one", () => {
    render(<LiveStudentProfile studentId="s-1" state={STATE()} />);

    const back = screen.getAllByRole("link", { name: "My Classes" });
    expect(back).toHaveLength(2);
    for (const b of back) expect(b).toHaveAttribute("href", "/teacher/classes");
  });
});

describe("the support action", () => {
  it("is C08's Flag for support", () => {
    render(<LiveStudentProfile studentId="s-1" state={STATE()} />);

    expect(screen.getByRole("button", { name: "Flag for support" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share with Learning Support" })).not.toBeInTheDocument();
  });
});

/*
 * C20 (design, 12 Oct): adaptation history is Learning Support material. It
 * sits in the profile's "Learning support" section, below the teaching views,
 * for a viewer who holds the role - and is absent, with no trace, for anyone
 * else. It used to be C16c, drawn for every teacher.
 */
describe("the learning support section", () => {
  const ADAPTED = STATE({
    observed: true,
    learningSupport: true,
    adaptations: [
      {
        id: "ad-1",
        timestamp: "2026-10-02T09:00:00Z",
        lessonTitle: "Fractions 3",
        adaptation: "Offered the spoken version of the worked example.",
        trigger: "paused on the second step",
      },
    ] as never,
  });

  it("sits below the teaching views, for a holder", () => {
    sessionsState.value = { sessions: [SESSION], total: 1, loading: false, failed: false };
    render(<LiveStudentProfile studentId="s-1" state={ADAPTED} />);

    const sessions = screen.getByText("Recent sessions");
    const section = screen.getByRole("region", { name: "Learning support" });
    expect(sessions.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section).toHaveTextContent("The same record an administrator with the role sees for");
  });

  it("carries Nevo's own sentence, dated, and no After noticing line", () => {
    render(<LiveStudentProfile studentId="s-1" state={ADAPTED} />);
    const section = screen.getByRole("region", { name: "Learning support" });

    expect(section).toHaveTextContent("Adaptation history");
    expect(section).toHaveTextContent("2 October");
    expect(section).toHaveTextContent("Offered the spoken version of the worked example.");
    expect(screen.queryByText(/After noticing/)).not.toBeInTheDocument();
  });

  it("is absent - no heading, no history, no line - without the role", () => {
    render(
      <LiveStudentProfile studentId="s-1" state={{ ...ADAPTED, learningSupport: false }} />,
    );

    expect(screen.queryByRole("region", { name: "Learning support" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Learning support/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Offered the spoken version of the worked example.")).not.toBeInTheDocument();
    expect(screen.queryByText("How Nevo has adapted for this student")).not.toBeInTheDocument();
  });

  it("says plainly when Nevo has changed nothing yet", () => {
    render(<LiveStudentProfile studentId="s-1" state={{ ...ADAPTED, adaptations: [] }} />);

    expect(screen.getByRole("region", { name: "Learning support" })).toHaveTextContent(
      "Nevo hasn’t changed anything in",
    );
  });
});
