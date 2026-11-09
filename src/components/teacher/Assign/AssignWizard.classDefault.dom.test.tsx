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
 * NO CLASS IS CHOSEN FOR THE TEACHER, except the one they came from (Hub,
 * 9 Nov, from a live assign test). The 14 Sep default ticked the first class
 * alphabetically (T107; C07i draws step 2 with its first class ticked), and
 * picking another ADDED to it - so a teacher who picked SS 1B was about to
 * send the lesson to JSS 2B as well, a class nobody chose.
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
  it("ticks no class, and waits for the teacher to choose one", () => {
    toStep2();

    expect(ticked()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("still ticks none once the class list arrives", () => {
    classesRead([], { loading: true, live: false });
    const { rerender } = toStep2();
    expect(ticked()).toHaveLength(0);

    classesRead();
    rerender(<AssignWizard preselect="l-1" />);

    expect(ticked()).toHaveLength(0);
  });

  it("ticks nothing when the teacher has no classes", () => {
    classesRead([]);
    toStep2();

    expect(ticked()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});

describe("arriving from a class", () => {
  it("ticks that class, and only that one", () => {
    toStep2("c-sss");

    expect(ticked()).toHaveLength(1);
    expect(ticked()[0]).toMatch(/SSS 1 Sciences/);
  });

  it("ticks it once the class list arrives, too", () => {
    classesRead([], { loading: true, live: false });
    const { rerender } = toStep2("c-sss");
    expect(ticked()).toHaveLength(0);

    classesRead();
    rerender(<AssignWizard preselect="l-1" preselectClass="c-sss" />);

    expect(ticked()).toEqual([expect.stringMatching(/SSS 1 Sciences/)]);
  });

  it("ticks nothing when that class is not theirs - never a stand-in", () => {
    toStep2("c-elsewhere");

    expect(ticked()).toHaveLength(0);
  });
});

describe("once the teacher touches the list", () => {
  it("is exactly the class they picked - nothing ticked beside it (the live defect)", () => {
    toStep2();
    fireEvent.click(screen.getByRole("button", { name: /SSS 1 Sciences/ }));

    expect(ticked()).toEqual([expect.stringMatching(/SSS 1 Sciences/)]);
  });

  it("is theirs - un-ticking the class they came from leaves nothing chosen", () => {
    toStep2("c-sss");
    fireEvent.click(screen.getByRole("button", { name: /SSS 1 Sciences/ }));

    expect(ticked()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("adds to the class they came from when they pick another", () => {
    toStep2("c-sss");
    fireEvent.click(screen.getByRole("button", { name: /JSS 2B/ }));

    expect(ticked().sort()).toEqual(["JSS 2B", "SSS 1 Sciences"]);
  });

  it("does not bring the class they came from back after a detour through specific students", () => {
    toStep2("c-sss");
    fireEvent.click(screen.getByRole("button", { name: "Specific students" }));
    fireEvent.click(screen.getByRole("button", { name: "Whole class" }));

    expect(ticked()).toHaveLength(0);
  });

  it("sends only the class they picked", async () => {
    toStep2();
    fireEvent.click(screen.getByRole("button", { name: /JSS 2B/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ classId: "c-2b" }));
  });
});
