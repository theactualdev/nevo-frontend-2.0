import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Invoice, UpcomingCharge } from "@/lib/api/billing";
import { BillingView } from "./BillingView";

/**
 * "How to pay" rendered whatever the upcoming charge said - a paid invoice, or
 * none at all - so a school with nothing to pay met bank details and a
 * disabled "I've made this transfer". And the footer showed a school the
 * internal design code "(D11d)".
 */

const upcoming = vi.fn();
let rows: Invoice[] = [];

vi.mock("@/lib/api/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/billing")>();
  return {
    ...actual,
    billingApi: {
      ...actual.billingApi,
      subscription: async () => ({
        schoolId: "sch1",
        schoolName: "Brightgate Academy",
        contractStart: null,
        contractEnd: null,
        renewalBannerVisible: false,
        renewalMessage: null,
        billingContact: null,
        paymentMethod: null,
        pricing: {
          pricingModel: "per_student",
          pricingPlan: "annual",
          accessWindow: "school_session",
          studentCount: 340,
          perStudentRate: "150000.00",
          rateType: "standard",
          rateLockedUntil: null,
          totalBeforeVat: "51000000.00",
          vatRate: "7.50",
          vatAmount: "3825000.00",
          totalWithVat: "54825000.00",
          currency: "NGN",
        },
      }),
      invoices: async () => rows,
      receivingAccount: async () => ({
        bankName: "Kuda Bank",
        accountNumber: "1234567890",
        accountName: "Nevo Learning Ltd",
        currency: "NGN",
      }),
      upcoming: () => upcoming(),
    },
  };
});

const charge = (over: Partial<UpcomingCharge>): UpcomingCharge => ({
  invoiceId: "inv1",
  invoiceNumber: "NEV-003",
  dueAt: "2026-10-30T00:00:00Z",
  amount: "54825000.00",
  status: "pending",
  renewalBannerVisible: false,
  renewalMessage: null,
  ...over,
});

beforeEach(() => {
  upcoming.mockReset();
  rows = [];
});

describe("Billing's How to pay", () => {
  it("shows when an invoice is owed", async () => {
    upcoming.mockResolvedValue(charge({}));
    const { container } = render(<BillingView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/How to pay/));
    expect(visibleText(container)).toMatch(/NEV-003/);
  });

  it("stays away when the upcoming invoice is already paid", async () => {
    upcoming.mockResolvedValue(charge({ status: "paid" }));
    const { container } = render(<BillingView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Brightgate|cost/i));
    await waitFor(() => expect(upcoming).toHaveBeenCalled());
    expect(visibleText(container)).not.toMatch(/How to pay/);
  });

  it("stays away when there is no invoice to pay against", async () => {
    upcoming.mockResolvedValue(charge({ invoiceId: null, invoiceNumber: null, status: null }));
    const { container } = render(<BillingView />);
    await waitFor(() => expect(upcoming).toHaveBeenCalled());
    await waitFor(() => expect(visibleText(container)).toMatch(/Plan options/));
    expect(visibleText(container)).not.toMatch(/How to pay/);
    expect(screen.queryByRole("button", { name: /made this transfer/ })).toBeNull();
  });

  it("never shows a school an internal design code", async () => {
    upcoming.mockResolvedValue(charge({}));
    const { container } = render(<BillingView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Plan options/));
    expect(visibleText(container)).not.toMatch(/\bD\d{2}[a-z]?\b/);
  });
});

describe("Billing's invoice list", () => {
  it("opens each invoice on its own page", async () => {
    upcoming.mockResolvedValue(charge({ invoiceId: null, invoiceNumber: null, status: null }));
    rows = [
      {
        id: "inv2",
        invoiceNumber: "NEV-002",
        issuedAt: "2026-09-01T00:00:00Z",
        amount: "54825000.00",
        status: "paid",
        dueAt: "2026-10-01T00:00:00Z",
        paidAt: "2026-09-12T00:00:00Z",
        pdfUrl: "/api/v1/billing/invoices/sch1/NEV-002.pdf",
        currency: "NGN",
        periodLabel: null,
        studentCount: null,
        perStudentRate: null,
        totalBeforeVat: null,
        vatAmount: null,
      },
    ];
    render(<BillingView />);
    const link = await screen.findByRole("link", { name: "NEV-002" });
    expect(link.getAttribute("href")).toBe("/admin/billing/invoices/inv2");
  });
});
