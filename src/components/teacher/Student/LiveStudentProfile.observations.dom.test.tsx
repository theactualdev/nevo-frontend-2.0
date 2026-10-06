import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { classStudents } = vi.hoisted(() => ({ classStudents: vi.fn() }));
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return { ...actual, classesApi: { ...actual.classesApi, classStudents } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/hooks/useStudentSessions", () => ({
  useStudentSessions: () => ({ sessions: [], total: 0, loading: false, failed: false }),
  useStudentSession: () => ({ detail: null, loading: false, failed: false }),
}));
vi.mock("@/hooks/useStudentFlags", () => ({
  useStudentFlags: () => ({ noticed: [], loading: false, failed: false }),
}));

import { LiveStudentProfile } from "./LiveStudentProfile";
import type { StudentProfileState } from "@/hooks/useStudentProfile";
import { OBSERVATION_COPY } from "@/lib/constants/observations";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * C08's "What Nevo has noticed", on a real student.
 *
 * The observations arrive on the class roster and not on the profile read, so
 * the profile reads them from the class its roster row came from. These guard
 * the three things that matter: it is the engine's own patterns in the copy
 * file's sentences, a count only where that file allows one, and NOTHING when
 * there is no class to ask - never a section saying Nevo noticed nothing.
 */

const STATE: StudentProfileState = {
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
} as unknown as StudentProfileState;

const row = (studentId: string, observations: unknown[]) => ({
  studentId,
  firstName: "Amara",
  lastName: "Okafor",
  displayName: "Amara Okafor",
  loginIdentifier: "NV-A1B2C3",
  status: "active",
  profileStatus: "observed",
  latestSessionAt: null,
  observations,
  seatContext: null,
  consent: null,
});

beforeEach(() => {
  classStudents.mockReset();
  clearSession();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
});

describe("what Nevo has noticed", () => {
  it("shows this child's patterns, in the copy file's sentences", async () => {
    classStudents.mockResolvedValue([
      row("s-1", [{ pattern: "steadier_pace" }, { pattern: "revisited_content", count: 7 }]),
    ]);
    render(<LiveStudentProfile studentId="s-1" classId="c-1" state={STATE} />);

    expect(await screen.findByText("What Nevo has noticed")).toBeInTheDocument();
    expect(screen.getByText(OBSERVATION_COPY.steadier_pace.body("Amara"))).toBeInTheDocument();
    expect(screen.getByText(OBSERVATION_COPY.revisited_content.body("Amara"))).toBeInTheDocument();
    expect(classStudents).toHaveBeenCalledWith("c-1");
    // The count that would turn "went back over it" into a finding is never shown.
    expect(screen.queryByText(/7 times/)).not.toBeInTheDocument();
  });

  it("puts the count beside finished lessons, the one place it may go", async () => {
    classStudents.mockResolvedValue([row("s-1", [{ pattern: "completed_lessons", count: 12 }])]);
    render(<LiveStudentProfile studentId="s-1" classId="c-1" state={STATE} />);

    expect(await screen.findByText("12 times")).toBeInTheDocument();
  });

  it("reads only this child's row from the roster", async () => {
    classStudents.mockResolvedValue([
      row("s-2", [{ pattern: "tried_another_format" }]),
      row("s-1", [{ pattern: "steadier_pace" }]),
    ]);
    render(<LiveStudentProfile studentId="s-1" classId="c-1" state={STATE} />);

    await screen.findByText("What Nevo has noticed");
    expect(screen.queryByText(OBSERVATION_COPY.tried_another_format.body("Amara"))).not.toBeInTheDocument();
  });

  it("draws nothing, and asks nothing, when the profile was opened without a class", async () => {
    render(<LiveStudentProfile studentId="s-1" state={STATE} />);

    await waitFor(() => expect(screen.getByText("Amara Okafor")).toBeInTheDocument());
    expect(classStudents).not.toHaveBeenCalled();
    expect(screen.queryByText("What Nevo has noticed")).not.toBeInTheDocument();
  });

  it("draws nothing when the roster read failed", async () => {
    classStudents.mockRejectedValue(new Error("500"));
    render(<LiveStudentProfile studentId="s-1" classId="c-1" state={STATE} />);

    await waitFor(() => expect(classStudents).toHaveBeenCalled());
    expect(screen.queryByText("What Nevo has noticed")).not.toBeInTheDocument();
  });

  it("draws nothing when the roster has no observations for the child", async () => {
    classStudents.mockResolvedValue([row("s-1", [])]);
    render(<LiveStudentProfile studentId="s-1" classId="c-1" state={STATE} />);

    await waitFor(() => expect(classStudents).toHaveBeenCalled());
    expect(screen.queryByText("What Nevo has noticed")).not.toBeInTheDocument();
  });

  it("drops a pattern it has no approved sentence for", async () => {
    classStudents.mockResolvedValue([
      row("s-1", [{ pattern: "some_future_pattern" }, { pattern: "steadier_pace" }]),
    ]);
    const { container } = render(<LiveStudentProfile studentId="s-1" classId="c-1" state={STATE} />);

    await screen.findByText("What Nevo has noticed");
    expect(container.textContent).not.toMatch(/some_future_pattern|undefined/);
  });
});
