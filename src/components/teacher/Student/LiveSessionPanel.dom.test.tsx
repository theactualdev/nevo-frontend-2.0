import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { StudentSessionDetail } from "@/lib/api/students";

const { useStudentSession } = vi.hoisted(() => ({ useStudentSession: vi.fn() }));
vi.mock("@/hooks/useStudentSessions", () => ({ useStudentSession }));

import { LiveSessionPanel } from "./LiveSessionPanel";

/**
 * C08d on a real session.
 *
 * The screen was never the problem. `SessionPanel` has been frame-complete
 * since it was built and mounted only for signed-out visitors, because nothing
 * gave a teacher a session id to read with. That is why this file is about
 * WIRING - what the panel is handed, and what it does when there is nothing to
 * hand it - rather than about markup that already had a frame.
 */

const detail = (over: Partial<StudentSessionDetail> = {}): StudentSessionDetail => ({
  sessionId: "sess-1",
  lessonId: "l-1",
  lessonTitle: "Solving linear equations",
  occurredAt: "2026-07-09T09:00:00Z",
  sittings: 1,
  narrative: "Worked through it steadily.",
  sections: [
    { title: "What an equation is", note: "Straight through.", tookTime: false },
    { title: "x on both sides", note: "Came back the next day.", tookTime: true },
  ],
  ...over,
});

const show = (sessionId: string | null = "sess-1") =>
  render(
    <LiveSessionPanel
      studentId="st-1"
      sessionId={sessionId}
      studentName="Amara Okafor"
      onClose={vi.fn()}
      onRecommend={vi.fn()}
      onMessage={vi.fn()}
    />,
  );

beforeEach(() => {
  useStudentSession.mockReset();
  useStudentSession.mockReturnValue({
    detail: detail(),
    loading: false,
    failed: false,
  });
});

describe("nothing open", () => {
  it("renders nothing at all", () => {
    // A profile nobody has clicked into should cost no panel and no request.
    const { container } = show(null);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("a real session", () => {
  it("renders the engine's narrative, not a rewrite of it", () => {
    show();

    expect(screen.getByText("Worked through it steadily.")).toBeInTheDocument();
  });

  it("renders every section the engine described", () => {
    show();

    expect(screen.getByText("What an equation is")).toBeInTheDocument();
    expect(screen.getByText("x on both sides")).toBeInTheDocument();
  });

  it("passes the engine's own tookTime through rather than deriving one", () => {
    // The flag is the engine's. Deriving "took time" from a duration here
    // would be the console deciding what that means.
    show();

    expect(screen.getByTitle("Spent longer on this section")).toBeInTheDocument();
    expect(screen.getByTitle("Moved straight through")).toBeInTheDocument();
  });
});

describe("sittings", () => {
  it("says nothing on a single sitting", () => {
    // The frame omits it rather than saying "in one sitting", which tells a
    // teacher nothing they had not assumed.
    show();

    expect(screen.queryByText(/sitting/i)).not.toBeInTheDocument();
  });

  it("says so from the second sitting on", () => {
    useStudentSession.mockReturnValue({
      detail: detail({ sittings: 2 }),
      loading: false,
      failed: false,
    });
    show();

    expect(screen.getByText(/finished in 2 sittings/i)).toBeInTheDocument();
  });
});

describe("when the read fails", () => {
  it("says it is ours, not the child's", () => {
    // A failed read must never read as a fact about this named child.
    useStudentSession.mockReturnValue({ detail: null, loading: false, failed: true });
    show();

    expect(screen.getByText(/couldn’t load that session/i)).toBeInTheDocument();
    expect(screen.getByText(/isn’t about Amara Okafor/i)).toBeInTheDocument();
    // Backlog item 28: Close was the only way out.
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("shows no session content it does not have", () => {
    useStudentSession.mockReturnValue({ detail: null, loading: false, failed: true });
    show();

    expect(screen.queryByText("Worked through it steadily.")).not.toBeInTheDocument();
  });
});
