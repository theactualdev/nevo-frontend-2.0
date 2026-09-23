import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ConfirmEmailStep } from "./ConfirmEmailStep";

/**
 * D01 step 2, and the reason it exists.
 *
 * *"Email confirm sits before the DPA so acceptance is tied to a verified
 * owner."* The DPA acceptance record names an administrator and is displayed on
 * two screens, so the ordering is a compliance constraint rather than a flow
 * preference. These tests pin the frame's own copy and the two behaviours that
 * would quietly break it.
 */

const read = vi.fn();
const resend = vi.fn();

vi.mock("@/lib/api/emailConfirmation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/emailConfirmation")>();
  return {
    ...actual,
    emailConfirmationApi: {
      ...actual.emailConfirmationApi,
      read: () => read(),
      resend: () => resend(),
    },
  };
});

const state = (status: string) => ({
  status,
  email: "f.adebayo@brightgate.edu.ng",
  expiresAt: null,
  message: "x",
});

const onDone = vi.fn();
const onBack = vi.fn();

const mount = () =>
  render(
    <ConfirmEmailStep
      schoolName="Brightgate Academy"
      email="f.adebayo@brightgate.edu.ng"
      onBack={onBack}
      onDone={onDone}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  read.mockResolvedValue(state("pending"));
  resend.mockResolvedValue(state("pending"));
});

describe("ConfirmEmailStep", () => {
  it("says what AC-01 says, and names the address", async () => {
    const { container } = mount();

    await waitFor(() => expect(read).toHaveBeenCalled());
    expect(visibleText(container)).toMatch(/Check your email/);
    expect(visibleText(container)).toMatch(
      /Brightgate Academy has been created/,
    );
    expect(visibleText(container)).toMatch(/f\.adebayo@brightgate\.edu\.ng/);
    expect(visibleText(container)).toMatch(/It can take a minute to arrive/);
  });

  it("will not let the DPA be reached while the address is unconfirmed", async () => {
    // The whole compliance point. No control on this screen advances.
    const { container } = mount();

    await waitFor(() => expect(read).toHaveBeenCalled());
    expect(visibleText(container)).not.toMatch(/Continue to the agreement/);
    fireEvent.click(screen.getByRole("button", { name: /Resend the link/i }));
    await waitFor(() => expect(resend).toHaveBeenCalled());
    expect(onDone).not.toHaveBeenCalled();
  });

  it("moves to AC-02 when the address is confirmed elsewhere", async () => {
    /*
     * The link is opened on a phone or another tab, so this screen has to
     * notice on its own. Fake timers rather than a long `waitFor`: the real
     * interval is five seconds, and a test that waits it out costs five
     * seconds on every run and still races.
     */
    vi.useFakeTimers();
    try {
      read.mockResolvedValueOnce(state("pending"));
      read.mockResolvedValue(state("confirmed"));

      const { container } = mount();
      // `act` because the state change comes from an interval, not an event -
      // Testing Library only auto-wraps `fireEvent`.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(visibleText(container)).toMatch(/Check your email/);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(visibleText(container)).toMatch(/Email confirmed/);
      expect(visibleText(container)).toMatch(
        /Your address is confirmed\. Next, please read and agree/,
      );

      fireEvent.click(
        screen.getByRole("button", { name: /Continue to the agreement/i }),
      );
      expect(onDone).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops polling once there is nothing left to learn", async () => {
    vi.useFakeTimers();
    try {
      read.mockResolvedValue(state("confirmed"));
      mount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const afterConfirm = read.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      expect(read.mock.calls.length).toBe(afterConfirm);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats already_confirmed as confirmed, not as an error", async () => {
    // Clicking the link twice is the ordinary case, not a fault.
    read.mockResolvedValue(state("already_confirmed"));
    const { container } = mount();

    await waitFor(() => expect(visibleText(container)).toMatch(/Email confirmed/));
  });

  it("does not read a failed poll as an unconfirmed address", async () => {
    /*
     * A dropped request says nothing about whether the address is confirmed.
     * The mild failure is claiming "still waiting"; the bad one is stranding
     * somebody who HAS confirmed on a screen with no way forward. The poll's
     * catch does nothing at all.
     */
    read.mockRejectedValue(new Error("network"));
    const { container } = mount();

    await waitFor(() => expect(read).toHaveBeenCalled());
    expect(visibleText(container)).toMatch(/Check your email/);
    expect(visibleText(container)).not.toMatch(/couldn.t|failed|error/i);
    expect(visibleText(container)).not.toMatch(/Email confirmed/);
  });

  it("says a resend failed without implying the first link is dead", async () => {
    resend.mockRejectedValue(new Error("500"));
    const { container } = mount();

    fireEvent.click(await screen.findByRole("button", { name: /Resend the link/i }));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Your first link is still valid/i),
    );
  });

  it("does not offer to change the address, which nothing can write", async () => {
    // D01 draws "That email isn't right - change it". No endpoint in the
    // deployed document writes an administrator's address.
    mount();

    await waitFor(() => expect(read).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: /change it|isn.t right/i }),
    ).toBeNull();
  });
});
