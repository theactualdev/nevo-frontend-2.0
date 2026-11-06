import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BillingContactSheet } from "./BillingContactSheet";

/**
 * The sheet said "Where invoices and payment reminders go." Nothing goes
 * there: an issued invoice is an in-app notice to the school's active admins,
 * and no invoice or reminder email uses this address on the server (5 Nov).
 * A promise of delivery to an address nothing writes to is an untrue state
 * (Lydia, 4 Nov).
 */
describe("the billing contact sheet", () => {
  it("doesn't promise that invoices or reminders go to the address", () => {
    const { container } = render(
      <BillingContactSheet contact={null} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    expect(screen.getByRole("heading", { name: "Billing contact" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/invoices and payment reminders go|reminders go|invoices go/i);
  });
});
