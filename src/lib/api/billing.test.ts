import { describe, expect, it } from "vitest";
import {
  invoicePdfPath,
  latestReportByInvoice,
  type TransferReport,
} from "./billing";

const report = (
  transactionId: string,
  invoiceId: string,
  status: TransferReport["status"] = "awaiting_confirmation",
): TransferReport => ({
  transactionId,
  invoiceId,
  bankReference: `REF-${transactionId}`,
  status,
  message: "",
});

describe("latestReportByInvoice", () => {
  it("keeps each invoice's newest report - the list arrives newest first", () => {
    const byInvoice = latestReportByInvoice([
      report("t3", "i1", "confirmed"),
      report("t2", "i2"),
      report("t1", "i1"),
    ]);
    expect(byInvoice.i1.transactionId).toBe("t3");
    expect(byInvoice.i2.transactionId).toBe("t2");
    expect(Object.keys(byInvoice)).toHaveLength(2);
  });

  it("is empty when nothing has been reported", () => {
    expect(latestReportByInvoice([])).toEqual({});
  });
});

describe("invoicePdfPath", () => {
  it("keeps a relative path as it is", () => {
    expect(invoicePdfPath("/api/billing/invoices/s1/NEV-2026-0001.pdf")).toBe(
      "/api/billing/invoices/s1/NEV-2026-0001.pdf",
    );
  });

  it("reduces our own absolute URL to a path the proxy can carry", () => {
    // The browser cannot call the backend directly - it serves no CORS
    // headers, which is why BASE_URL is a same-origin proxy.
    expect(
      invoicePdfPath(
        "https://api.nevolearning.com/api/billing/invoices/s1/NEV-1.pdf",
      ),
    ).toBe("/api/billing/invoices/s1/NEV-1.pdf");
    expect(
      invoicePdfPath("https://nevolearning.com/api/billing/x.pdf?v=2"),
    ).toBe("/api/billing/x.pdf?v=2");
  });

  it("recognises the backend's Render addresses, not only nevolearning.com", () => {
    // The API answered from Render's -kn3d host from 29 Sep to 17 Oct, so
    // invoice rows written then may still name it. Its live Render address
    // serves the same API as api.nevolearning.com. A check that knew only
    // nevolearning.com would treat those PDFs as a stranger's link.
    expect(
      invoicePdfPath(
        "https://nevo-backend-2-0-kn3d.onrender.com/api/billing/invoices/s1/NEV-2.pdf",
      ),
    ).toBe("/api/billing/invoices/s1/NEV-2.pdf");
    expect(
      invoicePdfPath(
        "https://nevo-backend-2-0.onrender.com/api/billing/invoices/s1/NEV-3.pdf",
      ),
    ).toBe("/api/billing/invoices/s1/NEV-3.pdf");
    // Another app on the same hosting provider is still somebody else.
    // Where the API answers since 25 Oct.
    expect(
      invoicePdfPath(
        "https://nevo-backend-2-0-zxoz.onrender.com/api/billing/invoices/s1/NEV-4.pdf",
      ),
    ).toBe("/api/billing/invoices/s1/NEV-4.pdf");
    expect(invoicePdfPath("https://someone-else.onrender.com/x.pdf")).toBeNull();
  });

  it("leaves somebody else's link alone", () => {
    // A pre-signed object-store URL carries its own auth and must NOT be
    // rewritten into a path on our proxy, which would 404.
    expect(
      invoicePdfPath("https://s3.eu-west-1.amazonaws.com/nevo/inv.pdf?X-Sig=a"),
    ).toBeNull();
    // A lookalike host is not ours either.
    expect(invoicePdfPath("https://nevolearning.com.evil.test/x.pdf")).toBeNull();
  });

  it("returns null on something that is not a URL at all", () => {
    expect(invoicePdfPath("")).toBeNull();
    expect(invoicePdfPath("not a url")).toBeNull();
  });
});
