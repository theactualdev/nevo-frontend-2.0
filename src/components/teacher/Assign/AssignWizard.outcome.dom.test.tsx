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
// Confirm asks each picked lesson's review for the sign-off; signed off here.
vi.mock("@/lib/api/lessons", () => ({
  lessonsApi: { review: vi.fn(async () => ({ reviewComplete: true })) },
}));
vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses }));
vi.mock("@/hooks/useLessonLibrary", () => ({ useLessonLibrary }));
vi.mock("@/hooks/useStudentDirectory", () => ({ useStudentDirectory }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

import { AssignWizard } from "./AssignWizard";

/**
 * A LINE IS ABOUT THE CHOICES IT WAS SAID ABOUT (Hub, 9 Nov, from a live
 * assign test). "Those 3 students already have this lesson, so nothing was
 * sent again." was right about Heat Transfer and SS 1B - and was still on
 * screen after the teacher went back and picked Osmosis, on Osmosis's confirm
 * step, where it was untrue.
 */

const DUPLICATES = "Those 3 students already have this lesson, so nothing was sent again.";

beforeEach(() => {
  create.mockReset().mockResolvedValue({ assignmentIds: [], createdCount: 0, duplicateCount: 3 });
  useTeacherClasses.mockReturnValue({
    options: [
      { id: "c-1", name: "SS 1B", joinCode: "AB12" },
      { id: "c-2", name: "JSS 2B", joinCode: "CD34" },
    ],
    classes: [],
    liveClasses: [],
    live: true,
    loading: false,
    sample: false,
  });
  useLessonLibrary.mockReturnValue({
    cards: [
      { id: "l-1", title: "Heat Transfer", meta: "Physics", kind: "normal" },
      { id: "l-2", title: "Osmosis", meta: "Biology", kind: "normal" },
    ],
    live: true,
    sample: false,
    loading: false,
    slow: false,
  });
  useStudentDirectory.mockReturnValue({ students: [], loading: false, failed: false });
  useHasSession.mockReturnValue(true);
});

const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/** Heat Transfer to SS 1B, available now: the server says they all have it. */
const sendHeatTransfer = async () => {
  render(<AssignWizard preselect="l-1" preselectClass="c-1" />);
  press("Continue");
  press("Continue");
  press("Continue");
  press("Confirm assignment");
  expect(await screen.findByText(DUPLICATES)).toBeInTheDocument();
};

describe("the line about what was sent", () => {
  it("goes when the teacher goes back and changes the lesson (the live defect)", async () => {
    await sendHeatTransfer();

    press("Back");
    press("Back");
    press("Back");
    press(/Heat Transfer/);
    press(/Osmosis/);

    expect(screen.queryByText(DUPLICATES)).not.toBeInTheDocument();
    press("Continue");
    press("Continue");
    press("Continue");
    // Osmosis's confirm step, before anything is sent for it.
    expect(screen.getByRole("button", { name: "Confirm assignment" })).toBeInTheDocument();
    expect(screen.queryByText(DUPLICATES)).not.toBeInTheDocument();
  });

  it("goes when the classes change", async () => {
    await sendHeatTransfer();

    press("Back");
    press("Back");
    press(/JSS 2B/);

    expect(screen.queryByText(DUPLICATES)).not.toBeInTheDocument();
  });

  it("goes when the time changes", async () => {
    await sendHeatTransfer();

    press("Back");
    press("Schedule for later");

    expect(screen.queryByText(DUPLICATES)).not.toBeInTheDocument();
  });

  it("stays while the choices it was about are still the choices", async () => {
    await sendHeatTransfer();

    press("Back");
    press("Back");

    expect(screen.getByText(DUPLICATES)).toBeInTheDocument();
  });

  it("is said again, about the new choices, when they are sent", async () => {
    await sendHeatTransfer();
    press("Back");
    press("Back");
    press("Back");
    press(/Heat Transfer/);
    press(/Osmosis/);
    press("Continue");
    press("Continue");
    press("Continue");
    press("Confirm assignment");

    expect(await screen.findByText(DUPLICATES)).toBeInTheDocument();
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ lessonIds: ["l-2"] }));
  });
});
