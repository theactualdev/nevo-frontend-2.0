import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const { useClassRoster, clearPin } = vi.hoisted(() => ({
  useClassRoster: vi.fn(),
  clearPin: vi.fn(),
}));
vi.mock("@/hooks/useClassRoster", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClassRoster")>()),
  useClassRoster,
}));
vi.mock("@/hooks/useTeacherClasses", () => ({
  useTeacherClasses: () => ({ liveClasses: [{ classId: "c-1", className: "JSS 2A" }] }),
}));
vi.mock("@/lib/api/students", () => ({ studentsApi: { clearPin } }));

import { ClearPinScreen } from "./ClearPinScreen";

/**
 * C19 B3 / B3b (design, 12 Oct): "Clear PIN is the one that has to work with
 * one thumb, in front of a waiting child." The page a "forgot PIN"
 * notification opens on a phone.
 */

const row = (over: Record<string, unknown> = {}) => ({
  studentId: "s-1",
  firstName: "Amara",
  lastName: "Okafor",
  displayName: "Amara Okafor",
  loginIdentifier: "amara.o",
  admissionNumber: "BGA/2118",
  status: "active",
  pinResetRequested: true,
  pinCleared: false,
  ...over,
});

const roster = (students: unknown[], extra = {}) =>
  useClassRoster.mockReturnValue({ students, loading: false, failed: false, ...extra });

beforeEach(() => {
  useClassRoster.mockReset();
  clearPin.mockReset();
});

describe("a child who asked for a new PIN", () => {
  it("says who, with the ID labelled, and offers the one action at the foot", () => {
    roster([row()]);
    render(<ClearPinScreen studentId="s-1" classId="c-1" />);

    expect(screen.getByRole("heading", { name: "Amara Okafor" })).toBeInTheDocument();
    expect(screen.getByText("Student ID / Admission Number").parentElement).toHaveTextContent(
      "Student ID / Admission Number amara.o · BGA/2118",
    );
    expect(screen.getByText(/Amara asked for a new PIN/)).toBeInTheDocument();
    expect(screen.getByText("You won’t be able to see the new PIN. Only Amara will know it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear Amara’s PIN" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Not now" })).toHaveAttribute("href", "/teacher/classes/c-1");
  });

  it("goes back to the class roster, by the class's name", () => {
    roster([row()]);
    render(<ClearPinScreen studentId="s-1" classId="c-1" />);

    expect(screen.getByRole("link", { name: "JSS 2A · Roster" })).toHaveAttribute("href", "/teacher/classes/c-1");
  });

  it("clears it, then says so (B3b)", async () => {
    roster([row()]);
    clearPin.mockResolvedValue({});
    render(<ClearPinScreen studentId="s-1" classId="c-1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Clear Amara’s PIN" }));
    });

    expect(clearPin).toHaveBeenCalledWith("s-1");
    expect(screen.getByRole("heading", { name: "Amara’s PIN is cleared" })).toBeInTheDocument();
    expect(screen.getByText("Amara chooses a new PIN at the next sign-in.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", "/teacher/classes/c-1");
  });

  it("says so, in the roster's words, when the clear does not land", async () => {
    roster([row()]);
    clearPin.mockRejectedValue(new Error("down"));
    render(<ClearPinScreen studentId="s-1" classId="c-1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Clear Amara’s PIN" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn’t clear Amara’s PIN just now. Nothing has changed. Try again in a moment.",
    );
    expect(screen.queryByText(/PIN is cleared/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear Amara’s PIN" })).toBeEnabled();
  });
});

describe("what the screen says when it cannot clear", () => {
  it("offers no clear on a deactivated account, and says why", () => {
    roster([row({ status: "deactivated" })]);
    render(<ClearPinScreen studentId="s-1" classId="c-1" />);

    expect(screen.queryByRole("button", { name: /Clear/ })).not.toBeInTheDocument();
    expect(screen.getByText(/can’t sign in while the account is deactivated/)).toBeInTheDocument();
  });

  it("says a PIN somebody already cleared is cleared", () => {
    roster([row({ pinCleared: true })]);
    render(<ClearPinScreen studentId="s-1" classId="c-1" />);

    expect(screen.getByRole("heading", { name: "Amara’s PIN is cleared" })).toBeInTheDocument();
    expect(clearPin).not.toHaveBeenCalled();
  });

  it("names nobody when the link carries no class", () => {
    render(<ClearPinScreen studentId="s-1" />);

    expect(useClassRoster).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Clear/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to My Classes" })).toHaveAttribute("href", "/teacher/classes");
  });

  it("names nobody when the child is not on that roster, or the read failed", () => {
    roster([row({ studentId: "someone-else" })]);
    const { unmount } = render(<ClearPinScreen studentId="s-1" classId="c-1" />);
    expect(screen.queryByRole("button", { name: /Clear/ })).not.toBeInTheDocument();
    unmount();

    roster([], { failed: true });
    render(<ClearPinScreen studentId="s-1" classId="c-1" />);
    expect(screen.queryByRole("button", { name: /Clear/ })).not.toBeInTheDocument();
  });
});
