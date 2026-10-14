import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type {
  Invoice,
  InvoiceTransferDetails,
  TransferReport,
  UpcomingCharge,
} from "@/lib/api/billing";
import { BillingView } from "./BillingView";

/**
 * "How to pay" rendered whatever the upcoming charge said - a paid invoice, or
 * none at all - so a school with nothing to pay met bank details and a
 * disabled "I've made this transfer". And the footer showed a school the
 * internal design code "(D11d)".
 */

const upcoming = vi.fn();
const reportsRead = vi.fn<() => Promise<TransferReport[]>>(async () => []);
const detailsRead = vi.fn<(id: string) => Promise<InvoiceTransferDetails | null>>(
  async () => null,
);
const reportTransfer = vi.fn<(id: string, ref: string) => Promise<TransferReport>>();
let rows: Invoice[] = [];
let rateType = "standard";

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
          rateType,
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
      transferReports: () => reportsRead(),
      invoiceTransferDetails: (id: string) => detailsRead(id),
      reportTransfer: (id: string, ref: string) => reportTransfer(id, ref),
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
  reportsRead.mockReset().mockResolvedValue([]);
  detailsRead.mockReset().mockResolvedValue(null);
  reportTransfer.mockReset();
  rows = [];
  rateType = "standard";
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
    await waitFor(() => expect(visibleText(container)).toMatch(/Billing contact/));
    expect(visibleText(container)).not.toMatch(/How to pay/);
    expect(screen.queryByRole("button", { name: /made this transfer/ })).toBeNull();
  });

  it("never shows a school an internal design code", async () => {
    upcoming.mockResolvedValue(charge({}));
    const { container } = render(<BillingView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Billing contact/));
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

describe("D11's subscription card", () => {
  it("does not put 'Payment due' beside the annual total", async () => {
    /*
     * QA, 10 Oct: the card showed the annual total with "Payment due" beside
     * it while How to pay asked for the upcoming invoice, so it read as if
     * the year were due. What is due is on the Next charge card.
     */
    upcoming.mockResolvedValue(charge({ status: "pending" }));
    const { container } = render(<BillingView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/How to pay/));
    expect(visibleText(container)).not.toMatch(/Payment due/);
    expect(visibleText(container)).not.toMatch(/\bActive\b/);
  });

  it("says on the Next charge card what that invoice covers", async () => {
    upcoming.mockResolvedValue(charge({ status: "pending", amount: "150500.00" }));
    rows = [
      {
        id: "inv1",
        invoiceNumber: "NEV-003",
        issuedAt: "2026-09-01T00:00:00Z",
        amount: "150500.00",
        status: "pending",
        dueAt: "2026-10-30T00:00:00Z",
        paidAt: null,
        pdfUrl: "/api/billing/invoices/sch1/NEV-003.pdf",
        currency: "NGN",
        periodLabel: "First term 2026/27",
        studentCount: 1,
        perStudentRate: "140000.00",
        totalBeforeVat: "140000.00",
        vatAmount: "10500.00",
      },
    ];
    const { container } = render(<BillingView />);
    // L1 (Lydia, 14 Oct): "₦150,500 on 30 October 2026", then what it covers.
    await waitFor(() => expect(visibleText(container)).toMatch(/Covers First term 2026\/27/));
    const text = visibleText(container);
    expect(text).toMatch(/₦150,500 on 30 October 2026/);
    expect(text).toMatch(/Covers First term 2026\/27 · 1 student · includes ₦10,500 VAT/);
    expect(text).not.toMatch(/Your students. lessons carry on as normal/);
  });

  it("says overdue as a fact about a date, and that lessons carry on (L1)", async () => {
    upcoming.mockResolvedValue(
      charge({ status: "overdue", amount: "150500.00", dueAt: "2026-10-30T00:00:00Z", daysOverdue: 6 }),
    );
    const { container } = render(<BillingView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/was due on 30 October 2026, 6 days ago/));
    const text = visibleText(container);
    expect(screen.getByRole("heading", { name: "Overdue" })).toBeInTheDocument();
    expect(text).toMatch(/Your students. lessons carry on as normal\./);
  });

  it("says active once it is paid", async () => {
    upcoming.mockResolvedValue(charge({ status: "paid" }));
    const { container } = render(<BillingView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/\bActive\b/));
    expect(visibleText(container)).not.toMatch(/Payment due/);
  });

  it("claims neither when there is no invoice to judge by", async () => {
    upcoming.mockResolvedValue(charge({ invoiceId: null, invoiceNumber: null, status: null }));
    const { container } = render(<BillingView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Plan options|cost/i));
    await waitFor(() => expect(upcoming).toHaveBeenCalled());
    expect(visibleText(container)).not.toMatch(/Payment due|\bActive\b/);
  });

  it("carries the Founding Partner pill for a school on that rate", async () => {
    rateType = "founding_partner";
    upcoming.mockResolvedValue(charge({}));
    const { container } = render(<BillingView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Founding Partner/i));
  });
});

