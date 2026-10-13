import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const { useSupportContact, show } = vi.hoisted(() => ({
  useSupportContact: vi.fn(),
  show: vi.fn(),
}));
vi.mock("@/hooks/useSupportContact", () => ({ useSupportContact }));
vi.mock("@/components/shared/SystemMessages", () => ({
  useSystemMessages: () => ({ show, resolve: vi.fn(), dismiss: vi.fn() }),
}));

import { HelpAndSupport } from "./HelpAndSupport";

/**
 * Help & support.
 *
 * It was CONTENT-blocked, not design-blocked. Design ruled the shape a week ago
 * (one screen: email, WhatsApp, response time) and two of the three facts
 * existed nowhere in the product. The two response-time strings that DID exist
 * were a landing-page sales promise and an NDPA data-rights obligation, and
 * borrowing either would have invented a commitment Nevo had not made.
 *
 * Until backend supplied them, the nav item closed the menu and did nothing -
 * the one route out of the console when something has gone wrong.
 */

const contact = {
  email: "support@nevolearning.com",
  whatsapp: { number: "+234 906 467 8114", link: "https://wa.me/2349064678114" },
  responseTime: "Mon–Fri, we reply within 24 hours",
};

beforeEach(() => {
  useSupportContact.mockReset();
  useSupportContact.mockReturnValue({ contact, loading: false, failed: false });
  show.mockReset();
});

describe("the three facts", () => {
  it("shows the email as something you can press", () => {
    render(<HelpAndSupport />);

    expect(screen.getByRole("link", { name: /support@nevolearning\.com/ })).toHaveAttribute(
      "href",
      `mailto:${contact.email}`,
    );
  });

  it("shows the response time exactly as sent, days included", () => {
    // The DAYS are the commitment. A Friday-evening message answered Monday
    // keeps "Mon-Fri, within 24 hours" and breaks a bare "within 24 hours",
    // so this must not be trimmed to the shorter phrase.
    render(<HelpAndSupport />);

    expect(screen.getByText(contact.responseTime)).toBeInTheDocument();
  });
});

describe("the WhatsApp link", () => {
  it("uses the server's link rather than one built from the number", () => {
    /*
     * The failure this guards. `wa.me` takes DIGITS ONLY and fails silently on
     * a plus or a space, so a link assembled from the display number
     * "+234 906 467 8114" renders as a dead link rather than a malformed one -
     * the worst way for this to break, on the screen someone reaches when
     * nothing else works. Backend derives it; the console must not.
     */
    render(<HelpAndSupport />);

    const link = screen.getByRole("link", { name: /WhatsApp/ });
    expect(link).toHaveAttribute("href", contact.whatsapp.link);
    expect(link.getAttribute("href")).not.toContain(" ");
    expect(link.getAttribute("href")).not.toContain("+");
  });

  it("shows the number in readable form, not the link's digits", () => {
    // The display form is spaced for reading aloud down a phone.
    render(<HelpAndSupport />);

    expect(screen.getByText(contact.whatsapp.number)).toBeInTheDocument();
  });
});

describe("when the read fails", () => {
  it("owns the failure and invents no contact details", () => {
    /*
     * NO HARDCODED FALLBACK, deliberately. The email is the one fact that
     * could be hardcoded, and doing so would put a stale address on screen the
     * day it changes - on the one screen someone reaches when nothing else
     * works.
     */
    useSupportContact.mockReturnValue({ contact: null, loading: false, failed: true });

    render(<HelpAndSupport />);

    expect(screen.getByText(/couldn’t load our contact details/i)).toBeInTheDocument();
    expect(screen.getByText(/our end, not yours/i)).toBeInTheDocument();
    expect(screen.queryByText(/@nevolearning/)).not.toBeInTheDocument();
    expect(screen.queryByText(/wa\.me/)).not.toBeInTheDocument();
  });
});

