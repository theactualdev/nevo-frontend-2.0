import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { query, useStudentDirectory } = vi.hoisted(() => ({
  query: { value: { data: null as unknown, failed: false, loading: false } },
  useStudentDirectory: vi.fn(),
}));
vi.mock("@/hooks/useLiveQuery", () => ({ useLiveQuery: () => query.value }));
vi.mock("@/hooks/useStudentDirectory", () => ({ useStudentDirectory }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import { LearningSupportView } from "./LearningSupportView";
import { avatarLookOf } from "@/lib/profile/avatarLook";

/**
 * SCRUM-317 on the Learning Support list: each child by the avatar they chose,
 * never their initials. An escalation carries no avatar, so the look comes
 * from the teacher's own class rosters; a child from another class gets an
 * empty slot, never a look they did not choose.
 */

const concern = (studentId: string, studentName: string) => ({
  id: `e-${studentId}`,
  studentId,
  studentFirstName: studentName.split(" ")[0],
  studentName,
  classId: "c-1",
  className: "JSS 3B",
  teacherId: "t-1",
  teacherName: "Mr. Bello",
  note: "His written work has dropped off.",
  recentPicture: "",
  generatedAt: "2026-11-03T09:00:00Z",
  acknowledged: false,
});

beforeEach(() => {
  // Both shapes of the read: `open` today, `concerns` once seen ones stay (#1059).
  const rows = [concern("s-1", "Chidera Nwosu"), concern("s-2", "Emeka Obi")];
  query.value = {
    data: { holders: { holders: [], viewerHoldsIt: true }, concerns: { open: rows, concerns: rows, complete: true } },
    failed: false,
    loading: false,
  };
  useStudentDirectory.mockReturnValue({
    students: [{ studentId: "s-1", name: "Chidera Nwosu", className: "JSS 3B", classId: "c-1", look: avatarLookOf("diamond", "navy") }],
    loading: false,
    failed: false,
  });
});

describe("the Learning Support list", () => {
  it("draws a child's own look where it is known, and no initials anywhere", () => {
    const { container } = render(<LearningSupportView />);

    const looks = [...container.querySelectorAll("[data-avatar-look]")].map((n) => n.getAttribute("data-avatar-look"));
    expect(looks).toEqual(["diamond-navy"]);
    expect(screen.queryByText("CN")).not.toBeInTheDocument();
    expect(screen.queryByText("EO")).not.toBeInTheDocument();
    // Both children are still named.
    expect(screen.getByText("Chidera Nwosu")).toBeInTheDocument();
    expect(screen.getByText("Emeka Obi")).toBeInTheDocument();
  });
});
