import { chooseOption } from "@/test/nevoSelect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminStudentRow } from "@/lib/api/students";
import { StudentsView } from "./StudentsView";

/**
 * L24 (Lydia, 25 Nov): "The Written and Digital filters go on the roster" -
 * the tallies' "how it was given", as filters on the same consent menu,
 * listing exactly the confirmed consents each tally counts.
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
  // Confirmed by a route no frame names: neither written nor digital.
  row("d", "Dara Demo", { status: "confirmed", channel: "test_fixture" }),
  row("e", "Efe Okon", { status: "pending", channel: "email" }),
  // Asked in writing but not answered: not a written consent.
  row("f", "Femi Lade", { status: "pending", channel: "written" }),
];

describe("how a consent was given, as a filter on the roster (L24)", () => {
  it("Written lists the consents given in writing, and only confirmed ones", async () => {
    list.mockResolvedValue(ROSTER());
    const { container } = render(<StudentsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Obi/));
    await chooseOption(screen.getByLabelText("Filter by consent"), "Written");
    const text = visibleText(container);
    expect(text).toMatch("Chidi Eze");
    for (const n of ["Amara Obi", "Bayo Ade", "Dara Demo", "Efe Okon", "Femi Lade"]) expect(text).not.toMatch(n);
  });

  it("Digital lists the consents given digitally, as the tally counts them", async () => {
    list.mockResolvedValue(ROSTER());
    const { container } = render(<StudentsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Obi/));
    const tallies = container.querySelector("[data-consent-tallies]") as HTMLElement;
    expect(visibleText(tallies)).toMatch(/2 digital · 1 written/);
    await chooseOption(screen.getByLabelText("Filter by consent"), "Digital");
    const text = visibleText(container);
    for (const n of ["Amara Obi", "Bayo Ade"]) expect(text).toMatch(n);
    for (const n of ["Chidi Eze", "Dara Demo", "Efe Okon", "Femi Lade"]) expect(text).not.toMatch(n);
  });
});
