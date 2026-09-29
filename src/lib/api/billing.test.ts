import { describe, expect, it } from "vitest";
import {
  invoicePdfPath,
  transferAccepted,
  type PaymentOutcome,
} from "./billing";

const outcome = (status: PaymentOutcome["status"]): PaymentOutcome => ({
  transactionId: "t1",
  invoiceId: "i1",
  reference: "FBN-TRF-1",
  status,
  invoicePaid: false,
  message: null,
});

describe("transferAccepted", () => {
  it("accepts only what the backend actually took", () => {
    expect(transferAccepted(outcome("pending"))).toBe(true);
    expect(transferAccepted(outcome("success"))).toBe(true);
  });

  it("rejects the two that a 200 used to hide", () => {
    // Both came back 200 and were stored as transfers on file.
    expect(transferAccepted(outcome("failed"))).toBe(false);
    expect(transferAccepted(outcome("abandoned"))).toBe(false);
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

  it("recognises the backend where it lives now, not only where it used to", () => {
    // The backend moved to Render on 28-29 Sep. A check that knew only
    // nevolearning.com would have treated every PDF it now serves as a
    // stranger's link.
    expect(
      invoicePdfPath(
        "https://nevo-backend-2-0-kn3d.onrender.com/api/billing/invoices/s1/NEV-2.pdf",
      ),
    ).toBe("/api/billing/invoices/s1/NEV-2.pdf");
    // Another app on the same hosting provider is still somebody else.
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
