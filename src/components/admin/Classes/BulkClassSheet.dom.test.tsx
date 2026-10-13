import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminClass } from "@/lib/api/classes";
import { BulkClassSheet } from "./BulkClassSheet";

/**
 * D05's "Add several at once" is a grid of year groups, each with its own
 * sections or streams, composed into one preview and one send. The sheet took
 * one year group per visit and letters only, so "SS 1 Sciences" could not be
 * made at all.
 */

const list = vi.fn();
const createMany = vi.fn();

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

const cls = (name: string, yearGroup: string, over: Partial<AdminClass> = {}): AdminClass =>
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
    ...over,
  }) as AdminClass;

const row = (label: string) => screen.findByRole("group", { name: label });

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([
    cls("JSS 1A", "jss1"),
    cls("SS 1 Arts", "ss1"),
    // Archived: its name is taken, but it does not put JSS 3 on the grid.
    cls("JSS 3A", "jss3", { archivedAt: "2026-07-01T00:00:00Z" }),
  ]);
  createMany.mockResolvedValue({ created: [{}, {}, {}], rejected: [] });
});

describe("Add several at once", () => {
  it("starts from the year groups the school runs, streaming the senior ones", async () => {
    render(<BulkClassSheet onClose={() => {}} onCreated={() => {}} />);
    const jss1 = await row("JSS 1");
    const ss1 = await row("SS 1");
    expect(screen.queryByRole("group", { name: "JSS 3" })).toBeNull();
    expect(within(jss1).getByRole("button", { name: "A" })).toBeInTheDocument();
    expect(within(ss1).getByRole("button", { name: "Sciences" })).toBeInTheDocument();
  });

  it("creates across several year groups in one send, each with its own year and the school's session", async () => {
    const { container } = render(<BulkClassSheet onClose={() => {}} onCreated={() => {}} />);
    const jss1 = await row("JSS 1");
    const ss1 = await row("SS 1");
    fireEvent.click(within(jss1).getByRole("button", { name: "A" }));
    fireEvent.click(within(jss1).getByRole("button", { name: "B" }));
    fireEvent.click(within(ss1).getByRole("button", { name: "Sciences" }));
    fireEvent.click(within(ss1).getByRole("button", { name: "Arts" }));

    const text = visibleText(container);
    expect(text).toMatch(/SS 1 Sciences/);
    // JSS 1A and SS 1 Arts exist already; two new ones remain.
    expect(text).toMatch(/2 classes will be created in the 2026\/27 session/);
    expect(text).toMatch(/2 are already there/);

    fireEvent.click(screen.getByRole("button", { name: "Create 2 classes" }));
    await waitFor(() => expect(createMany).toHaveBeenCalled());
    expect(createMany).toHaveBeenCalledWith([
      { name: "JSS 1B", yearGroup: "jss1", section: "B", academicSession: "2026/27" },
      { name: "SS 1 Sciences", yearGroup: "ss1", section: "Sciences", academicSession: "2026/27" },
    ]);
  });

  it("adds any other year group, and lets a row switch between sections and streams", async () => {
    const { container } = render(<BulkClassSheet onClose={() => {}} onCreated={() => {}} />);
    await row("JSS 1");
    fireEvent.change(screen.getByLabelText("Add a year group"), { target: { value: "ss2" } });
    const ss2 = await row("SS 2");

    fireEvent.click(within(ss2).getByRole("button", { name: /use sections/ }));
    fireEvent.click(within(ss2).getByRole("button", { name: "C" }));
    expect(visibleText(container)).toMatch(/SS 2C/);
    expect(within(ss2).queryByRole("button", { name: "Sciences" })).toBeNull();
  });

  it("says when it could not read the school's classes, and tries again", async () => {
    list.mockRejectedValueOnce(new Error("500"));
    render(<BulkClassSheet onClose={() => {}} onCreated={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await row("JSS 1");
  });
});
