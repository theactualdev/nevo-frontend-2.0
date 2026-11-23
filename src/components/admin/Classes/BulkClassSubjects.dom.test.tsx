import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminClass } from "@/lib/api/classes";
import type { SchoolSubject } from "@/lib/api/subjects";
import { BulkClassSheet } from "./BulkClassSheet";

/**
 * SUBJECTS FOR EACH CLASS IN ADD SEVERAL (D05, D27; SCRUM-194; backlog 25, 26,
 * 51-53, 108, 109). Bulk-made classes went out with none, so no teacher could
 * be assigned to any of them until each was set one at a time.
 *
 *  - Each composed class is a row: name, D27's compact picker (three pills,
 *    then "+N more"), and Copy down.
 *  - Copy down ONLY EVER ADDS, to every row below or rows in the same year,
 *    and the grid then shows one confirmation line with Undo.
 *  - Each class is sent with its own subjects; a class with none sends none.
 */

const list = vi.fn();
const createMany = vi.fn();
const subjects = vi.fn();

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      list: () => list(),
      createMany: (body: unknown) => createMany(body),
    },
  };
});
vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return {
    ...actual,
    subjectsApi: {
      ...actual.subjectsApi,
      list: () => subjects(),
      canonical: async () => [],
    },
  };
});

const cls = (name: string, yearGroup: string): AdminClass =>
  ({
    id: name,
    name,
    code: null,
    yearGroup,
    source: null,
    subjects: [],
    studentCount: 0,
    section: null,
    academicSession: "2026/27",
    capacity: null,
    teacherCount: 0,
    teachers: [],
    archivedAt: null,
  }) as AdminClass;

const subject = (name: string): SchoolSubject => ({
  id: name,
  name,
  displayName: name,
  origin: "canonical",
  reviewState: "approved",
});
const NAMES = ["Mathematics", "English Language", "Basic Science", "Civic Education", "Yoruba"];

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([cls("JSS 1A", "jss1"), cls("SS 1 Arts", "ss1")]);
  subjects.mockResolvedValue(NAMES.map(subject));
  createMany.mockResolvedValue({ created: [{}, {}, {}], rejected: [] });
});

/** JSS 1B, JSS 1C and SS 1 Sciences to send; JSS 1A already there. */
async function reachGrid() {
  const utils = render(<BulkClassSheet onClose={() => {}} onCreated={() => {}} />);
  const jss1 = await screen.findByRole("group", { name: "JSS 1" });
  const ss1 = screen.getByRole("group", { name: "SS 1" });
  for (const s of ["A", "B", "C"]) fireEvent.click(within(jss1).getByRole("button", { name: s }));
  fireEvent.click(within(ss1).getByRole("button", { name: "Sciences" }));
  await waitFor(() => expect(subjects).toHaveBeenCalled());
  return utils;
}

const gridRow = (container: HTMLElement, name: string) =>
  container.querySelector(`[data-bulk-row="${name}"]`) as HTMLElement;

/** Opens a row's picker and ticks these subjects. */
async function pick(container: HTMLElement, name: string, ...names: string[]) {
  const r = gridRow(container, name);
  fireEvent.focus(within(r).getByRole("combobox", { name: "Add a subject" }));
  for (const n of names) fireEvent.click(await within(r).findByRole("checkbox", { name: n }));
  fireEvent.click(within(r).getByRole("button", { name: "Done" }));
}

describe("Subjects for each class", () => {
  it("gives every class to be sent its own row, picker and Copy down; one already there gets neither", async () => {
    const { container } = await reachGrid();
    expect(visibleText(container)).toMatch(/Subjects for each class · 3 classes/);
    for (const n of ["JSS 1B", "JSS 1C", "SS 1 Sciences"]) {
      const r = gridRow(container, n);
      expect(within(r).getByRole("combobox", { name: "Add a subject" })).toBeInTheDocument();
      expect(within(r).getByRole("button", { name: `Copy ${n}'s subjects down` })).toBeInTheDocument();
    }
    const there = gridRow(container, "JSS 1A");
    expect(within(there).queryByRole("combobox")).toBeNull();
    expect(within(there).queryByRole("button", { name: /Copy/ })).toBeNull();
  });

  it("sends each class with its own subjects, and a class with none with none", async () => {
    const { container } = await reachGrid();
    await pick(container, "JSS 1B", "Mathematics", "Yoruba");
    fireEvent.click(screen.getByRole("button", { name: "Create 3 classes" }));
    await waitFor(() => expect(createMany).toHaveBeenCalled());
    const sent = createMany.mock.calls[0][0] as { name: string; subjects?: string[] }[];
    expect(sent.find((c) => c.name === "JSS 1B")?.subjects).toEqual(["Mathematics", "Yoruba"]);
    expect(sent.find((c) => c.name === "JSS 1C")).not.toHaveProperty("subjects");
    expect(sent.find((c) => c.name === "SS 1 Sciences")).not.toHaveProperty("subjects");
  });

  it("collapses to three pills and '+N more' while closed (D27's compact cell)", async () => {
    const { container } = await reachGrid();
    await pick(container, "JSS 1B", "Mathematics", "English Language", "Basic Science", "Civic Education", "Yoruba");
    const r = gridRow(container, "JSS 1B");
    expect(within(r).getAllByRole("button", { name: /^Remove / })).toHaveLength(3);
    expect(visibleText(r)).toMatch(/\+2 more/);
  });
});

