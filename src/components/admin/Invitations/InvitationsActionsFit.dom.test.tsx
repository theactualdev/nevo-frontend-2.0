import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import type { Invitation } from "@/lib/api/invites";
import { InvitationsView } from "./InvitationsView";

/**
 * Olayinka's TO-DO item 10 (24 Nov): "The actions column of the Invitations
 * tab is overly packed, so the text is wrapping in a weird way after the
 * invite was resent."
 *
 * A resend hands back a link, so "Copy link" joined "Resend" and "Revoke" in a
 * 150px column, and at 1280 and 1440 "Copy link" broke over two lines (seen on
 * screen, 25 Nov). D19's table draws Resend and Revoke as 28px icon buttons -
 * its "Resend invite" and "Revoke invite" - so at the table's widths they are
 * icons now, each keeping its word as its accessible name. jsdom has no
 * widths, so this pins the shape: the glyph, D19's title, and the word that
 * only the table hides.
 */

const list = vi.fn();
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, list: () => list() } };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));

const PENDING: Invitation = {
  id: "i1",
  token: "tok-i1",
  role: "teacher",
  email: "amaka@school.edu.ng",
  name: "Amaka Obi",
  status: "pending",
  expiresAt: "2099-01-01T00:00:00Z",
  consentStatus: null,
  deliveryStatus: "sent",
};

describe("the invitations table's actions", () => {
  it("are D19's icons for Resend and Revoke, still named by their words", async () => {
    list.mockResolvedValue([PENDING]);
    render(<InvitationsView />);
    await waitFor(() => expect(screen.getByText("Amaka Obi")).toBeInTheDocument());
    const row = within(screen.getByText("Amaka Obi").closest("div.px-6") as HTMLElement);

    for (const [name, title] of [
      ["Resend", "Resend invite"],
      ["Revoke", "Revoke invite"],
    ] as const) {
      const button = row.getByRole("button", { name });
      expect(button).toHaveAttribute("title", title);
      // The glyph shows only at the table's widths, and is never read out.
      const glyph = button.querySelector("svg");
      expect(glyph).not.toBeNull();
      expect(glyph).toHaveAttribute("aria-hidden");
      expect(glyph).toHaveClass("hidden", "xl:block");
      // The word stays the name everywhere, and is only hidden from sight there.
      expect(within(button).getByText(name)).toHaveClass("xl:sr-only");
    }

    // Copy link has no D19 glyph, so it stays a word, and nothing else wraps it.
    const copy = row.getByRole("button", { name: "Copy link" });
    expect(copy.querySelector("svg")).toBeNull();
    expect(copy.parentElement).toHaveClass("xl:justify-end", "xl:gap-2");
  });
});
