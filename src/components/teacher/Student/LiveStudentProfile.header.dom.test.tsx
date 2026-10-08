import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useStudentSessions, useStudentSession } = vi.hoisted(() => ({
  useStudentSessions: vi.fn(),
  useStudentSession: vi.fn(),
}));
vi.mock("@/hooks/useStudentFlags", () => ({
  useStudentFlags: () => ({ noticed: [], failed: false, loading: false }),
}));
vi.mock("@/hooks/useStudentSessions", () => ({
  useStudentSessions,
  useStudentSession,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { LiveStudentProfile } from "./LiveStudentProfile";
import type { StudentProfileState } from "@/hooks/useStudentProfile";

/**
 * C08's HEADER. The live profile drew its actions at the very foot of the
 * page, under every section, at both widths - a teacher who came to recommend
 * a lesson scrolled past the whole profile to find the button. C08 draws them
 * in the header: beside the name on desktop, in a row under it on tablet.
 */

const STATE: StudentProfileState = {
  profile: {
    student: { id: "s-42", firstName: "Amara", lastName: "Okafor", ageBand: "11 to 12" },
    profile: null,
    openFlagCount: 0,
  },
  concepts: [],
  helpSeeking: "Asked Nevo for help a few times this week.",
  recommendations: [],
  adaptations: [],
  sessions: [],
  accommodations: null,
  observed: true,
  loading: false,
  missing: false,
  failed: false,
};

const ACTIONS = [
  () => screen.getByRole("button", { name: "Recommend a lesson" }),
  () => screen.getByRole("button", { name: "Flag for support" }),
  () => screen.getByRole("link", { name: "Send them a message" }),
];

const before = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  useStudentSessions.mockReturnValue({ sessions: [], total: 0, loading: false, failed: false });
  useStudentSession.mockReturnValue({ detail: null, loading: false, failed: false });
});

describe("the profile's actions", () => {
  it("sit in the header with the child's name, not at the foot of the page", () => {
    render(<LiveStudentProfile studentId="s-42" state={STATE} />);
    const header = screen.getByRole("heading", { level: 1, name: "Amara Okafor" }).closest(
      "[class*='xl:justify-between']",
    );

    expect(header).not.toBeNull();
    for (const action of ACTIONS) expect(header).toContainElement(action());
  });

  it("come before what Nevo has noticed - every section of it", () => {
    render(<LiveStudentProfile studentId="s-42" state={STATE} />);
    const help = screen.getByText(STATE.helpSeeking);

    for (const action of ACTIONS) expect(before(action(), help)).toBe(true);
  });

  it("lead with the primary action, as C08 orders them", () => {
    render(<LiveStudentProfile studentId="s-42" state={STATE} />);
    const [recommend, flag, message] = ACTIONS.map((a) => a());

    expect(before(recommend, flag)).toBe(true);
    expect(before(flag, message)).toBe(true);
  });
});