describe("while loading", () => {
  it("claims nothing it does not yet have", () => {
    useSupportContact.mockReturnValue({ contact: null, loading: true, failed: false });

    render(<HelpAndSupport />);

    expect(screen.queryByText(/@nevolearning/)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn’t load/i)).not.toBeInTheDocument();
  });
});

describe("the way out", () => {
  it("always offers the way back to Settings, whatever the read did", () => {
    // Someone on this screen is already stuck; a dead end here is the worst
    // possible place for one. C17 draws it as a "Settings" back link.
    for (const state of [
      { contact, loading: false, failed: false },
      { contact: null, loading: false, failed: true },
      { contact: null, loading: true, failed: false },
    ]) {
      useSupportContact.mockReturnValue(state);
      const { unmount } = render(<HelpAndSupport />);

      expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
        "href",
        "/teacher/profile",
      );
      unmount();
    }
  });
});

describe("a school that publishes no response time", () => {
  it("leaves the row out rather than drawing it empty", () => {
    // Nullable in the contract. Absent is not a promise of anything.
    useSupportContact.mockReturnValue({
      contact: { ...contact, responseTime: null },
      loading: false,
      failed: false,
    });
    render(<HelpAndSupport />);

    expect(document.querySelector("[data-response-time]")).toBeNull();
    expect(screen.getByRole("link", { name: /support@nevolearning\.com/ })).toBeInTheDocument();
  });
});

/**
 * C17: "Contacts are tappable and copyable." Each card carries a copy button;
 * a copy raises "{label} copied" and swaps the glyph for a tick for 1.6s.
 */
describe("copying a contact", () => {
  const clipboard = (writeText: unknown) =>
    Object.defineProperty(navigator, "clipboard", {
      value: writeText === undefined ? undefined : { writeText },
      configurable: true,
    });

  it("copies the address and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard(writeText);
    render(<HelpAndSupport />);

    fireEvent.click(screen.getByRole("button", { name: `Copy ${contact.email}` }));

    expect(writeText).toHaveBeenCalledWith(contact.email);
    await vi.waitFor(() =>
      expect(show).toHaveBeenCalledWith({ kind: "confirm", message: "Email us copied" }),
    );
  });

  it("copies the WhatsApp number without its reading spaces", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard(writeText);
    render(<HelpAndSupport />);

    fireEvent.click(screen.getByRole("button", { name: `Copy ${contact.whatsapp.number}` }));

    expect(writeText).toHaveBeenCalledWith("+2349064678114");
    await vi.waitFor(() =>
      expect(show).toHaveBeenCalledWith({ kind: "confirm", message: "WhatsApp copied" }),
    );
  });

  it("claims nothing when the browser refused", async () => {
    // The frame's handler swallows the refusal and says "copied" anyway.
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    clipboard(writeText);
    render(<HelpAndSupport />);

    fireEvent.click(screen.getByRole("button", { name: `Copy ${contact.email}` }));
    await act(async () => {});

    expect(show).not.toHaveBeenCalled();
  });

  it("claims nothing where there is no clipboard at all", async () => {
    clipboard(undefined);
    render(<HelpAndSupport />);

    fireEvent.click(screen.getByRole("button", { name: `Copy ${contact.email}` }));
    await act(async () => {});

    expect(show).not.toHaveBeenCalled();
  });

  it("swaps the glyph back after a moment", async () => {
    vi.useFakeTimers();
    try {
      clipboard(vi.fn().mockResolvedValue(undefined));
      render(<HelpAndSupport />);
      const button = screen.getByRole("button", { name: `Copy ${contact.email}` });
      const before = button.innerHTML;

      fireEvent.click(button);
      await act(async () => {});
      expect(button.innerHTML).not.toBe(before);

      act(() => vi.advanceTimersByTime(1600));
      expect(button.innerHTML).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("C17's words", () => {
  it("uses the frame's subtitle", () => {
    render(<HelpAndSupport />);

    expect(
      screen.getByText(/Reach a real person on the Nevo team whenever you need a hand/),
    ).toBeInTheDocument();
  });
});
