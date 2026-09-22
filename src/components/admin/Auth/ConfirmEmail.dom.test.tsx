import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { EmailConfirmationState } from "@/lib/api/emailConfirmation";
import { ConfirmEmail } from "./ConfirmEmail";

/**
 * SCRUM-151, and the two things this screen must not do.
 *
 * It must not collapse five outcomes into one error - the contract is explicit
 * that an expired link, a used link and a link that never existed are three
 * different screens. And it must not report a failed REQUEST as a verdict on
 * the link, which is the shape a plain try/catch produces and the recurring
 * defect in this codebase.
 */

const verify = vi.fn();

vi.mock("@/lib/api/emailConfirmation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/emailConfirmation")>();
  return {
    ...actual,
    emailConfirmationApi: {
      ...actual.emailConfirmationApi,
      verify: (t: string) => verify(t),
    },
  };
});

const state = (over: Partial<EmailConfirmationState> = {}): EmailConfirmationState => ({
  status: "confirmed",
  email: "deputy@brightgate.edu.ng",
  expiresAt: null,
  message: "Your address is confirmed.",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("ConfirmEmail", () => {
  it("sends the token from the path, not a query param", async () => {
    // The parent consent link shipped once with the token in a query param
    // and the app looked up a consent literally named "consent".
    verify.mockResolvedValue(state());
    render(<ConfirmEmail token="tok-abcdefghij" />);
    await waitFor(() => expect(verify).toHaveBeenCalledWith("tok-abcdefghij"));
  });

  it("draws a used link and a dead link as different screens", async () => {
    verify.mockResolvedValue(state({ status: "already_confirmed", message: "Already done." }));
    const used = render(<ConfirmEmail token="t1" />);
    await waitFor(() =>
      expect(visibleText(used.container)).toMatch(/already confirmed/i),
    );
    used.unmount();

    verify.mockResolvedValue(state({ status: "expired", email: null, message: "Ran out." }));
    const dead = render(<ConfirmEmail token="t2" />);
    await waitFor(() =>
      expect(visibleText(dead.container)).toMatch(/this link has run out/i),
    );
    expect(visibleText(dead.container)).not.toMatch(/already confirmed/i);
  });

  it("separates a link that never existed from one that ran out", async () => {
    verify.mockResolvedValue(state({ status: "invalid", email: null, message: "No such link." }));
    const { container } = render(<ConfirmEmail token="t3" />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/doesn[’']t work/i),
    );
    expect(visibleText(container)).not.toMatch(/run out|already confirmed/i);
  });

  it("does not call a broken request a broken link", async () => {
    /*
     * THE DEFECT THIS TEST EXISTS FOR. A 500, a dropped connection or an
     * offline laptop are indistinguishable from `invalid` to a caller with
     * only try/catch - and rendering "this link doesn't work" would tell an
     * administrator their link is dead when nothing of the sort is known.
     */
    verify.mockRejectedValue(new Error("network"));
    const { container } = render(<ConfirmEmail token="t4" />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn[’']t check your link/i),
    );
    expect(visibleText(container)).not.toMatch(/doesn[’']t work|run out|invalid/i);
    expect(visibleText(container)).toMatch(/may still be fine/i);
  });

  it("offers a retry that actually re-reads", async () => {
    verify.mockRejectedValueOnce(new Error("network"));
    verify.mockResolvedValueOnce(state());

    const { container } = render(<ConfirmEmail token="t5" />);
    const again = await screen.findByRole("button", { name: "Try again" });
    again.click();

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/your email address is confirmed/i),
    );
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it("never offers a resend, because resend needs a session this reader lacks", async () => {
    // `POST /email-confirmation/resend` carries HTTPBearer. Anyone opening a
    // confirmation link is not signed in, so a resend button would only 401.
    verify.mockResolvedValue(state({ status: "expired", email: null, message: "Ran out." }));
    const { container } = render(<ConfirmEmail token="t6" />);

    await waitFor(() => expect(visibleText(container)).toMatch(/run out/i));
    expect(screen.queryByRole("button", { name: /resend|send.*again|new link/i })).toBeNull();
    expect(visibleText(container)).toMatch(/sign in and we can send you a new link/i);
  });

  it("omits the address when the server named nobody", async () => {
    // `email` is nullable: an invalid token identifies no account.
    verify.mockResolvedValue(state({ status: "invalid", email: null, message: "No such link." }));
    const { container } = render(<ConfirmEmail token="t7" />);

    await waitFor(() => expect(visibleText(container)).toMatch(/doesn[’']t work/i));
    expect(visibleText(container)).not.toMatch(/null|undefined|@/);
  });
});
