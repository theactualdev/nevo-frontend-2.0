import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { BillingContact } from "@/lib/api/billing";

const { addContact, editContact } = vi.hoisted(() => ({
  addContact: vi.fn(),
  editContact: vi.fn(),
}));

vi.mock("@/lib/api/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/billing")>();
  return { ...actual, billingApi: { ...actual.billingApi, addContact, editContact } };
});

import { BillingContactSheet } from "./BillingContactSheet";

/**
 * "Where invoices and payment reminders go." came off in #1008, when nothing
 * sent to a billing contact. Teslim's e8b70bd (6 Nov) emails every contact
 * each invoice as it's issued, and a reminder 7 days before it's due and on
 * the day - so the line is true again, and back. Since 236f99b (SCRUM-310)
 * there's also one overdue reminder once it's past due; still true.
 *
 * One contact of several (a16224d): a new one is added, an existing one
 * edited by its id.
 */

const contact: BillingContact = {
  id: "bc-1",
  email: "bursar@brightgate.edu.ng",
  phone: null,
  addressLine1: "12 School Road",
  addressLine2: null,
  city: "Lagos",
  region: null,
  postalCode: null,
  country: "Nigeria",
};

/** The input inside the label that starts with this text. */
const field = (label: string) =>
  Array.from(document.querySelectorAll("label")).find((l) =>
    l.querySelector("span")?.textContent === label,
  )!.querySelector("input") as HTMLInputElement;

function fillNew() {
  fireEvent.change(field("Email"), { target: { value: "finance@brightgate.edu.ng" } });
  fireEvent.change(field("Address"), { target: { value: "12 School Road" } });
  fireEvent.change(field("City"), { target: { value: "Lagos" } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the billing contact sheet", () => {
  it("says where invoices and reminders go - true since e8b70bd", () => {
    render(<BillingContactSheet contact={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Billing contact" })).toBeInTheDocument();
    expect(screen.getByText("Where invoices and payment reminders go.")).toBeInTheDocument();
  });

  it("adds a new contact to the list", async () => {
    addContact.mockResolvedValue({ ...contact, id: "bc-2", email: "finance@brightgate.edu.ng" });
    const onSaved = vi.fn();
    render(<BillingContactSheet contact={null} onClose={vi.fn()} onSaved={onSaved} />);
    fillNew();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(addContact).toHaveBeenCalledWith(
      expect.objectContaining({ email: "finance@brightgate.edu.ng", addressLine1: "12 School Road", city: "Lagos" }),
    );
    expect(editContact).not.toHaveBeenCalled();
  });

  it("edits the contact it was opened on, by its id", async () => {
    editContact.mockResolvedValue(contact);
    const onSaved = vi.fn();
    render(<BillingContactSheet contact={contact} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(editContact).toHaveBeenCalledWith("bc-1", expect.objectContaining({ email: "bursar@brightgate.edu.ng" }));
    expect(addContact).not.toHaveBeenCalled();
  });

  it("says plainly when the address is already on the list, and keeps the sheet open", async () => {
    addContact.mockRejectedValue(
      new ApiError(409, "Conflict", { detail: { code: "billing_contact_exists" } }),
    );
    const onSaved = vi.fn();
    render(<BillingContactSheet contact={null} onClose={vi.fn()} onSaved={onSaved} />);
    fillNew();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("That address is already one of your billing contacts."),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
