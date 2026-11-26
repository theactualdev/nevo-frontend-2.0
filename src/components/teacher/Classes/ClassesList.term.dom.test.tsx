import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { TeacherClasses } from "@/hooks/useTeacherClasses";

const h = vi.hoisted(() => ({
  useTeacherClasses: vi.fn(),
  useCurrentUser: vi.fn(),
  useTeacherHome: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses: h.useTeacherClasses }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: h.useCurrentUser }));
vi.mock("@/hooks/useTeacherHome", () => ({ useTeacherHome: h.useTeacherHome }));
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return { ...actual, classesApi: { ...actual.classesApi, get: (id: string) => h.get(id) } };
});

import { ClassesList } from "./ClassesList";

/**
 * THE TERM ON THE SCHOOL LINE (backlog item 6; Teslim T11, live 21 Nov): C05's
 * "Brightgate Academy · Second term", in the server's words - "Term 2 ·
 * 2026/27" - from one of this teacher's classes. No term set, no term said.
 */

const live = (): TeacherClasses =>
  ({
    classes: [],
    liveClasses: [
      { assignmentId: "a1", classId: "c-1", className: "JSS 2A", classCode: null, role: "primary", assignedAt: null, subjectId: null, subject: "Mathematics" },
    ],
    options: [],
    live: true,
    loading: false,
    sample: false,
  }) as unknown as TeacherClasses;

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.useTeacherClasses.mockReturnValue(live());
  h.useCurrentUser.mockReturnValue({ school: "Brightgate Academy" });
  h.useTeacherHome.mockReturnValue({ pulse: [] });
});

describe("the school line's term", () => {
  it("says the term the server names, after the school", async () => {
    h.get.mockResolvedValue({ id: "c-1", term: "Term 2 · 2026/27" });
    render(<ClassesList />);

    expect(await screen.findByText("Brightgate Academy · Term 2 · 2026/27")).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledWith("c-1");
  });

  it("says the school alone when no term dates are set", async () => {
    h.get.mockResolvedValue({ id: "c-1", term: null });
    render(<ClassesList />);

    await waitFor(() => expect(h.get).toHaveBeenCalled());
    expect(screen.getByText("Brightgate Academy")).toBeInTheDocument();
    expect(screen.queryByText(/Term/)).not.toBeInTheDocument();
  });

  it("says the school alone when the class read fails", async () => {
    h.get.mockRejectedValue(new Error("500"));
    render(<ClassesList />);

    await waitFor(() => expect(h.get).toHaveBeenCalled());
    expect(screen.getByText("Brightgate Academy")).toBeInTheDocument();
  });
});
