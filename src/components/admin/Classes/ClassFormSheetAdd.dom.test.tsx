import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminClass } from "@/lib/api/classes";
import { ClassFormSheet } from "./ClassFormSheet";

/**
 * BACKLOG 77: D05's "Add a class", in SCRUM-40's right-docked sheet - its
 * title and line, the subjects straight after the name, Section and Academic
 * session side by side before Capacity, and a way to the class a name collides
 * with, not only its name.
 */

const list = vi.fn();
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: { ...actual.classesApi, list: () => list() },
  };
});
vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return { ...actual, subjectsApi: { ...actual.subjectsApi, list: async () => [] } };
});

const klass = (over: Partial<AdminClass>): AdminClass =>
  ({
    id: "c-2a",
    name: "JSS 2A",
    yearGroup: "JSS2",
    section: null,
    academicSession: null,
    capacity: null,
    archivedAt: null,
    ...over,
  }) as unknown as AdminClass;

const ids = (container: HTMLElement) =>
  Array.from(container.ownerDocument.querySelectorAll("label[for]")).map((l) =>
    l.getAttribute("for"),
  );

// Braced: an arrow that returns the mock has vitest call it as cleanup.
beforeEach(() => {
  list.mockReset();
  list.mockResolvedValue([klass({})]);
});

describe("Add a class", () => {
  it("is D05's title and line, not ours", () => {
    const { container } = render(<ClassFormSheet onClose={vi.fn()} onSaved={vi.fn()} />);
    const text = visibleText(container.ownerDocument.body);
    expect(text).toMatch(/Add a class/);
    expect(text).toMatch(
      /One class at a time\. Nevo checks it against the classes you already have before it.s created\./,
    );
    expect(text).not.toMatch(/Create a class/);
    expect(text).not.toMatch(/It can be renamed later/);
  });

  it("asks in D05's order: name, subjects, year group, section, session, capacity", () => {
    const { container } = render(<ClassFormSheet onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(ids(container)).toEqual([
      "class-name",
      "class-subjects",
      "class-year",
      "class-section",
      "class-session",
      "class-capacity",
    ]);
  });

  it("links to the class a new name collides with", async () => {
    const { container } = render(<ClassFormSheet onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Class name/i), { target: { value: "jss 2a" } });

    const link = await screen.findByRole("link", { name: "open the existing class" });
    expect(link.getAttribute("href")).toBe("/admin/classes/c-2a");
    expect(visibleText(container.ownerDocument.body)).toMatch(
      /This matches JSS 2A, which already exists.*Rename this one, or open the existing class instead\./,
    );
  });

  it("does not link an archived one: its note says to restore it", async () => {
    list.mockResolvedValue([klass({ archivedAt: "2026-07-01T00:00:00Z" } as Partial<AdminClass>)]);
    const { container } = render(<ClassFormSheet onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Class name/i), { target: { value: "JSS 2A" } });

    await screen.findByText(/but is archived/);
    expect(screen.queryByRole("link")).toBeNull();
    expect(visibleText(container.ownerDocument.body)).toMatch(/Restore it instead/);
  });

  it("brings Back to the class being edited, when an edit collides", async () => {
    list.mockResolvedValue([klass({}), klass({ id: "c-2b", name: "JSS 2B" })]);
    render(
      <ClassFormSheet existing={klass({})} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText(/Class name/i), { target: { value: "JSS 2B" } });

    const link = await screen.findByRole("link", { name: "open the existing class" });
    expect(link.getAttribute("href")).toBe(
      "/admin/classes/c-2b?back=%2Fadmin%2Fclasses%2Fc-2a&backLabel=JSS%202A",
    );
  });
});
