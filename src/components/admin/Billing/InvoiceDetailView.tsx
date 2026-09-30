"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { billingApi, type Invoice } from "@/lib/api/billing";
import { longDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { NoAccess, failureKind } from "../NoAccess";
import { ReadFailed } from "../ReadFailed";
import { StatusPill } from "./BillingView";
import { InvoiceLines } from "./InvoiceBreakdown";
import { InvoicePdfLink } from "./InvoicePdfLink";

/**
 * D11b "Invoice detail" - one invoice, its lines, and its PDF.
 *
 * Invoice rows in Billing were not clickable and there was no page for one.
 * There is no single-invoice read in the contract, so this finds the invoice
 * in the list by id; a school's invoice list is short, and a second endpoint
 * for the same rows would only be another thing to disagree.
 *
 * TWO THINGS THE FRAME DRAWS ARE LEFT OUT, because nothing backs them:
 * - "Paystack reference" - `InvoiceResponse` carries no payment reference.
 * - the "FOUNDING PARTNER" pill - `rateType` belongs to the subscription as it
 *   is now, not to this invoice, and an old invoice labelled with today's rate
 *   type would be a claim about a charge it may not describe.
 * TODO(api): a payment reference, and the rate type, on `InvoiceResponse`.
 */

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";

type Phase = "loading" | "ready" | "failed" | "denied" | "missing";

export function InvoiceDetailView({ invoiceId }: { invoiceId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);

  const load = useCallback(() => {
    billingApi
      .invoices()
      .then((rows) => {
        const found = rows.find((r) => r.id === invoiceId) ?? null;
        setInvoice(found);
        // An id that is not among this school's invoices is not a failure to
        // retry - it will never appear.
        setPhase(found ? "ready" : "missing");
      })
      .catch((err: unknown) => {
        const kind = failureKind(err);
        setPhase(kind === "denied" ? "denied" : "failed");
      });
    billingApi
      .subscription()
      .then((s) => setSchoolName(s.schoolName?.trim() || null))
      .catch(() => setSchoolName(null));
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[720px]">
        <Link href="/admin/billing" className="text-[13.5px] font-semibold text-nevo-navy hover:underline">
          &larr; Billing
        </Link>

        {phase === "loading" ? (
          <div className={cn(CARD, "mt-5 h-[260px] animate-pulse")} />
        ) : phase === "denied" ? (
          <NoAccess what="billing" />
        ) : phase === "failed" ? (
          <div className={cn(CARD, "mt-5 px-[26px] py-6")}>
            <ReadFailed
              what="this invoice"
              onRetry={() => {
                setPhase("loading");
                load();
              }}
            />
          </div>
        ) : phase === "missing" || !invoice ? (
          <div className={cn(CARD, "mt-5 px-[26px] py-6")}>
            <h2 className="m-0 text-[19px] font-semibold text-nevo-near-black">
              This invoice isn&rsquo;t in your school&rsquo;s billing
            </h2>
            <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/62">
              The link may be out of date. Your invoices are all listed on
              Billing.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="m-0 text-[26px] font-semibold tracking-[-0.018em] text-nevo-near-black">
                Invoice {invoice.invoiceNumber}
              </h2>
              <StatusPill status={invoice.status} />
            </div>
            <p className="mt-1.5 text-[14.5px] text-nevo-near-black/60">
              Issued {longDate(invoice.issuedAt) ?? "—"}
              {schoolName ? ` · ${schoolName}` : ""}
              {invoice.periodLabel ? ` · ${invoice.periodLabel}` : ""}
            </p>

            <div className={cn(CARD, "mt-6 px-[26px] py-[22px]")}>
              <InvoiceLines invoice={invoice} />
              <p className="m-0 mt-4 text-[13px] text-nevo-near-black/55">
                {invoice.status === "paid"
                  ? `Paid ${longDate(invoice.paidAt) ?? ""}`.trim()
                  : `Due ${longDate(invoice.dueAt) ?? ""}`.trim()}
              </p>
            </div>

            <div className="mt-6">
              <InvoicePdfLink
                invoice={invoice}
                label="Download PDF"
                className="inline-flex h-[46px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-5 text-[14.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
