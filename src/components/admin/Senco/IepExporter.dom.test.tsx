import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminStudentRow } from "@/lib/api/students";
import { IepExporterView } from "./IepExporterView";

/**
 * A failed roster read turned this screen into a dead end.
 *
 * `.catch(() => setStudents([]))` left the picker with nothing to choose, so
 * `studentId` stayed "" and "Generate draft" was disabled forever, with nothing
 * anywhere on the screen saying why. A SENCo sitting down to draft an IEP
 * before a parents' meeting simply could not proceed and was told nothing.
 *
 * The GUARDIAN read in this same file got exactly this fix in #269. This is its
 * sibling, three lines above it, and it was missed.
 */

const list = vi.fn();

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      list: () => list(),
      parentLinks: async () => [],
    },
  };
});

const student = (i: number): AdminStudentRow => ({
  id: `s${i}`,
  name: `Amara Okafor ${i}`,
  loginIdentifier: `amara${i}`,
  status: "active",
  ageBand: "11-14",
  consent: { status: "not_sent", actorId: null, actorName: null, timestamp: null, channel: null },
});

describe("IepExporterView student picker", () => {
  it("says the roster read failed instead of offering an empty picker", async () => {
    list.mockRejectedValue(new Error("500"));

    const { container } = render(<IepExporterView />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn't read your student list/i),
    );
    // The wording that separates a broken GET from a school with no learners.
    expect(visibleText(container)).toMatch(/not a record that it's empty/i);
    // And the disabled button is explained rather than just inert.
    expect(visibleText(container)).toMatch(
      /nobody to choose from until that list loads/i,
    );
    expect(screen.getByRole("button", { name: "Generate draft" })).toBeDisabled();
  });

  it("offers a retry that actually re-reads", async () => {
    list.mockRejectedValueOnce(new Error("500"));
    list.mockResolvedValueOnce([student(1), student(2)]);

    const { container } = render(<IepExporterView />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    retry.click();

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Amara Okafor 1/),
    );
    expect(visibleText(container)).not.toMatch(/couldn't read your student list/i);
  });

  it("says nothing about a failure when the roster reads fine", async () => {
    list.mockResolvedValue([student(1)]);

    const { container } = render(<IepExporterView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor 1/));
    expect(visibleText(container)).not.toMatch(/couldn't read/i);
    expect(visibleText(container)).not.toMatch(/nobody to choose from/i);
  });
});

describe("opening the exporter on a child", () => {
  it("preselects the child the learner profile sent", async () => {
    list.mockResolvedValue([student(1), student(2)]);
    render(<IepExporterView initialStudentId="s2" />);
    const picker = (await screen.findByRole("combobox")) as HTMLSelectElement;
    await waitFor(() => expect(picker.value).toBe("s2"));
  });

  it("starts empty when the id is not on this school's roster", async () => {
    list.mockResolvedValue([student(1)]);
    render(<IepExporterView initialStudentId="someone-else" />);
    const picker = (await screen.findByRole("combobox")) as HTMLSelectElement;
    await waitFor(() => expect(screen.getByText("Amara Okafor 1")).toBeInTheDocument());
    expect(picker.value).toBe("");
    // The harm the picker cannot show: a draft for a child not on the roster.
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByRole("button", { name: "Generate draft" })).toBeDisabled();
  });
});
