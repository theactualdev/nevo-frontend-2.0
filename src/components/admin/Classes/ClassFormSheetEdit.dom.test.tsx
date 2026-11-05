import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AdminClass } from "@/lib/api/classes";
import { ClassFormSheet } from "./ClassFormSheet";

/**
 * Editing a class offered Section, Capacity and Academic session, sent them,
 * and said it saved - while PATCH /classes/{id} stores only the name and year
 * group (the 2 Nov audit). Controls that store nothing (Lydia, D1) come off
 * Edit; Create keeps them, because create stores them.
 */

const update = vi.fn();
const list = vi.fn();
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      update: (id: string, body: unknown) => update(id, body),
      list: () => list(),
    },
  };
});
vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return { ...actual, subjectsApi: { ...actual.subjectsApi, list: async () => [] } };
});

const CLASS = {
  id: "c-2a",
  name: "JSS 2A",
  yearGroup: "JSS2",
  section: "A",
  academicSession: "2026/27",
  capacity: 35,
} as unknown as AdminClass;

// Braced: an arrow that returns the mock has vitest call it as cleanup.
beforeEach(() => {
  update.mockReset();
  update.mockResolvedValue({ id: "c-2a", name: "JSS 2A" });
  list.mockReset();
  list.mockResolvedValue([]);
});

describe("editing a class", () => {
  it("offers only what the update keeps, and sends only that", async () => {
    render(<ClassFormSheet existing={CLASS} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText(/Section/)).toBeNull();
    expect(screen.queryByLabelText(/Capacity/)).toBeNull();
    expect(screen.queryByLabelText(/Academic session/)).toBeNull();

    fireEvent.change(screen.getByLabelText(/Class name/i), { target: { value: "JSS 2 Alpha" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("c-2a", { name: "JSS 2 Alpha", yearGroup: "JSS2" }),
    );
  });

  it("still offers them when creating, which stores them", () => {
    render(<ClassFormSheet onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText(/Section/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Capacity/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Academic session/)).toBeInTheDocument();
  });
});