const reported = (invoiceId: string): TransferReport => ({
  transactionId: "t1",
  invoiceId,
  bankReference: "FBN-TRF-99183",
  status: "awaiting_confirmation",
  message: "Transfer reported. Nevo finance has not confirmed it yet.",
});

const unpaidRow = (id: string, invoiceNumber: string): Invoice => ({
  id,
  invoiceNumber,
  issuedAt: "2026-09-01T00:00:00Z",
  amount: "54825000.00",
  status: "pending",
  dueAt: "2026-10-30T00:00:00Z",
  paidAt: null,
  pdfUrl: "/api/v1/billing/invoices/sch1/x.pdf",
  currency: "NGN",
  periodLabel: null,
  studentCount: null,
  perStudentRate: null,
  totalBeforeVat: null,
  vatAmount: null,
});

describe("a reported transfer (9 Oct)", () => {
  it("quotes the reference the per-invoice read serves", async () => {
    upcoming.mockResolvedValue(charge({}));
    detailsRead.mockResolvedValue({
      bankName: "Kuda Bank",
      accountNumber: "1234567890",
      accountName: "Nevo Learning Ltd",
      currency: "NGN",
      invoiceId: "inv1",
      reference: "NEV-2026-0003",
    });
    const { container } = render(<BillingView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/NEV-2026-0003/));
    expect(detailsRead).toHaveBeenCalledWith("inv1");
  });

  it("is still pending after a reload, because the server keeps it", async () => {
    upcoming.mockResolvedValue(charge({}));
    rows = [unpaidRow("inv1", "NEV-003")];
    reportsRead.mockResolvedValue([reported("inv1")]);
    const { container } = render(<BillingView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Payment sent, pending verification/),
    );
    expect(visibleText(container)).toMatch(/Pending verification/);
    expect(screen.queryByRole("button", { name: /made this transfer/ })).toBeNull();
  });

  it("files a report, never a confirmation, and marks the invoice pending", async () => {
    upcoming.mockResolvedValue(charge({}));
    rows = [unpaidRow("inv1", "NEV-003")];
    reportTransfer.mockResolvedValue(reported("inv1"));
    const { container } = render(<BillingView />);
    const open = await screen.findByRole("button", { name: /made this transfer/ });
    open.click();
    const input = await waitFor(() => {
      const el = container.querySelector("input");
      expect(el).not.toBeNull();
      return el as HTMLInputElement;
    });
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
      input,
      "FBN-TRF-99183",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const record = await screen.findByRole("button", { name: "Record transfer" });
    await waitFor(() => expect((record as HTMLButtonElement).disabled).toBe(false));
    record.click();
    await waitFor(() => expect(reportTransfer).toHaveBeenCalledWith("inv1", "FBN-TRF-99183"));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Payment sent, pending verification/),
    );
  });
});
