import type { Pricing, PricingCurrency } from "@/lib/api/billing";
import { cn } from "@/lib/utils";
import { CURRENCY_SYMBOL } from "@/lib/money";

/**
 * D11b's "Your arrangement" (backlog 106): what the school's invoices are in,
 * and how often they come - both the server's, from the subscription's
 * `pricing`.
 *
 * NOT D11b's "Payment method: Paystack". Payment is a bank transfer that Nevo
 * finance confirms (#738); naming a processor here would misstate how a
 * school's money arrives.
 *
 * NOT SCRUM-98's change controls ("Contact your relationship manager").
 * Neither D11b nor the spec gives the sentence that names each constraint,
 * and nothing gives a route to contact anyone; Lydia dropped them for now
 * (L50, 25 Nov). The plan cards' "Ask to switch" below is not one of them:
 * it is a request with a route.
 */

/** The frame's "Naira (₦)", and the same shape for the other two. */
const CURRENCY_NAME: Record<PricingCurrency, string> = {
  NGN: "Naira",
  USD: "US dollar",
  GBP: "Pound sterling",
};

/** The frame's "Annually"; "per term" is this page's word for the other plan. */
const INVOICED: Record<Pricing["pricingPlan"], string> = {
  annual: "Annually",
  per_term: "Per term",
};

export function YourArrangement({ pricing, className }: { pricing: Pricing; className?: string }) {
  const currency = CURRENCY_NAME[pricing.currency]
    ? `${CURRENCY_NAME[pricing.currency]} (${CURRENCY_SYMBOL[pricing.currency]})`
    : null;
  const invoiced = INVOICED[pricing.pricingPlan] ?? null;
  if (!currency && !invoiced) return null;
  return (
    <section
      aria-labelledby="arrangement-heading"
      className={cn(
        "rounded-xl bg-nevo-cream-elevated px-6 py-[22px] shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
        className,
      )}
    >
      <h3 id="arrangement-heading" className="m-0 text-[14.5px] font-semibold text-nevo-near-black">
        Your arrangement
      </h3>
      <dl className="m-0 mt-3 flex flex-wrap gap-x-12 gap-y-3">
        {currency ? (
          <div className="flex flex-col-reverse">
            <dt className="mt-0.5 text-[12px] text-nevo-near-black/55">Invoice currency</dt>
            <dd className="m-0 text-[16px] font-bold text-nevo-navy">{currency}</dd>
          </div>
        ) : null}
        {invoiced ? (
          <div className="flex flex-col-reverse">
            <dt className="mt-0.5 text-[12px] text-nevo-near-black/55">Invoiced</dt>
            <dd className="m-0 text-[16px] font-bold text-nevo-navy">{invoiced}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
