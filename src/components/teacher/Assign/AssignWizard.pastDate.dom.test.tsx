import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

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
 * C04, and C07i's "Chosen date has passed". "Schedule for later" took any
 * moment at all - one already behind the teacher included - and sent it. It
 * now refuses, offers the soonest day that same time can open, and checks
 * again on the way out, because a lesson can sit on step 4 while its moment
 * passes.
 *
 * Only `Date` is faked: the clock is Sunday 13 July 2025 at 10:00, local.
 */

const NOW = new Date(2025, 6, 13, 10, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  create.mockReset().mockResolvedValue({ createdCount: 1 });
  useTeacherClasses.mockReturnValue({
    options: [{ id: "c-1", name: "JSS 2A", joinCode: "AB12" }],
    classes: [],
    liveClasses: [],
    live: true,
    loading: false,
    sample: false,
  });
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

afterEach(() => {
  vi.useRealTimers();
});

const continueBtn = () => screen.getByRole("button", { name: "Continue" });

/** Lesson chosen, class chosen, on to "when", and "Schedule for later" picked. */
const toLater = () => {
  render(<AssignWizard preselect="l-1" />);
  fireEvent.click(continueBtn());
  // JSS 2A, the only class, is ticked by default (the 14 Sep ruling).
  fireEvent.click(continueBtn());
  fireEvent.click(screen.getByRole("button", { name: "Schedule for later" }));
};
const dateInput = () => document.querySelector<HTMLInputElement>('input[type="date"]')!;
const timeInput = () => document.querySelector<HTMLInputElement>('input[type="time"]')!;

describe("a moment still to come", () => {
  it("goes through without a word - tomorrow at 08:00 is the default", () => {
    toLater();

    expect(dateInput()).toHaveValue("2025-07-14");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(continueBtn()).toBeEnabled();
  });

  it("offers no day before today in the picker", () => {
    toLater();

    expect(dateInput()).toHaveAttribute("min", "2025-07-13");
  });
});

describe("a date that has passed", () => {
  it("is refused, with the soonest day that same time can open", () => {
    toLater();
    fireEvent.change(dateInput(), { target: { value: "2025-07-08" } });

    // 08:00 today is already behind us, so the soonest is tomorrow.
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That date has already passed. The soonest you can open this is Monday 14 July.",
    );
    expect(continueBtn()).toBeDisabled();
    expect(dateInput()).toHaveAttribute("aria-invalid", "true");
  });

  it("offers today when the chosen time is still ahead today", () => {
    toLater();
    fireEvent.change(timeInput(), { target: { value: "15:30" } });
    fireEvent.change(dateInput(), { target: { value: "2025-07-08" } });

    expect(screen.getByRole("alert")).toHaveTextContent("The soonest you can open this is Sunday 13 July.");
  });

  it("takes the offered day in one press, and lets them on", () => {
    toLater();
    fireEvent.change(dateInput(), { target: { value: "2025-07-08" } });
    fireEvent.click(screen.getByRole("button", { name: "Use Monday 14 July" }));

    expect(dateInput()).toHaveValue("2025-07-14");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(continueBtn()).toBeEnabled();
  });

  it("is refused when only the time has slipped behind, today", () => {
    toLater();
    fireEvent.change(dateInput(), { target: { value: "2025-07-13" } });
    fireEvent.change(timeInput(), { target: { value: "09:00" } });

    expect(screen.getByRole("alert")).toHaveTextContent("Monday 14 July");
    expect(continueBtn()).toBeDisabled();
  });

  it("clears when the teacher picks a day ahead themselves", () => {
    toLater();
    fireEvent.change(dateInput(), { target: { value: "2025-07-08" } });
    fireEvent.change(dateInput(), { target: { value: "2025-07-20" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(continueBtn()).toBeEnabled();
  });

  it("says nothing once they go back to Available now", () => {
    toLater();
    fireEvent.change(dateInput(), { target: { value: "2025-07-08" } });
    fireEvent.click(screen.getByRole("button", { name: "Available now" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(continueBtn()).toBeEnabled();
  });
});

describe("a moment that passes while they decide", () => {
  it("is caught at Continue, not sent", () => {
    toLater();
    fireEvent.change(dateInput(), { target: { value: "2025-07-13" } });
    fireEvent.change(timeInput(), { target: { value: "10:05" } });
    expect(continueBtn()).toBeEnabled();

    vi.setSystemTime(new Date(2025, 6, 13, 10, 6));
    fireEvent.click(continueBtn());

    expect(screen.getByRole("alert")).toHaveTextContent("Monday 14 July");
    expect(screen.queryByRole("button", { name: "Confirm assignment" })).not.toBeInTheDocument();
  });

  it("is caught at Confirm, and sends them back to choose again", async () => {
    toLater();
    fireEvent.change(dateInput(), { target: { value: "2025-07-13" } });
    fireEvent.change(timeInput(), { target: { value: "10:05" } });
    fireEvent.click(continueBtn());
    expect(screen.getByRole("button", { name: "Confirm assignment" })).toBeInTheDocument();

    vi.setSystemTime(new Date(2025, 6, 13, 10, 6));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
    });

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Monday 14 July");
    expect(dateInput()).toBeInTheDocument();
  });

  it("sends the moment when it is still ahead at Confirm", async () => {
    toLater();
    fireEvent.click(continueBtn());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirm assignment" }));
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ availableFrom: new Date(2025, 6, 14, 8, 0).toISOString() }),
    );
  });
});
