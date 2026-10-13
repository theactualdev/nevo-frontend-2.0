import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { useStudentSessions, useStudentSession } = vi.hoisted(() => ({
  useStudentSessions: vi.fn(),
  useStudentSession: vi.fn(),
}));
vi.mock("@/hooks/useStudentFlags", () => ({
  useStudentFlags: () => ({ noticed: [], failed: false, loading: false }),
}));
vi.mock("@/hooks/useStudentSessions", () => ({ useStudentSessions, useStudentSession }));
vi.mock("@/hooks/useTeacherClasses", () => ({
  useTeacherClasses: () => ({ liveClasses: [{ classId: "c-1", className: "JSS 2A" }] }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("./LiveRecommendSheet", () => ({
  LiveRecommendSheet: () => <div role="dialog" aria-label="Recommend a lesson" />,
}));

import { LiveStudentProfile } from "./LiveStudentProfile";
import type { StudentProfileState } from "@/hooks/useStudentProfile";

/**
 * C19 B2 (design, 12 Oct): the profile on a phone is the back bar, who this
 * is, what Nevo noticed, and one "Recommend a lesson" at the foot. CSS picks
 * the width; these pin that each piece carries the right side of the switch.
 */

const STATE: StudentProfileState = {
  profile: {
    student: { id: "s-42", firstName: "Tunde", lastName: "Adeyemi", ageBand: "11 to 12" },
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

beforeEach(() => {
  useStudentSessions.mockReturnValue({ sessions: [], total: 0, loading: false, failed: false });
  useStudentSession.mockReturnValue({ detail: null, loading: false, failed: false });
});

const renderIt = () =>
  render(
    <LiveStudentProfile
      studentId="s-42"
      state={STATE}
      classId="c-1"
      classHref="/teacher/classes/c-1"
    />,
  );

describe("the profile on a phone", () => {
  it("puts the class's roster in the back bar, in place of the menu", () => {
    renderIt();
    const bars = screen.getAllByRole("link", { name: /JSS 2A · Roster/ });

    // The phone bar, and the page's own link for a bigger screen.
    expect(bars.map((b) => b.className.includes("md:hidden"))).toContain(true);
    expect(bars.map((b) => b.className.includes("max-md:hidden"))).toContain(true);
    for (const b of bars) expect(b).toHaveAttribute("href", "/teacher/classes/c-1");
  });

  it("offers Recommend a lesson at the foot, and it opens the sheet", () => {
    renderIt();
    const foot = screen
      .getAllByRole("button", { name: "Recommend a lesson" })
      .find((b) => b.className.includes("md:hidden") && !b.className.includes("max-md:"))!;

    fireEvent.click(foot);
    expect(screen.getByRole("dialog", { name: "Recommend a lesson" })).toBeInTheDocument();
  });

  it("keeps the header's three actions and what B2 does not draw off a phone", () => {
    renderIt();

    const flag = screen.getByRole("button", { name: "Flag for support" });
    expect(flag.parentElement?.className).toMatch(/max-md:hidden/);
    // The help-seeking line is one of the sections B2 leaves out.
    expect(
      screen.getByText("Asked Nevo for help a few times this week.").closest('[class~="max-md:hidden"]'),
    ).not.toBeNull();
  });
});
