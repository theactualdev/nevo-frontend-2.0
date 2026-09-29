import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { visibleText } from "@/test/visibleText";
import { SetupPausedBanner } from "../SetupPausedBanner";

/**
 * D01b AC-05 — the console before the address is confirmed.
 *
 * *"Confirm your email to start setting up. You can look around, but changes
 * are paused until you confirm."*
 *
 * The banner is tested on its own rather than through `OverviewView`: that
 * screen pulls eight reads and the thing under test here is one card and its
 * two failure paths. The paused ROWS are covered in
 * `OverviewGettingStarted.dom.test.tsx`, which already has this screen's eight
 * mocks standing.
 */

const gate = vi.fn();
const resend = vi.fn();
const changeEmail = vi.fn();

vi.mock("@/hooks", () => ({ useSetupGate: () => gate() }));

vi.mock("@/lib/api/emailConfirmation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/emailConfirmation")>();
  return {
    ...actual,
    emailConfirmationApi: {
      ...actual.emailConfirmationApi,
      resend: () => resend(),
      changeEmail: (e: string) => changeEmail(e),
    },
  };
});

const paused = (over = {}) => ({
  writesPaused: true,
  pause: "email_unconfirmed" as const,
  resolved: true,
  email: "f.adebayo@brightgate.edu.ng",
  refresh: vi.fn(),
  note: "Paused until your email is confirmed.",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  gate.mockReturnValue(paused());
  resend.mockResolvedValue(undefined);
});

describe("the AC-05 banner", () => {
  it("says what AC-05 says, and names the address", () => {
    const { container } = render(<SetupPausedBanner />);

    expect(visibleText(container)).toMatch(
      /Confirm your email to start setting up/,
    );
    expect(visibleText(container)).toMatch(
      /You can look around, but changes are paused until you confirm/,
    );
    expect(visibleText(container)).toMatch(/f\.adebayo@brightgate\.edu\.ng/);
  });

  it("is absent when nothing is paused", () => {
    gate.mockReturnValue(
      paused({ writesPaused: false, pause: null, note: null }),
    );
    const { container } = render(<SetupPausedBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is absent while the gate is unresolved, rather than flickering in", () => {
    // `useSetupGate` never reports paused on a failed read, so an unresolved
    // gate must produce nothing at all here.
    gate.mockReturnValue(
      paused({ writesPaused: false, pause: null, resolved: false, note: null }),
    );
    const { container } = render(<SetupPausedBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not render D24's reason, which is a whole dashboard elsewhere", () => {
    gate.mockReturnValue(
      paused({ pause: "not_active", note: "Paused until your school is active." }),
    );
    const { container } = render(<SetupPausedBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says where the link went, or says nothing about where", () => {
    // `email` is nullable. "We sent a link to ." is worse than not saying.
    gate.mockReturnValue(paused({ email: null }));
    const { container } = render(<SetupPausedBanner />);

    expect(visibleText(container)).toMatch(/We've sent you a link/);
    expect(visibleText(container)).not.toMatch(/sent a link to\s*\./);
    expect(visibleText(container)).not.toMatch(/null|undefined/);
  });

  it("resends, and says a failure without condemning the first link", async () => {
    resend.mockRejectedValue(new Error("500"));
    const { container } = render(<SetupPausedBanner />);

    screen.getByRole("button", { name: /Resend link/i }).click();

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Your first link is still valid/i),
    );
  });

  it("offers a re-check, because confirming happens in another tab", async () => {
    /*
     * The wizard step polls. A console banner polling forever is a request
     * every five seconds for as long as the tab is open, so the re-check is
     * offered rather than assumed - and somebody who confirmed elsewhere is
     * not left looking at a card telling them to do what they have done.
     */
    const refresh = vi.fn();
    gate.mockReturnValue(paused({ refresh }));
    render(<SetupPausedBanner />);

    screen.getByRole("button", { name: /I.ve confirmed it/i }).click();
    expect(refresh).toHaveBeenCalled();
  });

  /*
   * THE INVERSE OF WHAT THIS BLOCK USED TO ASSERT: "does not offer to change
   * the address, which nothing can write". PATCH /api/v1/admin/email is
   * session-authenticated and was deployed; the wizard's twin of this test was
   * inverted when that was found, and this one was missed. So a signed-in
   * admin with a mistyped address could not fix it anywhere, and the expired
   * link page told them "Sign in and you can change it there".
   */
  const change = (to: string) => {
    fireEvent.click(screen.getByRole("button", { name: /Change email/i }));
    fireEvent.change(screen.getByLabelText(/The right address/i), { target: { value: to } });
    fireEvent.click(screen.getByRole("button", { name: /Use this address/i }));
  };

  it("offers AC-05's Change email, and re-reads once it lands", async () => {
    const refresh = vi.fn();
    gate.mockReturnValue(paused({ refresh }));
    changeEmail.mockResolvedValue({ status: "pending", email: "correct@brightgate.edu.ng" });
    const { container } = render(<SetupPausedBanner />);

    change("correct@brightgate.edu.ng");

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/new link to correct@brightgate.edu.ng/),
    );
    expect(changeEmail).toHaveBeenCalledWith("correct@brightgate.edu.ng");
    expect(refresh).toHaveBeenCalled();
  });

  it("names a real collision, and asks for another address", async () => {
    changeEmail.mockRejectedValue(
      new ApiError(409, "no", { detail: { code: "email_already_in_use", message: "x" } }),
    );
    const { container } = render(<SetupPausedBanner />);

    change("taken@brightgate.edu.ng");

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/already set up with a Nevo account/),
    );
  });

  it("treats 'confirmed in another tab' as done, not as a failure", async () => {
    const refresh = vi.fn();
    gate.mockReturnValue(paused({ refresh }));
    changeEmail.mockRejectedValue(
      new ApiError(409, "no", { detail: { code: "email_already_confirmed", message: "x" } }),
    );
    const { container } = render(<SetupPausedBanner />);

    change("correct@brightgate.edu.ng");

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(visibleText(container)).not.toMatch(/couldn.t change it|already set up/);
  });
});
