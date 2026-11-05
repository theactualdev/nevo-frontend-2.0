import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  signedIn: { value: true },
  classes: vi.fn(),
  home: vi.fn(),
  identity: vi.fn(),
  publishIdentity: vi.fn(),
  uploadPhoto: vi.fn(),
  updateMe: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace, prefetch: vi.fn() }),
}));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => h.signedIn.value }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses: h.classes }));
vi.mock("@/hooks/useTeacherHome", () => ({ useTeacherHome: h.home }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: h.identity,
  publishIdentity: h.publishIdentity,
  uploadPhoto: h.uploadPhoto,
}));
vi.mock("@/lib/api/users", () => ({ usersApi: { updateMe: h.updateMe } }));

import { TeacherWelcome } from "./TeacherWelcome";

/**
 * C01's steps after the password (backlog, 2 Nov): the join confirmation, the
 * light profile, and a brief hold into the console - in the frame's words.
 */

const assignment = (classId: string, className: string, subject: string | null) => ({
  assignmentId: `a-${classId}-${subject}`,
  classId,
  className,
  classCode: null,
  role: "primary",
  assignedAt: "2026-11-01T09:00:00Z",
  subject,
});

const IDENTITY = {
  userId: "t-1",
  role: "teacher",
  name: "Adunni Adeyemi",
  initials: "AA",
  email: "a@school.test",
  school: "Brightgate Academy",
  schoolCode: "BRGT",
  subjects: ["Biology"],
  photoUrl: null,
  chosenName: null,
};

beforeEach(() => {
  for (const fn of [h.push, h.replace, h.publishIdentity, h.uploadPhoto, h.updateMe]) fn.mockReset();
  h.signedIn.value = true;
  h.classes.mockReturnValue({
    liveClasses: [
      assignment("c-1", "JSS 2A", "Biology"),
      assignment("c-1", "JSS 2A", "Chemistry"),
      assignment("c-2", "SSS 1", "Biology"),
    ],
    loading: false,
    sample: false,
  });
  h.home.mockReturnValue({ pulse: [{ classId: "c-1", studentCount: 28 }] });
  h.identity.mockReturnValue(IDENTITY);
  h.updateMe.mockResolvedValue({ id: "t-1" });
});

describe("the join confirmation", () => {
  it("shows each class once, with its subjects and headcount, in the frame's words", () => {
    render(<TeacherWelcome />);

    expect(
      screen.getByRole("heading", { name: "You’re in. Here’s what you’re teaching:" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Two classes are set up and waiting for you.")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Biology · Chemistry")).toBeInTheDocument();
    expect(screen.getByText("28 students")).toBeInTheDocument();
  });

  it("says plainly when the school has not given them a class yet", () => {
    h.classes.mockReturnValue({ liveClasses: [], loading: false, sample: false });
    render(<TeacherWelcome />);

    expect(screen.getByText(/hasn’t given you a class yet/)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("says the classes couldn't load rather than that there are none", () => {
    h.classes.mockReturnValue({ liveClasses: [], loading: false, sample: true });
    render(<TeacherWelcome />);

    expect(screen.getByText(/couldn’t load your classes just now/)).toBeInTheDocument();
  });
});

describe("the profile", () => {
  const toProfile = () => {
    render(<TeacherWelcome />);
    fireEvent.click(screen.getByRole("button", { name: "Set up my profile" }));
  };

  it("starts from the name and subjects the school set up", () => {
    toProfile();

    expect(screen.getByRole("heading", { name: "A little about you" })).toBeInTheDocument();
    expect((screen.getByLabelText("Your name") as HTMLInputElement).value).toBe("Adunni Adeyemi");
    expect(screen.getByText("Biology")).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
  });

  it("saves the name and subjects, then holds on 'All set' and goes to the dashboard", async () => {
    toProfile();
    fireEvent.change(screen.getByLabelText("Subject area(s)"), { target: { value: "Chemistry" } });
    fireEvent.keyDown(screen.getByLabelText("Subject area(s)"), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Remove Biology" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to my dashboard" }));

    await waitFor(() =>
      expect(h.updateMe).toHaveBeenCalledWith({
        firstName: "Adunni",
        lastName: "Adeyemi",
        subjects: ["Chemistry"],
      }),
    );
    expect(await screen.findByRole("heading", { name: "All set, Adunni." })).toBeInTheDocument();
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/teacher/dashboard"), { timeout: 3000 });
  });

  it("will not save without a name", () => {
    toProfile();
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "  " } });

    expect(screen.getByRole("button", { name: "Continue to my dashboard" })).toBeDisabled();
  });

  it("says so when the save fails, and stays", async () => {
    h.updateMe.mockRejectedValue(new Error("network"));
    toProfile();
    fireEvent.click(screen.getByRole("button", { name: "Continue to my dashboard" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That didn’t save just now.");
    expect(screen.getByRole("heading", { name: "A little about you" })).toBeInTheDocument();
  });
});

describe("with no session", () => {
  it("sends them to the teacher door", async () => {
    h.signedIn.value = false;
    render(<TeacherWelcome />);

    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/auth/teacher"));
  });
});
