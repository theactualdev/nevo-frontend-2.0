"use client";

import type { Invoice } from "@/lib/api/billing";
import { formatMoney, formatVatRate } from "@/lib/money";
import { cn } from "@/lib/utils";
import { InvoicePdfLink } from "./InvoicePdfLink";

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";

/**
 * An invoice's lines - every figure the server's. Nothing here multiplies or
 * adds: the students, rate, subtotal, VAT and total all arrive on the invoice.
 * A line whose field is null is left out rather than computed from the others.
 *
 * Shared by the pay-and-activate screens and the invoice detail page, so an
 * invoice cannot be broken down two ways.
 */
export function InvoiceLines({ invoice }: { invoice: Invoice }) {
  const money = (v: string | null) => (v ? formatMoney(v, invoice.currency) : null);
  const vat = formatVatRate(invoice.vatRate);
  const lines: [string, string | null][] = [
    [
      invoice.studentCount != null && invoice.perStudentRate
        ? `${invoice.studentCount} ${invoice.studentCount === 1 ? "student" : "students"} × ${money(invoice.perStudentRate)}`
        : "Before VAT",
      money(invoice.totalBeforeVat),
    ],
    [vat ? `VAT at ${vat}` : "VAT", money(invoice.vatAmount)],
  ];
  return (
    <dl className="m-0 mt-4 flex flex-col gap-2 text-[14px]">
      {lines
        .filter(([, v]) => v)
        .map(([label, v]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-nevo-near-black/62">{label}</dt>
            <dd className="m-0 text-nevo-near-black tabular-nums">{v}</dd>
          </div>
        ))}
      <div className="mt-1 flex justify-between gap-4 border-t border-nevo-near-black/10 pt-2.5 font-semibold">
        <dt className="text-nevo-near-black">Total with VAT</dt>
        <dd className="m-0 text-nevo-near-black tabular-nums">{money(invoice.amount)}</dd>
      </div>
    </dl>
  );
}

/** The invoice as a card: its number, period, lines and PDF. */
export function InvoiceBreakdown({ invoice }: { invoice: Invoice }) {
  return (
    <div className={cn(CARD, "mt-4 px-[26px] py-[22px]")}>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="m-0 text-[15.5px] font-semibold text-nevo-near-black">
          Invoice {invoice.invoiceNumber}
        </h3>
        <InvoicePdfLink
          invoice={invoice}
          className="shrink-0 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
        />
      </div>
      {invoice.periodLabel ? (
        <p className="m-0 mt-1 text-[13px] text-nevo-near-black/55">{invoice.periodLabel}</p>
      ) : null}
      <InvoiceLines invoice={invoice} />
    </div>
  );
}
