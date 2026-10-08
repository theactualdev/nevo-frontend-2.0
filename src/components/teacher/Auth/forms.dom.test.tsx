import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { params, loginPassword, requestPasswordReset, acceptInvitation, completePasswordReset } =
  vi.hoisted(() => ({
    params: { value: new URLSearchParams() },
    loginPassword: vi.fn(),
    requestPasswordReset: vi.fn(),
    acceptInvitation: vi.fn(),
    completePasswordReset: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => params.value,
}));
vi.mock("@/lib/api", () => ({
  authApi: { loginPassword, requestPasswordReset, completePasswordReset },
  teamApi: { acceptInvitation },
}));
vi.mock("@/lib/api/auth", () => ({ authApi: { loginPassword, logout: vi.fn() } }));
vi.mock("@/lib/api/invites", () => ({ invitesApi: { acceptJoin: vi.fn() } }));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ signIn: vi.fn(), status: "guest", user: null, signOut: vi.fn() }),
}));

import { SetPasswordForm } from "./SetPasswordForm";
import { TeacherPasswordReset } from "./TeacherPasswordReset";
import { TeacherSignIn } from "./TeacherSignIn";

/**
 * C20. There was no <form> anywhere in the teacher console, so Enter did
 * nothing except in the one field each screen had wired by hand - the
 * password box on sign-in, the email box on the reset. jsdom does not perform
 * a browser's implicit submission, so these check what it depends on: every
 * field and the submit button share one form, and submitting that form does
 * the screen's work.
 *
 * And no screen had an <h1>, so a screen reader's "next heading" and
 * headings list had no top to start from.
 */

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const formOf = (label: string) => {
  const form = (screen.getByLabelText(label) as HTMLInputElement).form;
  if (!form) throw new Error(`${label} is in no form`);
  return form;
};

beforeEach(() => {
  params.value = new URLSearchParams();
  loginPassword.mockReset().mockReturnValue(new Promise(() => {}));
  requestPasswordReset.mockReset().mockResolvedValue({});
  acceptInvitation.mockReset().mockReturnValue(new Promise(() => {}));
  completePasswordReset.mockReset();
});

describe("signing in", () => {
  it("submits from the email box, not only the password box", () => {
    render(<TeacherSignIn />);
    type("Email", "ada@school.ng");
    type("Password", "lessons42");
    // Handled here, so the browser does not reload the page as well.
    expect(fireEvent.submit(formOf("Email"))).toBe(false);

    expect(loginPassword).toHaveBeenCalledTimes(1);
    expect(loginPassword).toHaveBeenCalledWith({ email: "ada@school.ng", password: "lessons42" });
  });

  it("puts both fields and Sign in in that one form", () => {
    render(<TeacherSignIn />);
    const button = screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement;

    expect(button.type).toBe("submit");
    expect(button.form).toBe(formOf("Email"));
    expect(formOf("Password")).toBe(formOf("Email"));
  });

  it("does not sign in from a form that is not ready", () => {
    render(<TeacherSignIn />);
    type("Email", "ada@school.ng");
    fireEvent.submit(formOf("Email"));

    expect(loginPassword).not.toHaveBeenCalled();
  });

  it("titles the screen with its one h1", () => {
    render(<TeacherSignIn />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome back");
  });
});

describe("asking for a reset link", () => {
  it("sends from the email box", () => {
    render(<TeacherPasswordReset />);
    type("Email", "ada@school.ng");
    // Handled here, so the browser does not reload the page as well.
    expect(fireEvent.submit(formOf("Email"))).toBe(false);

    expect(requestPasswordReset).toHaveBeenCalledTimes(1);
  });

  it("makes Send reset link that form's submit", () => {
    render(<TeacherPasswordReset />);
    const button = screen.getByRole("button", { name: "Send reset link" }) as HTMLButtonElement;

    expect(button.type).toBe("submit");
    expect(button.form).toBe(formOf("Email"));
  });

  it("titles the screen with its one h1", () => {
    render(<TeacherPasswordReset />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Reset your password");
  });
});

describe("setting a password", () => {
  beforeEach(() => {
    params.value = new URLSearchParams("token=inv-1&email=new@school.ng");
  });

  it("saves from Enter in either box, where it never answered Enter at all", () => {
    render(<SetPasswordForm mode="activation" />);
    type("Password", "lessons42");
    type("Confirm password", "lessons42");
    fireEvent.click(screen.getByRole("checkbox"));
    // Handled here, so the browser does not reload the page as well.
    expect(fireEvent.submit(formOf("Confirm password"))).toBe(false);

    expect(acceptInvitation).toHaveBeenCalledTimes(1);
  });

  it("puts both boxes and its button in that one form", () => {
    render(<SetPasswordForm mode="activation" />);
    const button = screen.getByRole("button", { name: "Activate my account" }) as HTMLButtonElement;

    expect(button.type).toBe("submit");
    expect(button.form).toBe(formOf("Password"));
    expect(formOf("Confirm password")).toBe(formOf("Password"));
  });

  it("titles the screen with its one h1", () => {
    render(<SetPasswordForm mode="activation" />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
