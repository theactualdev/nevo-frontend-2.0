import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type {
  AdminStudentRow,
  ConsentState,
  StudentConsent,
} from "@/lib/api/students";
import { StudentsView } from "./StudentsView";

/**
 * The roster exists to answer the consent question and could not be narrowed
 * by it - so "which families have replied" could be read row by row and no
 * other way. And the footer line SCRUM-40 says to keep by name ("it is where
 * admins learn how parent accounts come into being") was missing entirely.
 */

const list = vi.fn();
const params = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  useSearchParams: () => params,
}));

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, list: () => list() },
  };
});

vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));

const row = (
  name: string,
  consent: AdminStudentRow["consent"],
): AdminStudentRow => ({
  id: name,
  name,
  status: "active",
  ageBand: null,
  loginIdentifier: null,
  consent,
});

const withStatus = (status: ConsentState): StudentConsent => ({
  status,
  actorId: null,
  actorName: null,
  timestamp: null,
  channel: null,
});

beforeEach(() => {
  list.mockReset();
  list.mockResolvedValue([
    row("Amara Okafor", withStatus("confirmed")),
    row("Chidi Eze", withStatus("withdrawn")),
    row("Ngozi Bello", withStatus("pending")),
    row("Tunde Alao", withStatus("not_sent")),
  ]);
});

function select(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll("select")).find((s) =>
    Array.from(s.options).some((o) => o.textContent === label),
  )!;
}

describe("the consent filter", () => {
  it("narrows to withdrawn families", async () => {
    const { container } = render(<StudentsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));

    fireEvent.change(select(container, "Any consent"), {
      target: { value: "withdrawn" },
    });
    await waitFor(() =>
      expect(visibleText(container)).not.toMatch(/Amara Okafor/),
    );
    expect(visibleText(container)).toMatch(/Chidi Eze/);
  });

  it("narrows to the families nobody has written to", async () => {
    // `not_sent` is the state a student with no record comes back in. There is
    // no separate "missing record" to tell it apart from: `consent` is
    // required and non-null on the wire, confirmed against the spec 16 Sep.
    const { container } = render(<StudentsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Tunde Alao/));

    fireEvent.change(select(container, "Any consent"), {
      target: { value: "not_sent" },
    });
    await waitFor(() =>
      expect(visibleText(container)).not.toMatch(/Ngozi Bello/),
    );
    expect(visibleText(container)).toMatch(/Tunde Alao/);
  });

  it("offers no option that can never match a row", () => {
    // A "no record at all" option shipped for a day and could not match
    // anything, which reads as a school with nothing in that state.
    const { container } = render(<StudentsView />);
    return waitFor(() => {
      const options = Array.from(container.querySelectorAll("option")).map(
        (o) => o.value,
      );
      expect(options).toContain("not_sent");
      expect(options).not.toContain("none");
    });
  });
});

describe("the footer line", () => {
  it("says where a parent account comes from", async () => {
    const { container } = render(<StudentsView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /a parent account is created automatically once consent is confirmed/,
      ),
    );
  });

  it("counts what is on screen, so it stays true under a filter", async () => {
    const { container } = render(<StudentsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Showing 4 of 4/));

    fireEvent.change(select(container, "Any consent"), {
      target: { value: "withdrawn" },
    });
    await waitFor(() => expect(visibleText(container)).toMatch(/Showing 1 of 4/));
  });
});

describe("after an erasure", () => {
  it("says what the erase modal said about what is kept", async () => {
    /*
     * The notice read "Nothing of it is kept", one screen after the erase
     * modal said a small amount is kept for a statutory period. A school
     * repeats the reassuring one to a parent.
     */
    params.set("erased", "Chidi");
    const { container } = render(<StudentsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Chidi.s record has been erased/));

    expect(visibleText(container)).not.toMatch(/Nothing of it is kept/);
    expect(visibleText(container)).toMatch(/statutory period/);
    params.delete("erased");
  });
});
