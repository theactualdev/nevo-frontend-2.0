import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { save, show } = vi.hoisted(() => ({ save: vi.fn(), show: vi.fn() }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUserStatus: () => ({
    identity: { userId: "t-1", name: "Ms A", initials: "MA", email: "a@school.test", school: "E2E", subjects: [], photoUrl: null, chosenName: null },
    status: "ready",
  }),
  publishIdentity: vi.fn(),
  uploadPhoto: vi.fn(),
}));
vi.mock("@/hooks/useTeacherSettings", () => ({
  useTeacherSettings: () => ({
    values: { attention: true, messages: true, reports: true },
    ready: true,
    failed: false,
    set: vi.fn(),
    save,
    saveState: "idle",
    loading: false,
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
 * Frame 43: one shared bar, used everywhere. C14's NevoToast on this screen
 * was its own, and its failure cleared itself after three seconds - where
 * SM-03 says a failure stays until it is dismissed.
 */

const dirtyThenSave = () => {
  // A notification row makes the page dirty; the accessibility rows do not.
  fireEvent.click(screen.getByRole("switch", { name: "Something changed suddenly" }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
};

beforeEach(() => {
  save.mockReset();
  show.mockReset();
});

describe("saving settings", () => {
  it("confirms a save in the shared bar", async () => {
    save.mockResolvedValue(true);
    render(<ProfileSettings />);
    dirtyThenSave();

    await waitFor(() =>
      expect(show).toHaveBeenCalledWith({ kind: "confirm", message: "Settings saved" }),
    );
  });

  it("reports a failed save as a failure, which stays until dismissed", async () => {
    save.mockResolvedValue(false);
    render(<ProfileSettings />);
    dirtyThenSave();

    await waitFor(() =>
      expect(show).toHaveBeenCalledWith({ kind: "failed", message: "We couldn’t save that. Try again" }),
    );
  });

  it("draws no toast of its own", async () => {
    save.mockResolvedValue(true);
    render(<ProfileSettings />);
    dirtyThenSave();

    await waitFor(() => expect(show).toHaveBeenCalled());
    expect(screen.queryByText("Settings saved")).not.toBeInTheDocument();
  });
});
