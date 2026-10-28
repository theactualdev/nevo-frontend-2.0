import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";

const { requestCode, verifyCode, setSession } = vi.hoisted(() => ({
  requestCode: vi.fn(),
  verifyCode: vi.fn(),
  setSession: vi.fn(),
}));

// Replaced wholesale: pulling the real module in alongside `client.ts` hangs
// the jsdom worker. Same reason as `ParentConsent.test.tsx`.
vi.mock("@/lib/api/parent", () => ({ parentApi: { requestCode, verifyCode } }));
vi.mock("@/lib/auth/session", () => ({ setSession }));

import { ParentSignIn } from "./ParentSignIn";

/**
 * D03 Parent Sign-In.
 *
 * WHAT ITS ABSENCE COST. A parent's only way into the portal was the original
 * consent link, and that link dies - the invitation carries `expiresAt`, and a
 * spent token 404s. So a parent who consented, closed the tab and came back a
 * week later had no route in, and the portal told them to "Open the link your
 * school sent you". D01c exists to guarantee an NDPA right, and a right you
 * cannot reach is not one.
 *
 * THE PROPERTY THIS FILE EXISTS FOR is the universal response. D03: "whatever
 * the parent types, the next screen is the same, so it never reveals whether an
 * account exists for that address." Backend holds the same line - `request-code`
 * answers 202 either way, because "a 'we could not find an account' reply on a
 * surface tied to named children is a way to find out which families use Nevo,
 * one address at a time."
 *
 * So the assertions below are mostly NEGATIVE: what the screen must never say.
 * A test that signing in works would pass against a screen that also leaked.
 */

const SESSION = {
  accessToken: "parent-tok",
  tokenType: "bearer",
  expiresAt: "2026-12-01T00:00:00Z",
  userId: "p-1",
  role: "parent_guardian",
  replacedSession: false,
};

const typeContact = (v: string) => {
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: v },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
};

const typeCode = (code: string) =>
  [...code].forEach((d, i) =>
    fireEvent.change(screen.getByLabelText(`Digit ${i + 1} of 4`), {
      target: { value: d },
    }),
  );

beforeEach(() => {
  requestCode.mockReset();
  verifyCode.mockReset();
  setSession.mockReset();
  requestCode.mockResolvedValue({ sent: true, expiresAt: "2026-12-01T00:10:00Z" });
});

describe("the universal response", () => {
  it("says the same thing whether or not the contact is known", async () => {
    // There is no signal to branch on - 202 either way - so there must be no
    // branch. The copy is the same for every address.
    render(<ParentSignIn />);
    typeContact("ada.okoro@example.com");

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(
      screen.getByText(/If that address has an account, we’ve sent a code/),
    ).toBeInTheDocument();
  });

  it("never claims an address is unknown, even when the send fails", async () => {
    // A transport failure is ours. Reporting it as "we don't recognise that"
    // would leak precisely what the 202 exists to hide.
    requestCode.mockRejectedValueOnce(new ApiError(500, "boom", {}));
    render(<ParentSignIn />);
    typeContact("ada.okoro@example.com");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn’t send that code/i);
    expect(alert).not.toHaveTextContent(/recognis|not found|no account|don’t know/i);
  });

  it("offers no way to discover whether an account exists", () => {
    // Belt and braces on the whole screen: none of these words belong on it.
    const { container } = render(<ParentSignIn />);

    expect(container.textContent).not.toMatch(/no account|not found|unrecognis|unknown/i);
  });
});

describe("email only", () => {
  it("refuses a phone number at the field, because no code goes to a phone", () => {
    // SCRUM-126. Parent contact has been email only since SCRUM-162 (20 Sep),
    // and the backend's `ParentContactMethod` is `email` alone, so a code
    // "sent" to a phone went nowhere while the screen said "Check your phone".
    render(<ParentSignIn />);
    typeContact("+234 803 123 4567");

    expect(screen.getByRole("alert")).toHaveTextContent(/Enter an email address/i);
    expect(screen.queryByText("Check your phone")).not.toBeInTheDocument();
    expect(requestCode).not.toHaveBeenCalled();
  });

  it("sends no token, because a returning parent has no invitation", () => {
    // The consent flow binds the code to the school's contact with a token.
    // Here the parent types it, so there is nothing to bind to, and passing a
    // stale token would be worse than passing none.
    render(<ParentSignIn />);
    typeContact("ada.okoro@example.com");

    expect(requestCode).toHaveBeenCalledWith("ada.okoro@example.com");
    expect(requestCode.mock.calls[0]).toHaveLength(1);
  });

  it("rejects something that isn't an address, without implying it is unknown", () => {
    render(<ParentSignIn />);
    typeContact("hello");

    expect(screen.getByRole("alert")).toHaveTextContent(/Enter an email address/i);
    expect(requestCode).not.toHaveBeenCalled();
  });
});

describe("the code", () => {
  const reachCode = async () => {
    render(<ParentSignIn />);
    typeContact("ada.okoro@example.com");
    return screen.findByLabelText("Digit 1 of 4");
  };

  it("exchanges a code for a session and opens the portal", async () => {
    verifyCode.mockResolvedValueOnce(SESSION);
    await reachCode();
    typeCode("1234");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(verifyCode).toHaveBeenCalledWith("ada.okoro@example.com", "1234");
    await vi.waitFor(() =>
      expect(setSession).toHaveBeenCalledWith({
        token: "parent-tok",
        expiresAt: "2026-12-01T00:00:00Z",
        userId: "p-1",
        role: "parent_guardian",
      }),
    );
  });

  it("gives one message for a wrong code and an expired one", async () => {
    // The contract has ONE failure code for both, deliberately: "expired"
    // confirms a code was issued, which confirms the contact is known.
    verifyCode.mockRejectedValueOnce(
      new ApiError(401, "unauthorized", { detail: { code: "code_invalid" } }),
    );
    await reachCode();
    typeCode("1234");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/wrong/i);
    expect(alert).toHaveTextContent(/expired/i);
    expect(setSession).not.toHaveBeenCalled();
  });

  it("will not verify a part-typed code", async () => {
    await reachCode();
    typeCode("12");

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(verifyCode).not.toHaveBeenCalled();
  });

  it("says a resent code retires the one before it", async () => {
    await reachCode();
    fireEvent.click(screen.getByRole("button", { name: "Send it again" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer works/i);
    expect(requestCode).toHaveBeenCalledTimes(2);
  });

  it("lets a parent go back and try a different email", async () => {
    await reachCode();
    fireEvent.click(screen.getByRole("button", { name: "Try a different email" }));

    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.queryByLabelText("Digit 1 of 4")).not.toBeInTheDocument();
  });

  it("never stores a session when verification fails", async () => {
    verifyCode.mockRejectedValueOnce(new ApiError(500, "boom", {}));
    await reachCode();
    typeCode("1234");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByRole("alert");
    expect(setSession).not.toHaveBeenCalled();
  });
});
