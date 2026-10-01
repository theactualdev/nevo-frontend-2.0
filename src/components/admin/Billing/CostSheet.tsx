"use client";

import type { Pricing } from "@/lib/api/billing";
import { formatVatRate, formatMoney, isAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * D11's cost sheet - what the school pays, and how it is arrived at.
 *
 * ============================================================================
 * IT USED TO COMPUTE THIS ITSELF, FROM A SHAPE THE API HAD STOPPED SERVING.
 *
 * Two separate faults, and the first hid the second for a week.
 *
 * The read was flat - `subscription.activeStudentCount`,
 * `subscription.perStudentAnnualRate`, `subscription.currency`. The deployed
 * contract has none of those names: they live under `pricing`, as
 * `studentCount` and `perStudentRate`. So every one of them was `undefined`,
 * `computeCost` returned null, and EVERY school was shown "your per-student
 * rate isn't set yet" - a false statement about their contract, on the screen
 * that exists to tell them what they pay.
 *
 * And underneath it, the arithmetic itself should not have been here. The
 * backend sends `totalBeforeVat`, `vatRate`, `vatAmount` and `totalWithVat`,
 * computed against the school's actual contract. This file derived them in
 * integer minor units from a hard-coded Nigerian 7.5% gated on `currency ===
 * "NGN"` - careful work against the wrong authority. A VAT-exempt school, a
 * grandfathered rate, or a rate change and the console disagrees with the
 * invoice the school is actually sent.
 *
 * So: NO ARITHMETIC IN THIS FILE. Every figure below is a string the server
 * computed, formatted and shown. The only thing this component decides is
 * wording.
 * ============================================================================
 *
 * THE VAT RATE IS PRINTED NOW, and for two releases it was not. The contract
 * typed it as a bare `string`, so "7.5" and "0.075" were the same rate a
 * hundredfold apart on screen and the line showed only the amount. Backend
 * settled it on 15 Sep - a percentage, documented with an example - and
 * `formatVatRate` is the one place that knows.
 *
 * Still no arithmetic: the rate is FORMATTED, never multiplied, and a rate we
 * cannot read renders as no rate rather than a guess.
 */

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";
const ROW = "flex items-baseline justify-between gap-4 py-2.5";

/** What the school is buying, in the plan's own cadence. */
const CADENCE: Record<Pricing["pricingPlan"], string> = {
  annual: "per year",
  per_term: "per term",
};

/**
 * SCRUM-98's access window, which the schema itself calls "a fact the cost
 * sheet has to state" - a per-term school is not buying the holidays.
 */
const WINDOW: Record<Pricing["accessWindow"], string> = {
  year_round:
    "Covers the whole calendar year, including the breaks between terms.",
  school_session:
    "Covers your school’s own session – not the breaks between terms.",
};

function longDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function CostSheet({
  pricing,
  payStatus = null,
}: {
  pricing: Pricing;
  /**
   * D11's badge on the card: "Payment due" while the upcoming invoice is
   * unpaid, "Active" once it is paid. Billing passes it from that invoice;
   * null - no upcoming invoice, or it could not be read - shows no badge,
   * because "Active" is a claim about the school's account.
   */
  payStatus?: "due" | "active" | null;
}) {
  const {
    currency,
    studentCount,
    perStudentRate,
    totalBeforeVat,
    vatAmount,
    vatRate,
    totalWithVat,
    pricingPlan,
    accessWindow,
    rateType,
    rateLockedUntil,
  } = pricing;

  const total = formatMoney(totalWithVat, currency);
  const lockedUntil = rateLockedUntil ? longDate(rateLockedUntil) : null;

  return (
    <>
      <h2 className="mt-8 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
        {pricingPlan === "per_term" ? "Your cost per term" : "Your annual cost"}
      </h2>
      <div className={cn(CARD, "mt-3 px-6 py-[22px]")}>
        {/* D11's FOUNDING PARTNER pill. The rate type belongs to the
            subscription as it stands - which is exactly this card. (The
            invoice page leaves it out: an old invoice may predate it.) */}
        {rateType === "founding_partner" || payStatus ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {rateType === "founding_partner" ? (
              <span className="rounded-full bg-nevo-violet/24 px-3 py-1 text-[11.5px] font-semibold tracking-[0.06em] text-nevo-navy uppercase">
                Founding Partner
              </span>
            ) : null}
            {payStatus ? (
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-[12.5px] font-semibold",
                  payStatus === "due"
                    ? "bg-nevo-violet/24 text-nevo-navy"
                    : "bg-nevo-navy/12 text-nevo-navy",
                )}
              >
                {payStatus === "due" ? "Payment due" : "Active"}
              </span>
            ) : null}
          </div>
        ) : null}
        {isAmount(totalWithVat) ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <span className="text-[34px] leading-none font-semibold text-nevo-near-black tabular-nums">
                {total}
              </span>
              <span className="text-[13.5px] text-nevo-near-black/58">
                {CADENCE[pricingPlan]}
              </span>
            </div>

            <div className="mt-4 divide-y divide-nevo-near-black/7 border-t border-nevo-near-black/7">
              <div className={ROW}>
                <span className="text-[14px] text-nevo-near-black/72">
                  {studentCount} active{" "}
                  {studentCount === 1 ? "student" : "students"} &times;{" "}
                  {formatMoney(perStudentRate, currency)} per student
                </span>
                <span className="text-[14px] font-semibold text-nevo-near-black tabular-nums">
                  {formatMoney(totalBeforeVat, currency)}
                </span>
              </div>
              <div className={ROW}>
                <span className="text-[14px] text-nevo-near-black/72">
                  {formatVatRate(vatRate) ? `VAT at ${formatVatRate(vatRate)}` : "VAT"}
                </span>
                <span className="text-[14px] font-semibold text-nevo-near-black tabular-nums">
                  {formatMoney(vatAmount, currency)}
                </span>
              </div>
            </div>

            <p className="m-0 mt-4 text-[13px] leading-[1.6] text-nevo-near-black/62">
              {WINDOW[accessWindow]} If your roster grows, the count and the
              total move with it.
            </p>
            {rateType === "founding_partner" && (
              <p className="m-0 mt-1.5 text-[13px] leading-[1.6] text-nevo-near-black/62">
                You&rsquo;re on the founding-partner rate.
                {lockedUntil ? ` It’s held until ${lockedUntil}.` : ""}
              </p>
            )}
            {rateType !== "founding_partner" && lockedUntil && (
              <p className="m-0 mt-1.5 text-[13px] leading-[1.6] text-nevo-near-black/62">
                This rate is held until {lockedUntil}.
              </p>
            )}
          </>
        ) : (
          /*
           * A total we cannot read is NOT a rate that was never set. The old
           * copy here said "your per-student rate isn't set yet", which is a
           * claim about the school's contract - and it was being shown to every
           * school on earth because of a field name.
           */
          <>
            <p className="m-0 text-[15px] font-semibold text-nevo-near-black">
              {studentCount} active {studentCount === 1 ? "student" : "students"}
            </p>
            <p className="m-0 mt-1.5 text-[13.5px] leading-[1.55] text-nevo-near-black/62">
              We couldn&rsquo;t read your total just now. Your invoices carry
              the amount, and nothing about your billing has changed.
            </p>
          </>
        )}
      </div>
    </>
  );
}
