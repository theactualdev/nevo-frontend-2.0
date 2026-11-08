import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SetupGateContext, type SetupGateValue, type SetupPause } from "@/context/SetupGateContext";

const { resend } = vi.hoisted(() => ({ resend: vi.fn() }));
vi.mock("@/lib/api/emailConfirmation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/emailConfirmation")>();
  return { ...actual, emailConfirmationApi: { ...actual.emailConfirmationApi, resend: () => resend() } };
});

import { PausedNote } from "./primitives";

/**
 * D01c (design 1397ec4, Lydia's item 28): under each paused action, one calm
 * line with its own Resend - the same words as AC-05's Overview placement and
 * the banner's sent and failed lines. A school that isn't active yet keeps
 * its own line; only an unconfirmed address has a link to send.
 */

const gate = (pause: SetupPause | null, email: string | null): SetupGateValue => ({
  writesPaused: pause !== null,
  pause,
  resolved: true,
  email,
  onboarding: null,
  loading: false,
  refresh: () => {},
});

const mount = (pause: SetupPause | null, email: string | null = "f.adebayo@brightgate.edu.ng") =>
  render(
    <SetupGateContext.Provider value={gate(pause, email)}>
      <PausedNote />
    </SetupGateContext.Provider>,
  );

beforeEach(() => vi.clearAllMocks());

describe("the paused line (D01c)", () => {
  it("says to confirm first, naming where the link went, with its own Resend", () => {
    const { container } = mount("email_unconfirmed");
    expect(container.textContent).toMatch(
      /Confirm your email first - we sent a link to f\.adebayo@brightgate\.edu\.ng\./,
    );
    expect(screen.getByRole("button", { name: "Resend it" })).toBeEnabled();
  });

  it("resends, then says it went, without claiming it has arrived", async () => {
    resend.mockResolvedValue({});
    mount("email_unconfirmed");
    fireEvent.click(screen.getByRole("button", { name: "Resend it" }));
    expect(await screen.findByText(/Sent\. It may take a minute to arrive\./)).toBeInTheDocument();
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it("says a failed resend failed, and that the first link still works", async () => {
    resend.mockRejectedValue(new Error("500"));
    mount("email_unconfirmed");
    fireEvent.click(screen.getByRole("button", { name: "Resend it" }));
    expect(
      await screen.findByText(/Your first link is still valid - try again in a moment\./),
    ).toBeInTheDocument();
  });

  it("names no address when the server gave none", () => {
    const { container } = mount("email_unconfirmed", null);
    expect(container.textContent).toMatch(/Confirm your email first - we’ve sent you a link\./);
    expect(container.textContent).not.toMatch(/null|@/);
  });

  it("keeps the plain line for a school that isn't active yet - there's no link to resend", () => {
    const { container } = mount("not_active");
    expect(screen.queryByRole("button", { name: "Resend it" })).toBeNull();
    expect(container.textContent).toMatch(/Paused until your school is active\./);
  });

  it("renders nothing when nothing is paused", () => {
    const { container } = mount(null);
    expect(container).toBeEmptyDOMElement();
  });
});
