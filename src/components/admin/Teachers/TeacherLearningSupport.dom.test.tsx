import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AdminClass } from "@/lib/api/classes";
import type { TeacherDetail } from "@/lib/api/teachers";

/**
 * SCRUM-247: a school's learning support staff are usually teachers, so
 * Learning Support is given on the teacher's own record too.
 */

const { teacher, holders, grant } = vi.hoisted(() => ({
  teacher: vi.fn(),
  holders: vi.fn(),
  grant: vi.fn(),
}));

vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return { ...actual, teachersApi: { ...actual.teachersApi, get: async () => teacher() } };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      teacherClasses: async () => [],
      list: async () => [] as AdminClass[],
    },
  };
});
vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return { ...actual, subjectsApi: { list: async () => [] } };
});
vi.mock("@/lib/api/learningSupport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/learningSupport")>();
  return {
    ...actual,
    learningSupportApi: { ...actual.learningSupportApi, holders: () => holders(), grant },
  };
});
vi.mock("@/lib/api/team", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/team")>();
  return {
    ...actual,
    teamApi: {
      ...actual.teamApi,
      list: async () =>
        actual.toAdminTeam([
          {
            userId: "u-bisi",
            adminId: "a-bisi",
            email: "bisi@school.edu.ng",
            firstName: "Bisi",
            lastName: "Adebayo",
            role: "senco_admin",
            status: "active",
            scopes: ["oversight"],
          },
        ]),
    },
  };
});
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, getSession: () => ({ userId: "u-me" }) };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/teachers/t1",
}));

import { TeacherDetailView } from "./TeacherDetailView";

const folake = (over: Partial<TeacherDetail> = {}): TeacherDetail =>
  ({
    id: "t1",
    name: "Folake Adeyemi",
    email: "f@school.edu.ng",
    status: "active",
    classIds: [],
    subjects: [],
    ...over,
  }) as TeacherDetail;

beforeEach(() => {
  teacher.mockResolvedValue(folake());
  holders.mockResolvedValue({ holders: [], viewerHoldsIt: true });
  grant.mockReset();
});

describe("Learning Support on a teacher's record", () => {
  it("can be given, by user id - a teacher's id is theirs", async () => {
    grant.mockResolvedValue({
      holders: [
        { userId: "t1", name: "Folake Adeyemi", role: "teacher", grantedAt: "2026-10-12T09:00:00Z", grantedBy: "u-me" },
      ],
      viewerHoldsIt: true,
    });
    render(<TeacherDetailView teacherId="t1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Give Learning Support" }));
    fireEvent.click(screen.getByRole("button", { name: "Give Learning Support" }));

    await waitFor(() => expect(grant).toHaveBeenCalledWith("t1"));
    expect(await screen.findByText(/Given by you on 12 October 2026/)).toBeInTheDocument();
  });

  it("names who gave it, from the admin team", async () => {
    holders.mockResolvedValue({
      holders: [
        { userId: "t1", name: "Folake Adeyemi", role: "teacher", grantedAt: "2026-10-03T09:00:00Z", grantedBy: "u-bisi" },
      ],
      viewerHoldsIt: true,
    });
    render(<TeacherDetailView teacherId="t1" />);
    expect(await screen.findByText(/Given by Bisi Adebayo on 3 October 2026/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Learning Support" })).toBeInTheDocument();
  });

  it("isn't on an invitation that hasn't been taken up", async () => {
    teacher.mockResolvedValue(folake({ status: "invited" }));
    render(<TeacherDetailView teacherId="t1" />);
    await screen.findByText("Folake Adeyemi");
    expect(screen.queryByText("Learning Support")).toBeNull();
  });
});
