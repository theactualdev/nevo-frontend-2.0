import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { create, useTeacherClasses, useLessonLibrary, useStudentDirectory, useHasSession } =
  vi.hoisted(() => ({
    create: vi.fn(),
    useHasSession: vi.fn(),
    useTeacherClasses: vi.fn(),
    useLessonLibrary: vi.fn(),
    useStudentDirectory: vi.fn(),
  }));

vi.mock("@/lib/api/assignments", () => ({ assignmentsApi: { create } }));
// Confirm asks each picked lesson's review for the sign-off (Lydia, 25 Oct).
// Signed off unless a test says otherwise.
const { review } = vi.hoisted(() => ({
  review: vi.fn(async (_id: string): Promise<{ reviewComplete?: boolean }> => ({
    reviewComplete: true,
  })),
}));
vi.mock("@/lib/api/lessons", () => ({ lessonsApi: { review } }));
vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses }));
vi.mock("@/hooks/useLessonLibrary", () => ({ useLessonLibrary }));
vi.mock("@/hooks/useStudentDirectory", () => ({ useStudentDirectory }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

import { AssignWizard } from "./AssignWizard";

/**
 * THE CLASS SELECTOR'S DEFAULT (T107), ruled 14 Sep: the class the teacher
 * came from, else the first alphabetically. C07i draws step 2 that way - its
 * first class ticked. The wizard used to open the list with nothing ticked.
 */

// Deliberately not in alphabetical order, and with a two-digit year group.
const CLASSES = [
  { id: "c-sss", name: "SSS 1 Sciences", joinCode: "SS11" },
  { id: "c-10", name: "JSS 10", joinCode: "J10A" },
  { id: "c-2b", name: "JSS 2B", joinCode: "CD34" },
  { id: "c-2a", name: "JSS 2A", joinCode: "AB12" },
];

const classesRead = (options = CLASSES, over: Record<string, unknown> = {}) =>
  useTeacherClasses.mockReturnValue({
    options,
    classes: [],
    liveClasses: [],
    live: true,
    loading: false,
    sample: false,
    ...over,
  });

beforeEach(() => {
  create.mockReset().mockResolvedValue({ createdCount: 1 });
  classesRead();
  useLessonLibrary.mockReturnValue({
    cards: [{ id: "l-1", title: "Fractions 3", meta: "Mathematics", kind: "normal" }],
    live: true,
    sample: false,
    loading: false,
    slow: false,
  });
  useStudentDirectory.mockReturnValue({ students: [], loading: false, failed: false });
  useHasSession.mockReturnValue(true);
});

const toStep2 = (preselectClass?: string) => {
  const view = render(<AssignWizard preselect="l-1" preselectClass={preselectClass} />);
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  return view;
};
const ticked = () =>
  screen.queryAllByRole("button", { pressed: true }).map((b) => b.textContent ?? "");

describe("arriving directly", () => {
  it("ticks the first class alphabetically, reading year groups as numbers", () => {
    toStep2();

    expect(ticked()).toHaveLength(1);
    expect(ticked()[0]).toMatch(/JSS 2A/);
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("ticks it once the class list arrives, too", () => {
    classesRead([], { loading: true, live: false });
    const { rerender } = toStep2();
    expect(ticked()).toHaveLength(0);

    classesRead();
    rerender(<AssignWizard preselect="l-1" />);

    expect(ticked()[0]).toMatch(/JSS 2A/);
  });

  it("ticks nothing when the teacher has no classes", () => {
    classesRead([]);
    toStep2();

    expect(ticked()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});

describe("arriving from a class", () => {
  it("ticks that class instead", () => {
    toStep2("c-sss");

    expect(ticked()).toHaveLength(1);
    expect(ticked()[0]).toMatch(/SSS 1 Sciences/);
  });

  it("falls back to the first alphabetically when that class is not theirs", () => {
    toStep2("c-elsewhere");

    expect(ticked()[0]).toMatch(/JSS 2A/);
  });
});

describe("once the teacher touches the list", () => {
  it("is theirs - un-ticking the default leaves nothing chosen", () => {
    toStep2();
    fireEvent.click(screen.getByRole("button", { name: /JSS 2A/ }));

    expect(ticked()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("adds to the default rather than replacing it", () => {
    toStep2();
    fireEvent.click(screen.getByRole("button", { name: /JSS 2B/ }));

    // In the list's own order, which is the server's.
    expect(ticked().sort()).toEqual(["JSS 2A", "JSS 2B"]);
  });

  it("does not bring the default back after a detour through specific students", () => {
    toStep2();
    fireEvent.click(screen.getByRole("button", { name: "Specific students" }));
    fireEvent.click(screen.getByRole("button", { name: "Whole class" }));

    expect(ticked()).toHaveLength(0);
  });

  it("sends the default class when the teacher simply goes on", async () => {
    toStep2();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ classId: "c-2a" }));
  });
});
