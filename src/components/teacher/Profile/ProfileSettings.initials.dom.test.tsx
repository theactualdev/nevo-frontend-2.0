import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const { useHasSession, useCurrentUser } = vi.hoisted(() => ({
  useHasSession: vi.fn(),
  useCurrentUser: vi.fn(),
}));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser,
  // The profile page reads the identity WITH its status now (loading, ready
  // or failed). These tests are about a loaded identity, so it is ready.
  useCurrentUserStatus: () => ({ identity: useCurrentUser(), status: "ready" }),
  publishIdentity: vi.fn(),
  uploadPhoto: vi.fn(),
}));
vi.mock("@/hooks/useTeacherSettings", () => ({
  useTeacherSettings: () => ({ values: {}, set: vi.fn(), save: vi.fn(), loading: false }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ preferences: {}, update: vi.fn(), setPreference: vi.fn() }),
}));

import { ProfileSettings } from "./ProfileSettings";
import { TEACHER_PROFILE } from "@/lib/mocks/teacherProfile";

/**
 * The edit dialog's avatar, for a teacher with no photo.
 *
 * Name, email and subjects were swapped for the teacher's own; the initials
 * were not, so every signed-in teacher without a photo saw the fixture's
 * "MA" on their own profile - on the one screen where a teacher reads the
 * details as theirs.
 */

beforeEach(() => {
  useHasSession.mockReturnValue(true);
  useCurrentUser.mockReturnValue({
    name: "Ola Bello",
    email: "ola@school.ng",
    initials: "OB",
    subjects: ["Mathematics"],
    photoUrl: null,
    role: "teacher",
  });
});

const openEdit = () =>
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));

describe("the edit dialog's initials", () => {
  it("are the teacher's own, not the fixture's", () => {
    render(<ProfileSettings />);
    openEdit();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("OB")).toBeInTheDocument();
    expect(within(dialog).queryByText(TEACHER_PROFILE.initials)).not.toBeInTheDocument();
  });

  it("are the fixture's only on the signed-out walkthrough", () => {
    useHasSession.mockReturnValue(false);
    useCurrentUser.mockReturnValue(null);
    render(<ProfileSettings />);
    openEdit();

    expect(within(screen.getByRole("dialog")).getByText(TEACHER_PROFILE.initials)).toBeInTheDocument();
  });
});
