import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AdminClass } from "@/lib/api/classes";
import type { TeacherDetail } from "@/lib/api/teachers";

/**
 * SCRUM-247: a school's learning support staff are usually teachers, so
 * Learning Support is given on the teacher's own record too - D03b's same
 * line, at the same weight, under "Permissions" (design 9d0ff6b).
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

/** This year, so the line never carries one. */
const YEAR = new Date().getFullYear();
const FOLAKE_HOLDS = {
  userId: "t1",
  name: "Folake Adeyemi",
  role: "teacher",
  grantedAt: `${YEAR}-10-03T09:00:00Z`,
  grantedBy: "u-bisi",
  grantedByName: "Bisi Adebayo",
};
const BISI_HOLDS = {
  userId: "u-bisi",
  name: "Bisi Adebayo",
  role: "senco_admin",
  grantedAt: `${YEAR}-10-01T09:00:00Z`,
  grantedBy: "u-founder",
  grantedByName: "Ngozi Eze",
};

beforeEach(() => {
  teacher.mockResolvedValue(folake());
  holders.mockResolvedValue({ holders: [], viewerHoldsIt: true });
  grant.mockReset();
});

describe("Learning Support on a teacher's record", () => {
  it("can be given, by user id - a teacher's id is theirs", async () => {
    grant.mockResolvedValue({
      holders: [
        { userId: "t1", name: "Folake Adeyemi", role: "teacher", grantedAt: `${YEAR}-10-12T09:00:00Z`, grantedBy: "u-me" },
      ],
      viewerHoldsIt: true,
    });
    render(<TeacherDetailView teacherId="t1" />);
    expect(await screen.findByText("Permissions")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Learning Support for Folake Adeyemi" }));

    await waitFor(() => expect(grant).toHaveBeenCalledWith("t1"));
    expect(await screen.findByText("Granted by you · 12 October")).toBeInTheDocument();
  });

  it("names who gave it", async () => {
    holders.mockResolvedValue({
      holders: [FOLAKE_HOLDS, BISI_HOLDS],
      viewerHoldsIt: true,
    });
    render(<TeacherDetailView teacherId="t1" />);
    expect(await screen.findByText("Granted by Bisi Adebayo · 3 October")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Learning Support for Folake Adeyemi" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("keeps the only holder's access, and says why before anything is handed over", async () => {
    holders.mockResolvedValue({ holders: [FOLAKE_HOLDS], viewerHoldsIt: false });
    render(<TeacherDetailView teacherId="t1" />);
    expect(
      await screen.findByText(
        "Folake Adeyemi is the only person in your school with Learning Support, so their access can't be removed. Give Learning Support to someone else first, then remove their access.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove admin-side access" })).toBeDisabled();
  });

  it("lets their access go once somebody else holds it too", async () => {
    holders.mockResolvedValue({ holders: [FOLAKE_HOLDS, BISI_HOLDS], viewerHoldsIt: true });
    render(<TeacherDetailView teacherId="t1" />);
    await screen.findByText(/Granted by Bisi Adebayo/);
    expect(screen.getByRole("button", { name: "Remove admin-side access" })).toBeEnabled();
    expect(screen.queryByText(/only person in your school/)).toBeNull();
  });

  it("isn't on an invitation that hasn't been taken up", async () => {
    teacher.mockResolvedValue(folake({ status: "invited" }));
    render(<TeacherDetailView teacherId="t1" />);
    await screen.findByText("Folake Adeyemi");
    expect(screen.queryByText("Learning Support")).toBeNull();
    expect(screen.queryByText("Permissions")).toBeNull();
  });
});
