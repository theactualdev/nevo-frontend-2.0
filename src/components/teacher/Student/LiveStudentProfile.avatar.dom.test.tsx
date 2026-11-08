import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useStudentDirectory } = vi.hoisted(() => ({ useStudentDirectory: vi.fn() }));
vi.mock("@/hooks/useStudentFlags", () => ({
  useStudentFlags: () => ({ noticed: [], failed: false, loading: false }),
}));
vi.mock("@/hooks/useStudentSessions", () => ({
  useStudentSessions: () => ({ sessions: [], total: 0, loading: false, failed: false }),
  useStudentSession: () => ({ detail: null, loading: false, failed: false }),
}));
vi.mock("@/hooks/useStudentDirectory", () => ({ useStudentDirectory }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { LiveStudentProfile } from "./LiveStudentProfile";
import type { StudentProfileState } from "@/hooks/useStudentProfile";
import { avatarLookOf } from "@/lib/profile/avatarLook";

/**
 * SCRUM-317 on the profile: the child's chosen avatar beside their name in
 * C08's header, never their initials. The single-student read carries no
 * avatar, so the look is the one on the child's class roster.
 */

const STATE: StudentProfileState = {
  profile: {
    student: { id: "s-42", firstName: "Amara", lastName: "Okafor", ageBand: "11 to 12" },
    profile: null,
    openFlagCount: 0,
  },
  concepts: [],
  helpSeeking: null,
  recommendations: [],
  adaptations: [],
  sessions: [],
  accommodations: null,
  observed: true,
  loading: false,
  missing: false,
  failed: false,
} as unknown as StudentProfileState;

const directory = (students: unknown[], loading = false) =>
  useStudentDirectory.mockReturnValue({ students, loading, failed: false });

const header = () =>
  screen.getByRole("heading", { level: 1, name: "Amara Okafor" }).closest("[class*='gap-3.5']")!;

beforeEach(() => {
  directory([
    { studentId: "s-42", name: "Amara Okafor", className: "JSS 2A", classId: "c-1", look: avatarLookOf("hexagon", "cream_elevated") },
  ]);
});

describe("the profile header", () => {
  it("draws the child's own look beside their name, not their initials", () => {
    render(<LiveStudentProfile studentId="s-42" state={STATE} />);

    expect(header().querySelector("[data-avatar-look]")?.getAttribute("data-avatar-look")).toBe(
      "hexagon-cream_elevated",
    );
    expect(screen.queryByText("AO")).not.toBeInTheDocument();
  });

  it("draws no look for a child who isn't on this teacher's rosters", () => {
    directory([]);
    render(<LiveStudentProfile studentId="s-42" state={STATE} />);

    expect(header().querySelector("[data-avatar-look]")).toBeNull();
    expect(screen.queryByText("AO")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Amara Okafor" })).toBeInTheDocument();
  });

  it("holds a quiet placeholder while the rosters are read", () => {
    directory([], true);
    render(<LiveStudentProfile studentId="s-42" state={STATE} />);

    expect(header().querySelector("[data-avatar-look]")).toBeNull();
    expect(header().querySelector(".animate-pulse")).not.toBeNull();
  });
});
