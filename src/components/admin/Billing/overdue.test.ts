import { describe, expect, it } from "vitest";
import type { Invoice } from "@/lib/api/billing";
import { OVERDUE_LINE, overdueHeadline, overdueLine, overduePanel } from "./overdue";

/**
 * D11.8, whose constraints are absolute: no red, no warning glyph, no
 * countdown - and, since the 2 Nov audit, no number worked out on this
 * device. Since 4 Nov every figure here is the invoice read's own.
 */

const inv = (over: Partial<Invoice> = {}): Invoice => ({
  id: "inv1",
  invoiceNumber: "NEV-003",
  issuedAt: "2026-01-01T00:00:00Z",
  amount: "54825000.00",
  status: "overdue",
  dueAt: "2026-02-01",
  paidAt: null,
  pdfUrl: "/x.pdf",
  currency: "NGN",
  periodLabel: null,
  studentCount: null,
  perStudentRate: null,
  totalBeforeVat: null,
  vatAmount: null,
  ...over,
});

const money = (a: string) => `N${a}`;
const day = (iso: string) => iso.slice(0, 10);

describe("the overdue row line", () => {
  it("says the server's day count and that nothing has changed for the children", () => {
    expect(overdueLine(12)).toBe("12 days past its due date. Nothing has changed for your students.");
    expect(overdueLine(1)).toBe("1 day past its due date. Nothing has changed for your students.");
  });

  it("is the plain line when the server gives no count", () => {
    expect(overdueLine(undefined)).toBe(OVERDUE_LINE);
    expect(overdueLine(0)).toBe(OVERDUE_LINE);
    expect(OVERDUE_LINE).toBe("Past its due date. Nothing has changed for your students.");
  });

  it("carries no consequence", () => {
    for (const line of [overdueLine(200), OVERDUE_LINE]) {
      expect(line).not.toMatch(/suspend|access|risk|lose|warning/i);
    }
  });
});

describe("the page panel", () => {
  it("shows only on the server's word", () => {
    expect(overduePanel([inv({ outstandingCount: 2, outstandingTotal: "1.00" })])).toBeNull();
    expect(overduePanel([inv({ overduePanelApplies: false, outstandingCount: 2, outstandingTotal: "1.00" })])).toBeNull();
    expect(overduePanel(null)).toBeNull();
  });

  it("takes the count and total as given - nothing summed here", () => {
    const rows = [
      inv({ id: "a", overduePanelApplies: true, outstandingCount: 3, outstandingTotal: "164475000.00" }),
      inv({ id: "b", overduePanelApplies: true, outstandingCount: 3, outstandingTotal: "164475000.00" }),
    ];
    const panel = overduePanel(rows)!;
    expect(panel).toMatchObject({ count: 3, total: "164475000.00", only: null });
    expect(overdueHeadline(panel, money, day)).toBe(
      "3 invoices are outstanding, totalling N164475000.00.",
    );
  });

  it("names the one invoice when there is exactly one", () => {
    const one = inv({ overduePanelApplies: true, outstandingCount: 1, outstandingTotal: "54825000.00" });
    const panel = overduePanel([one, inv({ id: "p", status: "paid", invoiceNumber: "NEV-002" })])!;
    expect(overdueHeadline(panel, money, day)).toBe(
      "N54825000.00 is outstanding from NEV-003, issued 2026-01-01.",
    );
  });

  it("says the server's total when the one unpaid invoice isn't in this list", () => {
    const panel = overduePanel([
      inv({ status: "paid", overduePanelApplies: true, outstandingCount: 1, outstandingTotal: "9.00" }),
    ])!;
    expect(overdueHeadline(panel, money, day)).toBe("N9.00 is outstanding.");
  });
});
