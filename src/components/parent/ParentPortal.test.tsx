import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { ParentInvitation } from "@/lib/api/parent";

const { getInvitation, completeConsent, exerciseRight } = vi.hoisted(() => ({
  getInvitation: vi.fn(),
  completeConsent: vi.fn(),
  exerciseRight: vi.fn(),
}));

// Replaced wholesale - see ParentDataManagement.test.tsx for why importOriginal
// deadlocks the jsdom worker here.
vi.mock("@/lib/api/parent", () => ({
  parentApi: { getInvitation, completeConsent, exerciseRight },
}));

import { ParentPortal } from "./ParentPortal";

/**
 * The one tokenised link, and which screen it opens.
 *
 * A parent gets a single link and taps it whenever they think of it. The route
 * does not decide what to show - the record does. The failure this file exists
 * to prevent is asking a parent to consent to something they have already
 * consented to, or worse, already withdrawn.
 *
 * These render the REAL D01b and D01c beneath the portal rather than stubs, so
 * a wrong branch shows up as the wrong screen rather than as a passing test
 * against a mock that cannot be wrong.
 */

const TOKEN = "tok";

const INVITATION: ParentInvitation = {
  invitationId: "inv-1",
  studentFirstName: "Amara",
  schoolName: "Brightgate Academy",
  schoolPhone: null,
  schoolEmail: null,
  parentName: "Ngozi Okafor",
  parentContact: "ada.okoro@example.com",
  parentContactMethod: "email",
  status: "pending",
  consentTypes: ["data_processing"],
  expiresAt: "2026-12-01T00:00:00Z",
  decidedAt: null,
};

const inv = (over: Partial<ParentInvitation> = {}): ParentInvitation => ({
  ...INVITATION,
  ...over,
});

beforeEach(() => {
  getInvitation.mockReset();
  completeConsent.mockReset();
  exerciseRight.mockReset();
});

describe("before the record arrives", () => {
  it("shows a loading state rather than either screen", () => {
    getInvitation.mockReturnValue(new Promise(() => {}));
    render(<ParentPortal token={TOKEN} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Yes, I give my consent/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Object to processing/ }),
    ).not.toBeInTheDocument();
  });

  it("reads the record exactly once", async () => {
    getInvitation.mockResolvedValue(inv());
    render(<ParentPortal token={TOKEN} />);
    await screen.findByRole("button", { name: /Yes, I give my consent/ });

    // Both screens used to fetch for themselves. One read means one loading
    // state and no window where the two disagree about the same record.
    expect(getInvitation).toHaveBeenCalledTimes(1);
    expect(getInvitation).toHaveBeenCalledWith(TOKEN);
  });
});

