import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const { query, notFound } = vi.hoisted(() => ({
  query: { value: { data: null as unknown, failed: false, loading: true } },
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/hooks/useLiveQuery", () => ({ useLiveQuery: () => query.value }));
vi.mock("next/navigation", () => ({ notFound }));

import { LearningSupportView } from "./LearningSupportView";

/**
 * C20's Learning Support list: children with an open flagged concern, from
 * every class in the school - the SERVER's own school-wide read for a holder,
 * with names, classes and who raised it (live 4 Nov). "Nothing open right
 * now" is said only over a read that reached its end.
 */

const concern = (studentId: string, generatedAt: string, over: Record<string, unknown> = {}) => ({
  id: `e-${studentId}-${generatedAt}`,
  studentId,
  studentFirstName: "Chidera",
  studentName: "Chidera Nwosu",
  classId: "c-3b",
  className: "JSS 3B",
  teacherId: "t-1",
  teacherName: "Mr. Bello",
  note: "His written work has dropped off this fortnight.",
  recentPicture: "",
  generatedAt,
  acknowledged: false,
  ...over,
});

const read = (concerns: unknown[], complete = true) => {
  query.value = {
    data: { holders: { holders: [], viewerHoldsIt: true }, concerns: { concerns, complete } },
    failed: false,
    loading: false,
  };
};

beforeEach(() => {
  notFound.mockClear();
  query.value = { data: null, failed: false, loading: true };
});

describe("the Learning Support list", () => {
  it("lists each child once, with their class, who raised it and their words", () => {
    read([
      concern("s-1", "2026-11-03T09:00:00Z"),
      concern("s-1", "2026-10-20T09:00:00Z", { note: "An older note." }),
      concern("s-2", "2026-11-01T09:00:00Z", {
        studentName: "Emeka Obi",
        className: "JSS 1C",
        classId: "c-1c",
        teacherName: "Mr. Danjuma",
        note: "Three slow sessions running.",
      }),
    ]);
    render(<LearningSupportView />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    const first = within(rows[0]);
    expect(first.getByText("Chidera Nwosu")).toBeInTheDocument();
    expect(first.getByText("JSS 3B")).toBeInTheDocument();
    expect(first.getByText("Flagged")).toBeInTheDocument();
    expect(first.getByText("Raised by Mr. Bello")).toBeInTheDocument();
    expect(first.getByText("“His written work has dropped off this fortnight.”")).toBeInTheDocument();
    expect(first.getByText("3 November")).toBeInTheDocument();
    expect(first.getByRole("link")).toHaveAttribute("href", "/teacher/students/s-1?class=c-3b");
    expect(screen.queryByText(/An older note/)).not.toBeInTheDocument();
    // The count of a list read to its end.
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  // Lydia, copy pass, 7 Nov: "acknowledged concerns STAY on the list" - with
  // C08's line, as C20 draws Fatima's row.
  it("keeps a concern learning support has seen, with who saw it and when", () => {
    read([
      concern("s-1", "2026-10-06T09:00:00Z", {
        studentName: "Fatima Bello",
        acknowledged: true,
        acknowledgedByName: "Adaora",
        acknowledgedAt: "2026-10-10T12:00:00Z",
      }),
    ]);
    render(<LearningSupportView />);

    const row = within(screen.getByRole("listitem"));
    expect(row.getByText("Fatima Bello")).toBeInTheDocument();
    expect(row.getByText("Flagged")).toBeInTheDocument();
    expect(row.getByText("“His written work has dropped off this fortnight.”")).toBeInTheDocument();
    expect(row.getByText("Adaora from learning support saw this on 10 October.")).toBeInTheDocument();
    expect(screen.queryByText("Nothing open right now")).not.toBeInTheDocument();
  });

  it("says no one saw a concern nobody has", () => {
    read([concern("s-1", "2026-11-03T09:00:00Z")]);
    render(<LearningSupportView />);

    expect(screen.queryByText(/saw this|has seen this/)).not.toBeInTheDocument();
  });

  it("puts a concern still waiting in front of a newer one that was seen", () => {
    read([
      concern("s-1", "2026-11-03T09:00:00Z", {
        note: "Seen already.",
        acknowledged: true,
        acknowledgedByName: "Adaora",
        acknowledgedAt: "2026-11-04T09:00:00Z",
      }),
      concern("s-1", "2026-10-20T09:00:00Z", { note: "Still waiting." }),
    ]);
    render(<LearningSupportView />);

    const row = within(screen.getByRole("listitem"));
    expect(row.getByText("“Still waiting.”")).toBeInTheDocument();
    expect(row.queryByText(/saw this/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Seen already/)).not.toBeInTheDocument();
  });

  it("says nothing is open only over a read that reached its end", () => {
    read([]);
    render(<LearningSupportView />);

    expect(screen.getByRole("heading", { name: "Nothing open right now" })).toBeInTheDocument();
  });

  it("neither counts nor clears a list that stopped short", () => {
    read([concern("s-1", "2026-11-03T09:00:00Z")], false);
    render(<LearningSupportView />);

    expect(screen.getByText(/may be missing some/)).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();

    read([], false);
    render(<LearningSupportView />);
    expect(screen.queryByText("Nothing open right now")).not.toBeInTheDocument();
  });

  it("says the read failed rather than that nothing is open", () => {
    query.value = { data: null, failed: true, loading: false };
    render(<LearningSupportView />);

    expect(
      screen.getByRole("heading", { name: "We couldn’t load the open concerns just now" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nothing open right now")).not.toBeInTheDocument();
  });

  it("is nothing for a teacher who does not hold the role", () => {
    query.value = {
      data: { holders: { holders: [], viewerHoldsIt: false }, concerns: null },
      failed: false,
      loading: false,
    };

    expect(() => render(<LearningSupportView />)).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("waits, rather than deciding, while it asks", () => {
    render(<LearningSupportView />);

    expect(notFound).not.toHaveBeenCalled();
    expect(screen.queryByText("Nothing open right now")).not.toBeInTheDocument();
  });
});
