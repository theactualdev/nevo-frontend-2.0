import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Invoice } from "@/lib/api/billing";
import { externalPdfUrl } from "@/lib/api/billing";
import { InvoicePdfLink } from "./InvoicePdfLink";

/**
 * QA, 10 Oct: pressing an invoice's "PDF" reloaded the page. An empty
 * `pdfUrl` fell through to `<a href="">`. No document, no link.
 */

const { invoicePdf } = vi.hoisted(() => ({ invoicePdf: vi.fn() }));
vi.mock("@/lib/api/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/billing")>();
  return { ...actual, billingApi: { ...actual.billingApi, invoicePdf: (p: string) => invoicePdf(p) } };
});

beforeEach(() => {
  invoicePdf.mockReset().mockResolvedValue(new Blob(["%PDF"]));
  // jsdom has no object URLs; the download is an anchor click on one.
  URL.createObjectURL = vi.fn(() => "blob:invoice");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
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

// SCRUM-98's three states and its failure line (backlog 105).
describe("downloading an invoice", () => {
  const OURS = "/api/billing/invoices/s1/NEV-001.pdf";

  it("settles on Downloaded once the file has come, with no toast", async () => {
    render(<InvoicePdfLink invoice={invoice(OURS)} />);

    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    expect(screen.getByRole("button", { name: "Fetching…" })).toBeInTheDocument();

    expect(await screen.findByRole("button", { name: "Downloaded" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says SCRUM-98's line when it fails, and offers it again", async () => {
    invoicePdf.mockRejectedValueOnce(new Error("500"));
    render(<InvoicePdfLink invoice={invoice(OURS)} />);

    fireEvent.click(screen.getByRole("button", { name: "PDF" }));

    const line = await screen.findByText(
      "That didn’t download. We’re on it, and the invoice is unchanged.",
    );
    const again = screen.getByRole("button", { name: "Try again" });
    expect(again).toHaveAttribute("aria-describedby", line.id);

    fireEvent.click(again);
    expect(await screen.findByRole("button", { name: "Downloaded" })).toBeInTheDocument();
    expect(screen.queryByText(/didn’t download/)).not.toBeInTheDocument();
  });
});
