import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const { updateMe, publishIdentity, show } = vi.hoisted(() => ({
  updateMe: vi.fn(),
  publishIdentity: vi.fn(),
  show: vi.fn(),
}));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUserStatus: () => ({
    identity: {
      userId: "t-1",
      name: "Amina Bello",
      initials: "AB",
      email: "amina@school.test",
      school: "E2E",
      subjects: ["Mathematics"],
      photoUrl: null,
      chosenName: null,
    },
    status: "ready",
  }),
  publishIdentity,
  uploadPhoto: vi.fn(),
}));
vi.mock("@/lib/api/users", () => ({ usersApi: { updateMe } }));
vi.mock("@/hooks/useTeacherSettings", () => ({
  useTeacherSettings: () => ({
    values: { attention: true, messages: true, reports: true },
    ready: true,
    failed: false,
    set: vi.fn(),
    save: vi.fn(),
    saveState: "idle",
  }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ reducedMotion: false, textSize: "m", setReducedMotion: vi.fn(), setTextSize: vi.fn() }),
}));
vi.mock("@/components/shared/SystemMessages", () => ({
  useSystemMessages: () => ({ show, resolve: vi.fn(), dismiss: vi.fn() }),
}));

import { ProfileSettings } from "./ProfileSettings";

/**
 * T237. One name field on screen, two on the API - and the write that turns
 * one into the other had no test. Nor did what follows it: the rail taking the
 * new name, and the confirmation.
 */

const editTo = (name: string, subjects?: string) => {
  render(<ProfileSettings />);
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const dialog = screen.getByRole("dialog", { name: "Edit profile" });
  fireEvent.change(within(dialog).getByLabelText("Full name"), { target: { value: name } });
  if (subjects !== undefined) {
    fireEvent.change(within(dialog).getByLabelText("Subjects"), { target: { value: subjects } });
  }
  fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
};

const SAVED = { id: "t-1", firstName: "Amina", lastName: "Okafor-Bello" };

beforeEach(() => {
  updateMe.mockReset().mockResolvedValue(SAVED);
  publishIdentity.mockReset();
  show.mockReset();
});

describe("saving a name", () => {
  it("splits it at the last space: the surname after, everything else before", async () => {
    editTo("Mary Ann Okafor");

    await waitFor(() => expect(updateMe).toHaveBeenCalled());
    expect(updateMe.mock.calls[0][0]).toEqual(
      expect.objectContaining({ firstName: "Mary Ann", lastName: "Okafor" }),
    );
  });

  it("sends a single name whole, rather than refusing it", async () => {
    editTo("Chidinma");

    await waitFor(() => expect(updateMe).toHaveBeenCalled());
    expect(updateMe.mock.calls[0][0]).toEqual(
      expect.objectContaining({ firstName: "Chidinma", lastName: "" }),
    );
  });

  it("ignores the spaces around a name", async () => {
    editTo("  Amina Bello  ");

    await waitFor(() => expect(updateMe).toHaveBeenCalled());
    expect(updateMe.mock.calls[0][0]).toEqual(
      expect.objectContaining({ firstName: "Amina", lastName: "Bello" }),
    );
  });

  it("sends the subjects as a list, without the blanks", async () => {
    editTo("Amina Bello", "Mathematics, Further Maths, ,");

    await waitFor(() => expect(updateMe).toHaveBeenCalled());
    expect(updateMe.mock.calls[0][0].subjects).toEqual(["Mathematics", "Further Maths"]);
  });
});

describe("once the name is saved", () => {
  it("hands the server's answer to the rail, so it does not show the old name", async () => {
    editTo("Amina Okafor-Bello");

    await waitFor(() => expect(publishIdentity).toHaveBeenCalledWith(SAVED));
  });

  it("says so in the shared bar, and closes", async () => {
    editTo("Amina Okafor-Bello");

    await waitFor(() =>
      expect(show).toHaveBeenCalledWith({ kind: "confirm", message: "Profile updated" }),
    );
    expect(screen.queryByRole("dialog", { name: "Edit profile" })).not.toBeInTheDocument();
  });
});

describe("a name that did not save", () => {
  beforeEach(() => {
    updateMe.mockRejectedValue(new Error("network"));
  });

  it("keeps the sheet open on Try again, and tells the rail nothing", async () => {
    editTo("Amina Okafor-Bello");

    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(publishIdentity).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
  });
});