describe("Copy down", () => {
  it("has nothing to copy until the row has subjects", async () => {
    const { container } = await reachGrid();
    expect(
      within(gridRow(container, "JSS 1B")).getByRole("button", { name: "Copy JSS 1B's subjects down" }),
    ).toBeDisabled();
  });

  it("offers every row below and the same year only, with counts and the 'only adds' line - and no undrawn 'Choose rows'", async () => {
    const { container } = await reachGrid();
    await pick(container, "JSS 1B", "Mathematics", "Yoruba");
    fireEvent.click(screen.getByRole("button", { name: "Copy JSS 1B's subjects down" }));
    const menu = screen.getByRole("menu");
    expect(visibleText(menu)).toMatch(/Copy JSS 1B's 2 subjects to/);
    expect(within(menu).getByRole("menuitem", { name: /Every row below\s*2 rows/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Rows in the same year only\s*1 row/ })).toBeInTheDocument();
    expect(visibleText(menu)).toMatch(/Adds to anything already on those rows\. Nothing is removed\./);
    expect(visibleText(menu)).not.toMatch(/Choose rows/);
  });

  it("only ever adds: a row keeps what it had and gains what it lacked, with no repeats", async () => {
    const { container } = await reachGrid();
    await pick(container, "JSS 1C", "Yoruba");
    await pick(container, "JSS 1B", "Mathematics", "Yoruba");
    fireEvent.click(screen.getByRole("button", { name: "Copy JSS 1B's subjects down" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Every row below/ }));

    expect(visibleText(container)).toMatch(
      /JSS 1B's 2 subjects copied to the rows below\. Each row can still be changed on its own\./,
    );
    fireEvent.click(screen.getByRole("button", { name: "Create 3 classes" }));
    await waitFor(() => expect(createMany).toHaveBeenCalled());
    const sent = createMany.mock.calls[0][0] as { name: string; subjects?: string[] }[];
    expect(sent.find((c) => c.name === "JSS 1C")?.subjects).toEqual(["Yoruba", "Mathematics"]);
    expect(sent.find((c) => c.name === "SS 1 Sciences")?.subjects).toEqual(["Mathematics", "Yoruba"]);
  });

  it("the same year only reaches the rows in that year", async () => {
    const { container } = await reachGrid();
    await pick(container, "JSS 1B", "Mathematics");
    fireEvent.click(screen.getByRole("button", { name: "Copy JSS 1B's subjects down" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Rows in the same year only/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create 3 classes" }));
    await waitFor(() => expect(createMany).toHaveBeenCalled());
    const sent = createMany.mock.calls[0][0] as { name: string; subjects?: string[] }[];
    expect(sent.find((c) => c.name === "JSS 1C")?.subjects).toEqual(["Mathematics"]);
    expect(sent.find((c) => c.name === "SS 1 Sciences")).not.toHaveProperty("subjects");
  });

  it("Undo puts every row back as it was", async () => {
    const { container } = await reachGrid();
    await pick(container, "JSS 1B", "Mathematics");
    fireEvent.click(screen.getByRole("button", { name: "Copy JSS 1B's subjects down" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Every row below/ }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(visibleText(container)).not.toMatch(/copied to the rows below/);
    fireEvent.click(screen.getByRole("button", { name: "Create 3 classes" }));
    await waitFor(() => expect(createMany).toHaveBeenCalled());
    const sent = createMany.mock.calls[0][0] as { name: string; subjects?: string[] }[];
    expect(sent.find((c) => c.name === "JSS 1C")).not.toHaveProperty("subjects");
    expect(sent.find((c) => c.name === "JSS 1B")?.subjects).toEqual(["Mathematics"]);
  });

  it("an edit after the copy retires its Undo, so Undo can never take back later work", async () => {
    const { container } = await reachGrid();
    await pick(container, "JSS 1B", "Mathematics");
    fireEvent.click(screen.getByRole("button", { name: "Copy JSS 1B's subjects down" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Every row below/ }));
    await pick(container, "JSS 1C", "Yoruba");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});
