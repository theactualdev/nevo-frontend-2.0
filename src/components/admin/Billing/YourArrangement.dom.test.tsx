import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Pricing } from "@/lib/api/billing";
import { YourArrangement } from "./YourArrangement";

/**
 * D11b's "Your arrangement" (backlog 106): invoice currency and cadence, the
 * server's - and never D11b's "Payment method: Paystack" (#738).
 */

const pricing = (over: Partial<Pricing> = {}): Pricing => ({
  pricingModel: "per_student",
  pricingPlan: "annual",
  accessWindow: "year_round",
  studentCount: 240,
  perStudentRate: "42000.00",
  rateType: "standard",
  rateLockedUntil: null,
  totalBeforeVat: "10080000.00",
  vatRate: "7.50",
  vatAmount: "756000.00",
  totalWithVat: "10836000.00",
  currency: "NGN",
  ...over,
});

describe("Your arrangement", () => {
  it("says the invoice currency and how often invoices come, as D11b draws", () => {
    render(<YourArrangement pricing={pricing()} />);

    expect(screen.getByRole("heading", { name: "Your arrangement" })).toBeInTheDocument();
    expect(screen.getByText("Naira (₦)")).toBeInTheDocument();
    expect(screen.getByText("Invoice currency")).toBeInTheDocument();
    expect(screen.getByText("Annually")).toBeInTheDocument();
    expect(screen.getByText("Invoiced")).toBeInTheDocument();
  });

  it("follows the plan and the currency the server sends", () => {
    render(<YourArrangement pricing={pricing({ pricingPlan: "per_term", currency: "USD" })} />);

    expect(screen.getByText("US dollar ($)")).toBeInTheDocument();
    expect(screen.getByText("Per term")).toBeInTheDocument();
  });

  it("never names a payment processor", () => {
    const { container } = render(<YourArrangement pricing={pricing()} />);
    expect(container.textContent).not.toMatch(/Paystack|Payment method|card/i);
  });
});
