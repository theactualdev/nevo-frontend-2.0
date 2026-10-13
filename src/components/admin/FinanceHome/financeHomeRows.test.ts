import { describe, expect, it } from "vitest";
import type { Invoice, Subscription, UpcomingCharge } from "@/lib/api/billing";
import { financeHomeRows, overdueCount } from "./financeHomeRows";

/**
 * Every row here is a statement about a school's money, and `UpcomingCharge`
 * has five nullable fields. So these are mostly about what the screen REFUSES
 * to say: no row from a null, no payment verdict from a list that did not
 * answer, and no red anywhere — overdue billing never gates access.
 */

const sub = (over: Partial<Subscription["pricing"]> = {}): Subscription => ({
  schoolId: "sch1",
  schoolName: "Brightgate Academy",
  contractStart: "2026-09-01T00:00:00Z",
  contractEnd: "2029-09-01T00:00:00Z",
  renewalBannerVisible: false,
  renewalMessage: null,
  billingContact: null,
  paymentMethod: null,
  pricing: {
    pricingModel: "per_student",
    pricingPlan: "annual",
    accessWindow: "full_year",
    studentCount: 500,
    perStudentRate: "150000.00",
    rateType: "founding_partner",
    rateLockedUntil: "2029-09-01T00:00:00Z",
    totalBeforeVat: "75000000.00",
    vatRate: "7.5",
    vatAmount: "5625000.00",
    totalWithVat: "80625000.00",
    currency: "NGN",
    ...over,
  } as Subscription["pricing"],
});

const invoice = (status: Invoice["status"]): Invoice =>
  ({
    id: `i-${status}`,
    invoiceNumber: "003",
    issuedAt: "2026-09-01T00:00:00Z",
    amount: "80625000.00",
    status,
    dueAt: "2026-09-01T00:00:00Z",
    paidAt: null,
    pdfUrl: "",
  }) as Invoice;

const upcoming = (over: Partial<UpcomingCharge> = {}): UpcomingCharge => ({
  invoiceId: "i1",
  invoiceNumber: "004",
  dueAt: "2026-09-01T00:00:00Z",
  amount: "80625000.00",
  status: "pending",
  renewalBannerVisible: false,
  renewalMessage: null,
  ...over,
});

const keys = (r: ReturnType<typeof financeHomeRows>) => r.map((x) => x.key);

describe("overdueCount", () => {
  it("is null when the invoice list did not answer", () => {
    // Null is "we did not find out". It must never become "nothing is overdue".
    expect(overdueCount(null)).toBeNull();
  });

  it("counts only overdue invoices", () => {
    expect(
      overdueCount([invoice("paid"), invoice("overdue"), invoice("pending")]),
    ).toBe(1);
  });
});

describe("financeHomeRows", () => {
  it("shows nothing at all without a subscription", () => {
    expect(financeHomeRows(null, upcoming(), [])).toEqual([]);
  });

  it("raises unsettled invoices without claiming access is at risk", () => {
    const rows = financeHomeRows(sub(), null, [invoice("overdue")]);
    const row = rows.find((r) => r.key === "overdue")!;
    expect(row.title).toBe("One invoice hasn't been settled yet");
    // Overdue billing never gates access - a design law, not a preference.
    expect(row.sub).toMatch(/keeps full access/);
    expect(row.kind).toBe("soft");
  });

  it("raises no overdue row when the list did not answer", () => {
    // A floor masquerading as a verdict. The hero says so instead.
    expect(keys(financeHomeRows(sub(), null, null))).not.toContain("overdue");
  });

  it("omits the upcoming row when either half is null", () => {
    expect(
      keys(financeHomeRows(sub(), upcoming({ dueAt: null }), [])),
    ).not.toContain("upcoming");
    expect(
      keys(financeHomeRows(sub(), upcoming({ amount: null }), [])),
    ).not.toContain("upcoming");
  });

  it("says a next invoice is DUE, never that it issues", () => {
    // `UpcomingCharge` carries a due date and no issue date. The frame's
    // "issues on" would name a different event entirely.
    const row = financeHomeRows(sub(), upcoming(), [])!.find(
      (r) => r.key === "upcoming",
    )!;
    expect(row.title).toMatch(/is due 1 September 2026/);
    expect(row.title).not.toMatch(/issues/i);
  });

  it("promises no email - the billing page is what updates (Lydia, 7 Oct)", () => {
    const row = financeHomeRows(sub(), upcoming(), [])!.find((r) => r.key === "upcoming")!;
    expect(row.sub).toMatch(/Your billing page updates once a transfer clears\.$/);
    expect(row.sub).not.toMatch(/email/i);
  });

  it("omits the rate lock when there is no locked-until date", () => {
    expect(
      keys(financeHomeRows(sub({ rateLockedUntil: null }), null, [])),
    ).not.toContain("rate-lock");
  });

  it("names the founding-partner rate only when that is the rate type", () => {
    const founding = financeHomeRows(sub(), null, []).find(
      (r) => r.key === "rate-lock",
    )!;
    expect(founding.title).toMatch(/founding-partner rate is held until 1 September 2029/);

    const standard = financeHomeRows(sub({ rateType: "standard" }), null, []).find(
      (r) => r.key === "rate-lock",
    )!;
    expect(standard.title).toBe("Your rate is held until 1 September 2029");
    expect(standard.title).not.toMatch(/founding/i);
  });

  it("never prints a VAT rate, in any row", () => {
    // "7.5" and "0.075" are indistinguishable on the contract and differ by
    // 100x on screen. Billing shows the amount for that reason; so does this.
    const rows = financeHomeRows(sub(), upcoming(), [invoice("overdue")]);
    for (const r of rows) {
      expect(`${r.title} ${r.sub}`).not.toMatch(/7\.5\s*%|0\.075|VAT rate/i);
    }
  });

  it("omits the payment row rather than inventing a card", () => {
    expect(keys(financeHomeRows(sub(), null, []))).not.toContain(
      "payment-method",
    );
  });

  it("sends every row to Billing", () => {
    const rows = financeHomeRows(sub(), upcoming(), [invoice("overdue")]);
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) expect(r.href).toBe("/admin/billing");
  });
});
