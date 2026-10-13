import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useStudentProfile } = vi.hoisted(() => ({ useStudentProfile: vi.fn() }));
vi.mock("@/hooks/useStudentProfile", () => ({ useStudentProfile }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("./LiveStudentProfile", () => ({
  LiveStudentProfile: ({ classId, classHref }: { classId?: string; classHref?: string }) => (
    <p>{`class ${classId ?? "none"} back ${classHref ?? "none"}`}</p>
  ),
}));

import { StudentRoute } from "./StudentRoute";

/**
 * The class a roster row came from reaches the live profile, which is where
 * it reads the child's observations - they are on the roster, not the
 * profile read. Dropping it on the way would leave the section silently
 * absent for every teacher.
 */
describe("the class the profile was opened from", () => {
  it("reaches the live profile alongside the way back", () => {
    useStudentProfile.mockReturnValue({ profile: { student: { id: "s-1" } }, loading: false });
    render(
      <StudentRoute fixture={null} studentId="s-1" classId="c-1" classHref="/teacher/classes/c-1" />,
    );

    expect(screen.getByText("class c-1 back /teacher/classes/c-1")).toBeInTheDocument();
  });
});
