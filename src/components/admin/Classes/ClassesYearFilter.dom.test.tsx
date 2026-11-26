import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { chooseOption, optionNames, selectStandIns } from "@/test/nevoSelect";
import type { AdminClass } from "@/lib/api/classes";
import { ClassesView } from "./ClassesView";

/**
 * The Classes year filter offers the school's own year groups (Hub, 24 Nov;
 * whether it stays at all is L78). It offered all seventeen, so a school
 * running two could choose fifteen that only ever returned nothing.
 */

const list = vi.fn();
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      list: (includeArchived?: boolean) => list(includeArchived),
      classTeachers: async () => [],
    },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const klass = (id: string, yearGroup: string, archivedAt: string | null = null): AdminClass => ({
  id,
  name: `Class ${id}`,
  code: null,
  yearGroup,
  source: null,
  subjects: [],
  studentCount: 10,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt,
});

const ACTIVE = [klass("a", "jss2"), klass("b", "ss1"), klass("c", "jss2")];
const ARCHIVED = klass("old", "jss1", "2026-07-31T00:00:00Z");

beforeAll(() => selectStandIns());

describe("the Classes year filter", () => {
  it("offers only the year groups this school's classes use, in order", async () => {
    list.mockResolvedValue(ACTIVE);
    render(<ClassesView />);
    const trigger = await screen.findByRole("combobox", { name: "Filter by year group" });
    expect(optionNames(trigger)).toEqual(["All years", "JSS 2", "SS 1"]);
  });

  it("filters the list by the year chosen", async () => {
    list.mockResolvedValue(ACTIVE);
    const { container } = render(<ClassesView />);
    const trigger = await screen.findByRole("combobox", { name: "Filter by year group" });
    await chooseOption(trigger, "SS 1");
    await waitFor(() => expect(visibleText(container)).not.toMatch(/Class a/));
    expect(visibleText(container)).toMatch(/Class b/);
  });

  it("shows no filter with only one year group to choose", async () => {
    list.mockResolvedValue([klass("a", "jss2"), klass("c", "jss2")]);
    const { container } = render(<ClassesView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Class c/));
    expect(screen.queryByRole("combobox", { name: "Filter by year group" })).toBeNull();
  });

  it("offers an archived class's year only while archived classes are shown", async () => {
    list.mockImplementation((includeArchived?: boolean) =>
      Promise.resolve(includeArchived ? [...ACTIVE, ARCHIVED] : ACTIVE),
    );
    render(<ClassesView />);
    const before = await screen.findByRole("combobox", { name: "Filter by year group" });
    expect(optionNames(before)).not.toContain("JSS 1");
    fireEvent.click(await screen.findByRole("button", { name: "Show archived" }));
    await waitFor(() =>
      expect(optionNames(screen.getByRole("combobox", { name: "Filter by year group" }))).toContain("JSS 1"),
    );
  });
});
