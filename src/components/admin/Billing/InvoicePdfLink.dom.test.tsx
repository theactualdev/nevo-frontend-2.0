import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Invoice } from "@/lib/api/billing";
import { externalPdfUrl } from "@/lib/api/billing";
import { InvoicePdfLink } from "./InvoicePdfLink";

/**
 * QA, 10 Oct: pressing an invoice's "PDF" reloaded the page. An empty
 * `pdfUrl` fell through to `<a href="">`. No document, no link.
 */

vi.mock("@/lib/api/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/billing")>();
  return { ...actual, billingApi: { ...actual.billingApi, invoicePdf: async () => new Blob() } };
});

const invoice = (pdfUrl: string): Invoice => ({
  id: "inv1",
  invoiceNumber: "NEV-001",
  issuedAt: "2026-09-01T00:00:00Z",
  amount: "150500.00",
  status: "pending",
  dueAt: "2026-10-01T00:00:00Z",
  paidAt: null,
  pdfUrl,
  currency: "NGN",
  periodLabel: null,
  studentCount: null,
  perStudentRate: null,
  totalBeforeVat: null,
  vatAmount: null,
});

describe("InvoicePdfLink", () => {
  it("renders nothing when there is no document", () => {
    const { container } = render(<InvoicePdfLink invoice={invoice("")} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a value that is not a URL at all", () => {
    const { container } = render(<InvoicePdfLink invoice={invoice("not a url")} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("fetches our own PDF with the token", () => {
    render(<InvoicePdfLink invoice={invoice("/api/billing/invoices/s1/NEV-001.pdf")} />);
    expect(screen.getByRole("button", { name: "PDF" })).toBeInTheDocument();
  });

  it("follows someone else's link as a plain link", () => {
    render(<InvoicePdfLink invoice={invoice("https://s3.eu-west-1.amazonaws.com/nevo/inv.pdf?X-Sig=a")} />);
    expect(screen.getByRole("link", { name: "PDF" })).toHaveAttribute(
      "href",
      "https://s3.eu-west-1.amazonaws.com/nevo/inv.pdf?X-Sig=a",
    );
  });
});

describe("externalPdfUrl", () => {
  it("accepts only an absolute http(s) URL", () => {
    expect(externalPdfUrl("")).toBeNull();
    expect(externalPdfUrl("javascript:alert(1)")).toBeNull();
    expect(externalPdfUrl("https://example.com/a.pdf")).toBe("https://example.com/a.pdf");
  });
});
