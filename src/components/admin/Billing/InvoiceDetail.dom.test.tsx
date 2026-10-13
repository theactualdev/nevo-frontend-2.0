import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Invoice } from "@/lib/api/billing";
import { InvoiceDetailView } from "./InvoiceDetailView";

/**
 * D11b: invoice rows in Billing opened nothing, and there was no page for one
 * invoice. The page finds the invoice among the school's own, shows the lines
 * the server sent, and offers the PDF - and an id that is not the school's is
 * said plainly rather than retried.
 */

const invoices = vi.fn();

vi.mock("@/lib/api/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/billing")>();
  return {
    ...actual,
    billingApi: {
      ...actual.billingApi,
      invoices: () => invoices(),
      subscription: async () => ({ schoolName: "Brightgate Academy" }),
    },
  };
});

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: "inv2",
  invoiceNumber: "NEV-002",
  issuedAt: "2026-09-01T00:00:00Z",
  amount: "54825000.00",
  status: "paid",
  dueAt: "2026-10-01T00:00:00Z",
  paidAt: "2026-09-12T00:00:00Z",
  pdfUrl: "/api/v1/billing/invoices/sch1/NEV-002.pdf",
  currency: "NGN",
  periodLabel: "Michaelmas 2026",
  studentCount: 340,
  perStudentRate: "150000.00",
  totalBeforeVat: "51000000.00",
  vatAmount: "3825000.00",
  vatRate: "7.50",
  ...over,
});

beforeEach(() => invoices.mockReset());

describe("the invoice detail page", () => {
  it("shows the invoice's own lines and its PDF", async () => {
    invoices.mockResolvedValue([invoice({ id: "inv1", invoiceNumber: "NEV-001" }), invoice()]);
    const { container } = render(<InvoiceDetailView invoiceId="inv2" />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Invoice NEV-002/));
    const text = visibleText(container);
    expect(text).not.toMatch(/NEV-001/);
    expect(text).toMatch(/340 students/);
    expect(text).toMatch(/VAT at 7\.5/);
    expect(text).toMatch(/Total with VAT/);
    expect(text).toMatch(/Brightgate Academy/);
    expect(text).toMatch(/Michaelmas 2026/);
    expect(text).toMatch(/Paid/);
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
  });

  it("says so when the id is not among the school's invoices, with no retry", async () => {
    invoices.mockResolvedValue([invoice()]);
    const { container } = render(<InvoiceDetailView invoiceId="someone-elses" />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/This invoice isn.t in your school.s billing/),
    );
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Billing/ }).getAttribute("href")).toBe("/admin/billing");
  });

  it("offers a retry when the read fails, and shows the invoice once it works", async () => {
    invoices.mockRejectedValueOnce(new Error("network")).mockResolvedValue([invoice()]);
    const { container } = render(<InvoiceDetailView invoiceId="inv2" />);
    const retry = await screen.findByRole("button", { name: /Try again/ });
    expect(visibleText(container)).not.toMatch(/isn.t in your school/);
    fireEvent.click(retry);
    await waitFor(() => expect(visibleText(container)).toMatch(/Invoice NEV-002/));
  });
});
