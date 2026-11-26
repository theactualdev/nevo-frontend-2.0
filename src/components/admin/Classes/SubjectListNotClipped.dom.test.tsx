import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { AdminClass } from "@/lib/api/classes";
import type { TeacherDetail } from "@/lib/api/teachers";
import { TeacherDetailView } from "../Teachers/TeacherDetailView";
import { ClassDetailView } from "./ClassDetailView";

/**
 * TO-DO item 6 (Olayinka, 25 Nov): "'Subjects They Teach' section of an
 * individual teacher in the teachers tab: When You try to add a new subject to
 * the subjects they teach, everything is covered and cut off so you can't see
 * the lists of All Subjects."
 *
 * The picker's list opens below its field, out over the card - and the card
 * was the house CARD, which clips (`overflow-hidden`) for its rounded corners.
 * So everything past the card's edge was cut away: the list, its Done button,
 * often every row. Class detail's "Subjects this class takes" is the same
 * picker in the same card, and was cut off the same way.
 *
 * jsdom draws nothing, so this checks what decides it: nothing between the
 * open list and the page clips.
 */

const CLIPS = /(^|\s)overflow(-[xy])?-(hidden|clip)(\s|$)/;

/** Every box the open list sits inside that would cut it off. */
function clippers(panel: HTMLElement): string[] {
  const found: string[] = [];
  for (let el = panel.parentElement; el && el !== document.body; el = el.parentElement) {
    if (CLIPS.test(el.className)) found.push(el.className);
  }
  return found;
}

async function openList(): Promise<HTMLElement> {
  const field = await screen.findByRole("combobox", { name: "Add a subject" });
  fireEvent.focus(field);
  await screen.findByText("All subjects");
  const panel = document.getElementById(field.getAttribute("aria-controls") ?? "");
  expect(panel).not.toBeNull();
  return panel as HTMLElement;
}

const SUBJECTS = [
  { id: "s-maths", name: "Mathematics", displayName: "Mathematics", origin: "canonical", reviewState: "kept" },
  { id: "s-bio", name: "Biology", displayName: "Biology", origin: "canonical", reviewState: "kept" },
  { id: "s-chem", name: "Chemistry", displayName: "Chemistry", origin: "canonical", reviewState: "kept" },
];

const TEACHER: TeacherDetail = {
  id: "t1",
  name: "Folake Adeyemi",
  email: "f@school.edu.ng",
  status: "active",
  classIds: [],
  subjects: ["Mathematics"],
};

const KLASS: AdminClass = {
  id: "c1",
  name: "JSS 2A",
  code: "JSS2A",
  yearGroup: "jss2",
  source: null,
  subjects: ["Mathematics"],
  studentCount: 0,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt: null,
};

const listSubjects = vi.fn();

vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return { ...actual, subjectsApi: { ...actual.subjectsApi, list: () => listSubjects(), canonical: async () => [] } };
});

vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return { ...actual, teachersApi: { ...actual.teachersApi, get: async () => TEACHER } };
});

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      get: async () => KLASS,
      list: async () => [KLASS],
      teacherClasses: async () => [],
      classTeachers: async () => [],
      classStudents: async () => [],
    },
  };
});

// Class detail reads its students as an admin on another branch in check 19;
// answered here too, so this test stands either way.
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, list: async () => [] } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  listSubjects.mockResolvedValue(SUBJECTS);
});

describe("the subject list opens out of its card, never cut off by it", () => {
  it("on a teacher's page, Subjects they teach", async () => {
    render(<TeacherDetailView teacherId="t1" />);
    const panel = await openList();
    expect(screen.getByRole("checkbox", { name: "Chemistry" })).toBeInTheDocument();
    expect(clippers(panel)).toEqual([]);
  });

  it("on a class's page, Subjects this class takes", async () => {
    render(<ClassDetailView classId="c1" />);
    const panel = await openList();
    expect(screen.getByRole("checkbox", { name: "Chemistry" })).toBeInTheDocument();
    expect(clippers(panel)).toEqual([]);
  });
});

/*
 * Unclipped, a list opened low on the screen still starts below the fold. It
 * is brought into view as it opens - once, the nearest scroll - and typing in
 * it never moves the page again.
 */
describe("a list opened low on the screen", () => {
  const scrolled: { el: Element; arg: unknown }[] = [];
  beforeEach(() => {
    scrolled.length = 0;
    // jsdom has no scrollIntoView; this records who asked for one.
    Element.prototype.scrollIntoView = function (this: Element, arg?: unknown) {
      scrolled.push({ el: this, arg });
    } as Element["scrollIntoView"];
    return () => {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    };
  });

  it("is brought into view as it opens, and not again as you type", async () => {
    render(<TeacherDetailView teacherId="t1" />);
    const panel = await openList();
    expect(scrolled).toEqual([{ el: panel, arg: { block: "nearest" } }]);

    fireEvent.change(screen.getByRole("combobox", { name: "Add a subject" }), { target: { value: "Bio" } });
    await screen.findByText("Matching subjects");
    expect(scrolled).toHaveLength(1);
  });
});
