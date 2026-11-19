"use client";

import { useId, useState } from "react";
import {
  billingApi,
  externalPdfUrl,
  invoicePdfPath,
  type Invoice,
} from "@/lib/api/billing";

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
 * NO DOCUMENT, NO LINK. An empty or malformed `pdfUrl` also returned null from
 * `invoicePdfPath`, and fell through to `<a href="">` - which reloads the page
 * the admin is on. QA met exactly that on 10 Oct. Nothing renders now unless
 * there is a document to open.
 *
 * The download is an anchor click rather than `window.open`, because a popup
 * opened after an await is exactly what a popup blocker eats.
 *
 * SCRUM-98's THREE STATES (backlog 105): idle, a brief working label, then a
 * settled "Downloaded" - "no toast". It went back to "PDF" when the file had
 * arrived, which looked the same as a press that did nothing. A failure is
 * the spec's violet line, in full - "That didn't download. We're on it, and
 * the invoice is unchanged." - with Try again.
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
  const [state, setState] = useState<"" | "loading" | "done" | "failed">("");
  const failedLineId = useId();
  const path = invoicePdfPath(invoice.pdfUrl);

  if (!path) {
    const external = externalPdfUrl(invoice.pdfUrl);
    if (!external) return null;
    return (
      <a
        href={external}
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
        setState("done");
      })
      // No red, and no dead end: it says what happened and stays pressable.
      .catch(() => setState("failed"));
  };

  return (
    <span className="flex shrink-0 flex-col items-end">
      {/* Downloaded stays pressable: another copy is a fair thing to want. */}
      <button
        type="button"
        onClick={fetchIt}
        aria-describedby={state === "failed" ? failedLineId : undefined}
        className={className}
      >
        {state === "loading"
          ? "Fetching…"
          : state === "failed"
            ? "Try again"
            : state === "done"
              ? "Downloaded"
              : label}
      </button>
      {state === "failed" && (
        <span
          id={failedLineId}
          role="status"
          className="mt-0.5 max-w-[260px] text-right text-[12px] leading-[1.45] text-nevo-violet-text"
        >
          That didn&rsquo;t download. We&rsquo;re on it, and the invoice is unchanged.
        </span>
      )}
    </span>
  );
}
