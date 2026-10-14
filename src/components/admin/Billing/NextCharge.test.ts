import { describe, expect, it } from "vitest";
import type { Invoice, UpcomingCharge } from "@/lib/api/billing";
import { nextChargeCopy } from "./NextCharge";

/**
 * L1, Lydia's 14 Oct copy. The day count is the server's; the students and
 * VAT come from the charge's recorded lines first, then the invoice; nothing
 * is invented for a charge that carries neither.
 */

const charge = (over: Partial<UpcomingCharge> = {}): UpcomingCharge => ({
  invoiceId: "inv1",
  invoiceNumber: "NEV-003",
  dueAt: "2027-01-15T00:00:00Z",
  amount: "150500.00",
  status: "pending",
  renewalBannerVisible: false,
  renewalMessage: null,
  ...over,
});

const invoice = (over: Partial<Invoice> = {}): Invoice =>
  ({
    id: "inv1",
    invoiceNumber: "NEV-003",
    issuedAt: "2026-12-01T00:00:00Z",
    amount: "150500.00",
    status: "pending",
    dueAt: "2027-01-15T00:00:00Z",
    paidAt: null,
    pdfUrl: "",
    currency: "NGN",
    periodLabel: "First term 2026/27",
    studentCount: 1,
    perStudentRate: "140000.00",
    totalBeforeVat: "140000.00",
    vatAmount: "10500.00",
    ...over,
  }) as Invoice;

describe("nextChargeCopy", () => {
  it("reads as Lydia wrote it", () => {
    const c = nextChargeCopy(charge(), invoice(), "NGN");
    expect(`${c.amount}${c.when}`).toBe("₦150,500 on 15 January 2027");
    expect(c.covers).toBe("Covers First term 2026/27 · 1 student · includes ₦10,500 VAT");
    expect(c.overdue).toBe(false);
  });

  it("says overdue with the server's day count", () => {
    const c = nextChargeCopy(charge({ status: "overdue", daysOverdue: 6 }), invoice(), "NGN");
    expect(`${c.amount}${c.when}`).toBe("₦150,500 was due on 15 January 2027, 6 days ago");
    expect(c.overdue).toBe(true);
  });

  it("says one day, and no count when the server sent none", () => {
    expect(nextChargeCopy(charge({ status: "overdue", daysOverdue: 1 }), invoice(), "NGN").when).toBe(
      " was due on 15 January 2027, 1 day ago",
    );
    expect(nextChargeCopy(charge({ status: "overdue", daysOverdue: null }), invoice(), "NGN").when).toBe(
      " was due on 15 January 2027",
    );
  });

  it("takes the students and VAT from the charge's own recorded lines first", () => {
    const c = nextChargeCopy(
      charge({
        lineItems: [
          { description: "Subscription", amount: "280000.00", currency: "NGN", kind: "subscription", quantity: 2, unitAmount: "140000.00" },
          { description: "VAT", amount: "21000.00", currency: "NGN", kind: "vat", percentageRate: 7.5 },
        ],
      }),
      invoice(),
      "NGN",
    );
    expect(c.covers).toBe("Covers First term 2026/27 · 2 students · includes ₦21,000 VAT");
  });

  it("invents nothing for a charge that carries no breakdown", () => {
    const c = nextChargeCopy(charge({ lineItems: [] }), null, "NGN");
    expect(c.covers).toBeNull();
  });
});
