import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { BillingContact } from "@/lib/api/billing";

const { contacts, removeContact } = vi.hoisted(() => ({
  contacts: vi.fn(),
  removeContact: vi.fn(),
}));

vi.mock("@/lib/api/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/billing")>();
  return { ...actual, billingApi: { ...actual.billingApi, contacts, removeContact } };
});

import { BillingContacts } from "./BillingContacts";

/**
 * D11b "Who gets the invoices" (several contacts; Lydia, 4 Nov: yes), built to
 * what the server does: every contact is emailed each invoice and reminder
 * (Teslim e8b70bd), the primary is the subscription's contact, and Add,
 * Edit and Remove are the routes. Left out: names and roles (none stored),
 * a per-contact "receives" choice (there isn't one), and the founding-admin
 * fallback lines (admins get an in-app notice; with no contacts nothing is
 * emailed).
 */

const c = (id: string, email: string): BillingContact => ({
  id,
  email,
  phone: null,
  addressLine1: "12 School Road",
  addressLine2: null,
  city: "Lagos",
  region: null,
  postalCode: null,
  country: "Nigeria",
});

beforeEach(() => {
  vi.clearAllMocks();
  contacts.mockResolvedValue([c("bc-1", "bursar@brightgate.edu.ng"), c("bc-2", "proprietor@brightgate.edu.ng")]);
  removeContact.mockResolvedValue(undefined);
});

describe("who gets the invoices", () => {
  it("lists every contact, the primary marked as the server holds it", async () => {
    const { container } = render(<BillingContacts primaryId="bc-1" onChanged={vi.fn()} />);
    expect(await screen.findByText("proprietor@brightgate.edu.ng")).toBeInTheDocument();
    const text = visibleText(container);
    expect(text).toMatch(/Who gets the invoices/i);
    expect(text).toMatch(/bursar@brightgate\.edu\.ng\s*Primary/);
    expect(screen.getAllByText("Primary")).toHaveLength(1);
    expect(text).toMatch(/Someone needs to receive your invoices\./);
    expect(screen.getByRole("button", { name: "Add a contact" })).toBeInTheDocument();
  });

  it("claims nothing the server doesn't do - no names, roles, receive choices or founding-admin fallback", async () => {
    const { container } = render(<BillingContacts primaryId="bc-1" onChanged={vi.fn()} />);
    await screen.findByText("proprietor@brightgate.edu.ng");
    expect(visibleText(container)).not.toMatch(/founding admin|Every invoice|needs attention|Bursar|Proprietor\b/);
  });

  it("removes a contact, then reads the list and the primary again", async () => {
    const onChanged = vi.fn();
    render(<BillingContacts primaryId="bc-1" onChanged={onChanged} />);
    await screen.findByText("proprietor@brightgate.edu.ng");
    contacts.mockResolvedValue([c("bc-2", "proprietor@brightgate.edu.ng")]);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    await waitFor(() => expect(removeContact).toHaveBeenCalledWith("bc-1"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("bursar@brightgate.edu.ng")).toBeNull());
  });

  it("says a failed removal failed, and keeps the contact", async () => {
    removeContact.mockRejectedValue(new Error("500"));
    render(<BillingContacts primaryId="bc-1" onChanged={vi.fn()} />);
    await screen.findByText("proprietor@brightgate.edu.ng");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(await screen.findByText(/didn.t remove them, and nothing has changed/)).toBeInTheDocument();
    expect(screen.getByText("bursar@brightgate.edu.ng")).toBeInTheDocument();
  });

  it("with nobody on file, says invoices appear here only, in Lydia's words (SCRUM-321)", async () => {
    contacts.mockResolvedValue([]);
    const { container } = render(<BillingContacts primaryId={null} onChanged={vi.fn()} />);
    expect(
      await screen.findByText(
        /No one is set to receive your invoices\. Add a billing contact and we.ll send them there\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Until then, your invoices appear here only.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a billing contact" })).toBeInTheDocument();
    // The listed-contacts footer isn't repeated under it.
    expect(screen.queryByRole("button", { name: "Add a contact" })).toBeNull();
    expect(visibleText(container)).not.toMatch(/No billing contact on file|founding admin/);
  });

  it("says a failed read failed, not that the list is empty", async () => {
    contacts.mockRejectedValueOnce(new Error("500"));
    const { container } = render(<BillingContacts primaryId={null} onChanged={vi.fn()} />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn't read who gets your invoices just now/),
    );
    expect(visibleText(container)).not.toMatch(/No one is set to receive your invoices/);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("bursar@brightgate.edu.ng")).toBeInTheDocument();
  });
});
