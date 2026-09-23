import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
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
const resend = vi.fn();

vi.mock("@/lib/api/emailConfirmation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/emailConfirmation")>();
  return {
    ...actual,
    emailConfirmationApi: {
      ...actual.emailConfirmationApi,
      verify: (t: string) => verify(t),
      resend: (tok?: string) => resend(tok),
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
      expect(visibleText(dead.container)).toMatch(/this link has expired/i),
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

  it("offers the resend it once could not", async () => {
    /*
     * THE INVERSE OF WHAT THIS TEST USED TO ASSERT. It read "never offers a
     * resend, because resend needs a session this reader lacks" - true when
     * written, and the constraint is gone: backend widened resend to accept
     * the token on 24 Sep. The old test would have kept the button out.
     */
    verify.mockResolvedValue(state({ status: "expired", email: null, message: "Ran out." }));
    const { container } = render(<ConfirmEmail token="t6" />);

    await waitFor(() => expect(visibleText(container)).toMatch(/has expired/i));
    expect(screen.getByRole("button", { name: /Send a new link/i })).toBeEnabled();
    // And it no longer sends them away to do it.
    expect(visibleText(container)).not.toMatch(/sign in and we can send you a new link/i);
  });

  it("omits the address when the server named nobody", async () => {
    // `email` is nullable: an invalid token identifies no account.
    verify.mockResolvedValue(state({ status: "invalid", email: null, message: "No such link." }));
    const { container } = render(<ConfirmEmail token="t7" />);

    await waitFor(() => expect(visibleText(container)).toMatch(/doesn[’']t work/i));
    expect(visibleText(container)).not.toMatch(/null|undefined|@/);
  });
});

/**
 * D01b, AC-03 and AC-04 - the frame that existed while this was built to
 * invented copy.
 *
 * These pin the frame's own sentences, not paraphrases, because the reason the
 * first version diverged was that nobody had the frame open. A test that
 * matched /expired/i would pass against either wording and catch nothing.
 */
describe("D01b's own copy", () => {
  it("says what AC-03 says, including the 24 hours and the address", async () => {
    verify.mockResolvedValue(
      state({ status: "expired", email: "f.adebayo@brightgate.edu.ng", message: "Ran out." }),
    );
    const { container } = render(<ConfirmEmail token="t8" />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Confirmation links last 24 hours/i),
    );
    expect(visibleText(container)).toMatch(/f\.adebayo@brightgate\.edu\.ng/);
    // The server's one-liner knows neither fact, so it must not win here.
    expect(visibleText(container)).not.toMatch(/Ran out/);
  });

  it("does not print a null address when the server named nobody", async () => {
    verify.mockResolvedValue(state({ status: "expired", email: null, message: "Ran out." }));
    const { container } = render(<ConfirmEmail token="t9" />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Confirmation links last 24 hours/i),
    );
    expect(visibleText(container)).not.toMatch(/null|undefined|send a fresh one to\s*\./i);
  });

  it("says what AC-04 says, and treats it as not-an-error", async () => {
    verify.mockResolvedValue(
      state({ status: "already_confirmed", email: "f.adebayo@brightgate.edu.ng", message: "x" }),
    );
    const { container } = render(<ConfirmEmail token="t10" />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/perhaps on another device/i),
    );
    expect(visibleText(container)).toMatch(/just sign in and carry on/i);
  });

  it("draws one of AC-03's two buttons, and still not the other", async () => {
    /*
     * This asserted BOTH were absent because the contract served neither.
     * Half of that has changed and half has not, which is why the test is
     * split rather than deleted:
     *
     *  - "Send a new link" is built - resend takes the token now.
     *  - "Change the email address" is still absent, and now for a REASON.
     *    Backend declined to token-authenticate it: repointing an address from
     *    a leaked link is a tenant takeover - change it, confirm it, then
     *    reset the password. `/verify` transfers nothing; changing transfers
     *    everything.
     */
    verify.mockResolvedValue(state({ status: "expired", email: "f@b.edu.ng", message: "x" }));
    const { container } = render(<ConfirmEmail token="t11" />);

    await waitFor(() => expect(visibleText(container)).toMatch(/has expired/i));
    expect(screen.getByRole("button", { name: /send a new link/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /change the email/i })).toBeNull();
  });
});

/**
 * AC-03's "Send a new link", buildable since backend widened resend to accept
 * the token (24 Sep).
 *
 * The 429 is the case worth testing hardest: one email every two minutes per
 * account, and the budget is SHARED with the in-console resend, so a person
 * who just asked from the other screen lands here on a refusal. Flattening
 * that into "that didn't work" sends them pressing the button into the same
 * wall.
 */
describe("sending a new link from a dead one", () => {
  const expired = () =>
    verify.mockResolvedValue(state({ status: "expired", email: "f@b.edu.ng" }));

  it("sends the token it was opened with, whatever state it is in", async () => {
    expired();
    resend.mockResolvedValue(state({ status: "pending" }));
    render(<ConfirmEmail token="tok-abcdefghij" />);

    fireEvent.click(await screen.findByRole("button", { name: /Send a new link/i }));
    await waitFor(() => expect(resend).toHaveBeenCalledWith("tok-abcdefghij"));
  });

  it("confirms it went, without claiming it has arrived", async () => {
    expired();
    resend.mockResolvedValue(state({ status: "pending" }));
    const { container } = render(<ConfirmEmail token="t" />);

    fireEvent.click(await screen.findByRole("button", { name: /Send a new link/i }));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Check your email in a minute or two/i),
    );
  });

  it("draws the 429 as a wait, not as a failure", async () => {
    expired();
    resend.mockRejectedValue(
      new ApiError(429, "too soon", {
        detail: { code: "confirmation_recently_sent", retryAfterSeconds: 95 },
      }),
    );
    const { container } = render(<ConfirmEmail token="t" />);

    fireEvent.click(await screen.findByRole("button", { name: /Send a new link/i }));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/A link went out very recently/i),
    );
    // Rounded UP: 95s is "2 minutes", never "a minute", or they earn a second
    // refusal that reads as the button being broken.
    expect(visibleText(container)).toMatch(/Try again in 2 minutes/);
    expect(visibleText(container)).not.toMatch(/couldn.t send/i);
  });

  it("survives a 429 that names no wait", async () => {
    expired();
    resend.mockRejectedValue(
      new ApiError(429, "too soon", { detail: { code: "confirmation_recently_sent" } }),
    );
    const { container } = render(<ConfirmEmail token="t" />);

    fireEvent.click(await screen.findByRole("button", { name: /Send a new link/i }));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Give it a couple of minutes/i),
    );
    expect(visibleText(container)).not.toMatch(/null|undefined|NaN/);
  });

  it("does not call a transport failure a rate limit", async () => {
    expired();
    resend.mockRejectedValue(new Error("network"));
    const { container } = render(<ConfirmEmail token="t" />);

    fireEvent.click(await screen.findByRole("button", { name: /Send a new link/i }));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn.t send that just now/i),
    );
    expect(visibleText(container)).not.toMatch(/very recently/i);
  });

  it("still does not offer to change the address", async () => {
    // Backend declined to token-authenticate it: repointing an address with a
    // leaked link is a tenant takeover. Absent for a reason now, not a gap.
    expired();
    render(<ConfirmEmail token="t" />);

    await screen.findByRole("button", { name: /Send a new link/i });
    expect(screen.queryByRole("button", { name: /change the email/i })).toBeNull();
  });
});
