"use client";

import { useState } from "react";
import { billingApi, invoicePdfPath, type Invoice } from "@/lib/api/billing";

/**
 * The invoice PDF, fetched with the token a plain link cannot carry.
 *
 * This was `<a href={inv.pdfUrl} target="_blank">` under a comment reading "the
 * API hands us the PDF's own URL, so this is a plain link rather than a
 * fetch-and-blob". The only PDF route in the contract is
 * `GET /billing/invoices/{school_id}/{invoice_number}.pdf`, secured with
 * HTTPBearer, and this app's auth is Bearer-only out of localStorage - the
 * backend issues no cookies. A top-level navigation sends no Authorization
 * header, so every invoice in the history opened a 401; and a backend-relative
 * `pdfUrl` resolved against the Next origin instead, which is a 404. There is
 * no other route to the document on the screen.
 *
 * A pre-signed link to some other host still works as a plain link and is left
 * as one - `invoicePdfPath` returns null for those.
 *
 * The download is an anchor click rather than `window.open`, because a popup
 * opened after an await is exactly what a popup blocker eats.
 */
export function InvoicePdfLink({
  invoice,
  className,
  label = "PDF",
}: {
  invoice: Invoice;
  className?: string;
  /** "PDF" in a list row; the detail page's button says "Download PDF". */
  label?: string;
}) {
  const [state, setState] = useState<"" | "loading" | "failed">("");
  const path = invoicePdfPath(invoice.pdfUrl);

  if (!path) {
    return (
      <a
        href={invoice.pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {label}
      </a>
    );
  }

  const fetchIt = () => {
    if (state === "loading") return;
    setState("loading");
    billingApi
      .invoicePdf(path)
      .then((blob) => {
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = `${invoice.invoiceNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
        setState("");
      })
      // No red, and no dead end: it says what happened and stays pressable.
      .catch(() => setState("failed"));
  };

  return (
    <span className="flex shrink-0 flex-col items-end">
      <button type="button" onClick={fetchIt} className={className}>
        {state === "loading" ? "Fetching…" : state === "failed" ? "Try again" : label}
      </button>
      {state === "failed" && (
        <span className="mt-0.5 text-[12px] text-nevo-near-black/55">
          That didn&rsquo;t download
        </span>
      )}
    </span>
  );
}
