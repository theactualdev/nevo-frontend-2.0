import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useSupportContact } = vi.hoisted(() => ({ useSupportContact: vi.fn() }));
vi.mock("@/hooks/useSupportContact", () => ({ useSupportContact }));

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
});

describe("the three facts", () => {
  it("shows the email as something you can press", () => {
    render(<HelpAndSupport />);

    expect(screen.getByRole("link", { name: contact.email })).toHaveAttribute(
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

    const link = screen.getByRole("link", { name: contact.whatsapp.number });
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
  it("always offers the dashboard, whatever the read did", () => {
    // Someone on this screen is already stuck; a dead end here is the worst
    // possible place for one.
    for (const state of [
      { contact, loading: false, failed: false },
      { contact: null, loading: false, failed: true },
      { contact: null, loading: true, failed: false },
    ]) {
      useSupportContact.mockReturnValue(state);
      const { unmount } = render(<HelpAndSupport />);

      expect(
        screen.getByRole("link", { name: /back to your dashboard/i }),
      ).toHaveAttribute("href", "/teacher/dashboard");
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

    expect(screen.queryByText(/hear back/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: contact.email })).toBeInTheDocument();
  });
});