describe("which screen a parent lands on", () => {
  it("asks for consent when the school has not sent the request yet", async () => {
    getInvitation.mockResolvedValue(inv({ status: "not_sent" }));
    render(<ParentPortal token={TOKEN} />);

    expect(
      await screen.findByRole("button", { name: /Yes, I give my consent/ }),
    ).toBeInTheDocument();
  });

  it("asks for consent while the decision is pending", async () => {
    getInvitation.mockResolvedValue(inv({ status: "pending" }));
    render(<ParentPortal token={TOKEN} />);

    expect(
      await screen.findByRole("button", { name: /Yes, I give my consent/ }),
    ).toBeInTheDocument();
  });

  it("does NOT ask again once consent is confirmed", async () => {
    // The worst bug this surface could have: a parent who already said yes
    // being asked to say it again, with no sign their first answer landed.
    getInvitation.mockResolvedValue(inv({ status: "confirmed" }));
    render(<ParentPortal token={TOKEN} />);

    expect(await screen.findByText(/Amara[’']s data on Nevo/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Yes, I give my consent/ }),
    ).not.toBeInTheDocument();
  });

  it("does NOT ask again after a withdrawal - it opens suspended", async () => {
    // Worse still: asking a parent who deliberately withdrew to consent again.
    getInvitation.mockResolvedValue(inv({ status: "withdrawn" }));
    render(<ParentPortal token={TOKEN} />);

    expect(
      await screen.findByText(/Amara[’']s account is suspended/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Yes, I give my consent/ }),
    ).not.toBeInTheDocument();
  });
});

describe("when the link does not resolve", () => {
  it("treats unknown, revoked and expired alike - all 404", async () => {
    getInvitation.mockRejectedValue(new ApiError(404, "not found"));
    render(<ParentPortal token={TOKEN} />);

    expect(await screen.findByText(/no longer active/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Yes, I give my consent/ }),
    ).not.toBeInTheDocument();
  });

  it("distinguishes our own failure from a dead link", async () => {
    // A 500 is not the parent's link being wrong, and telling them it is would
    // send them to their school over a fault at our end.
    getInvitation.mockRejectedValue(new ApiError(500, "boom"));
    render(<ParentPortal token={TOKEN} />);

    // Lydia's words (SCRUM-321), and nothing about whether consent is
    // recorded - unread, the page doesn't know.
    expect(await screen.findByText(/couldn[’']t load this just now/i)).toBeInTheDocument();
    expect(screen.queryByText(/no longer active/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/consent|recorded|safe/i);
  });
});

/**
 * Backlog 54: "Please try the link again in a moment" with nothing to press.
 * Our own failure gets a Try again that reads the link again in place; a dead
 * link does not, because asking again cannot revive it.
 */
describe("when the link can't be read just now", () => {
  it("offers Try again, and reads the link again when pressed", async () => {
    getInvitation
      .mockRejectedValueOnce(new ApiError(500, "boom"))
      .mockResolvedValueOnce(inv({ status: "pending" }));
    render(<ParentPortal token={TOKEN} />);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("button", { name: /Yes, I give my consent/ }),
    ).toBeInTheDocument();
    expect(getInvitation).toHaveBeenCalledTimes(2);
  });

  it("offers no Try again on a dead link", async () => {
    getInvitation.mockRejectedValue(new ApiError(404, "not found"));
    render(<ParentPortal token={TOKEN} />);

    expect(await screen.findByText(/no longer active/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

/**
 * D01e's return state (Teslim's item 16, live 7 Nov): back through the same
 * link with consent recorded and the date-of-birth check holding the child.
 * Lydia's lines (SCRUM-321), then the parent's one step - sign in if they have
 * an account, set it up if not - with their rights still below.
 */
describe("a returning parent whose child is held", () => {
  it("with no account yet: the held lines, account setup, and the rights below", async () => {
    getInvitation.mockResolvedValue(inv({ status: "confirmed", ageCheck: "mismatch", parentAccountReady: false }));
    render(<ParentPortal token={TOKEN} />);
    expect(await screen.findByRole("heading", { name: "Welcome back." })).toBeInTheDocument();
    expect(screen.getByText("Amara can’t start yet.")).toBeInTheDocument();
    expect(screen.getByText("You’ll need to confirm once more, signed in to your account.")).toBeInTheDocument();
    expect(screen.getByText("This link works for 30 days from the day it was sent.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByRole("heading", { name: /Amara.s data on Nevo/ })).toBeInTheDocument();
  });

  it("with an account already: Sign in, never setting it up again", async () => {
    getInvitation.mockResolvedValue(inv({ status: "confirmed", ageCheck: "mismatch", parentAccountReady: true }));
    render(<ParentPortal token={TOKEN} />);
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/parent-sign-in");
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("isn't shown when nothing holds the child", async () => {
    getInvitation.mockResolvedValue(inv({ status: "confirmed", ageCheck: null, parentAccountReady: false }));
    render(<ParentPortal token={TOKEN} />);
    expect(await screen.findByRole("heading", { name: /Amara.s data on Nevo/ })).toBeInTheDocument();
    expect(screen.queryByText(/can.t start yet/)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Welcome back." })).toBeNull();
  });
});
