import { chooseOption } from "@/test/nevoSelect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminStudentRow } from "@/lib/api/students";
import { StudentsView } from "./StudentsView";

/**
 * CONSENT, FOLDED INTO THE ROSTER (Lydia 19 Nov, L24, approved by Olayinka):
 * D25's tallies at the top - cleared, outstanding, and how each was given -
 * and the school-wide outstanding list as a filter on this same view, not a
 * page of its own.
 */

const list = vi.fn();
const classes = vi.fn();
const params = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => params,
}));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, list: (q: unknown) => list(q) },
  };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: () => classes() } }));

const consent = { status: "not_sent" as const, actorId: null, actorName: null, timestamp: null, channel: null };
const row = (
  id: string,
  name: string,
  over: Partial<typeof consent> | { status: "confirmed" | "pending" | "withdrawn"; channel: string | null } = {},
  status = "active",
): AdminStudentRow => ({
  id,
  name,
  status,
  ageBand: null,
  loginIdentifier: null,
  consent: { ...consent, ...over } as AdminStudentRow["consent"],
});

const CLASS = {
  id: "c1",
  name: "JSS 2A",
  code: null,
  yearGroup: "jss2",
  source: null,
  subjects: [],
  studentCount: 1,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  classes.mockResolvedValue([CLASS]);
});

const ROSTER = () => [
  row("a", "Amara Obi", { status: "confirmed", channel: "digital" }),
  row("b", "Bayo Ade", { status: "confirmed", channel: "email" }),
  row("c", "Chidi Eze", { status: "confirmed", channel: "written" }),
  // Confirmed, but by a route no frame names: cleared, and neither digital nor written.
  row("d", "Dara Demo", { status: "confirmed", channel: "test_fixture" }),
  row("e", "Efe Okon", { status: "pending", channel: "email" }),
  row("f", "Femi Lade"),
  row("g", "Gbemi Ola", { status: "withdrawn", channel: "parent_portal" }),
  // A leaver is not counted.
  row("h", "Hauwa Bello", { status: "confirmed", channel: "written" }, "deactivated"),
];

describe("D25's tallies on the roster", () => {
  it("count cleared, outstanding, and how each consent was given, over the enrolled", async () => {
    list.mockResolvedValue(ROSTER());
    const { container } = render(<StudentsView />);
    await waitFor(() => expect(container.querySelector("[data-consent-tallies]")).not.toBeNull());
    const tallies = container.querySelector("[data-consent-tallies]") as HTMLElement;
    expect(visibleText(tallies)).toBe(
      "4 cleared 3 outstanding 2 digital · 1 written how it was given",
    );
  });
});

describe("the outstanding list", () => {
  it("is a filter on this same view, school-wide", async () => {
    list.mockResolvedValue(ROSTER());
    const { container } = render(<StudentsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Obi/));
    await chooseOption(screen.getByLabelText("Filter by consent"), "Outstanding");
    const text = visibleText(container);
    for (const n of ["Efe Okon", "Femi Lade", "Gbemi Ola"]) expect(text).toMatch(n);
    for (const n of ["Amara Obi", "Bayo Ade", "Chidi Eze", "Dara Demo"]) expect(text).not.toMatch(n);
  });
});
