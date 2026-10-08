"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  billingApi,
  type Invoice,
  type Subscription,
  type UpcomingCharge,
} from "@/lib/api/billing";
import { formatMoney, formatVatRate, isAmount } from "@/lib/money";
import { longDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { NoAccess, failureKind } from "../NoAccess";
import { financeHomeRows, overdueCount } from "./financeHomeRows";

/**
 * D18 Finance Home - where a finance administrator lands.
 *
 * Sign-in used to route every persona to the Overview, which is gated on
 * `oversight`. A billing-only admin's first sight of Nevo was a refusal. See
 * `adminHomeForScopes`.
 *
 * THE SUBSCRIPTION READ OWNS THE PAGE; the other two own only their own
 * sections. That split is the point: a screen about money must not go blank
 * because a supplementary list timed out, and it must not imply everything is
 * settled because it could not check.
 *
 * THE HEADLINE IS THE TOTAL WITH VAT, AND SAYS SO. It is `totalWithVat`, the
 * same figure Billing's cost sheet leads with, so a bursar sees one number on
 * both screens. Unlabelled, it sat beside "Billed on 387 students at ₦150,000
 * each" and the sum did not come out - the per-student rate is before VAT. So
 * the figure carries "incl. VAT at 7.5%" and the rate line says "before VAT".
 * The rate is the server's, through `formatVatRate` (settled 15 Sep as a
 * percentage); one it cannot read shows as plain "incl. VAT", never a guess.
 *
 * NO RED. Overdue billing never gates access, so the loudest state here is
 * violet and the copy says access continues.
 *
 * AND NO CARD. SCRUM-98 and D11 forbid showing a saved payment instrument in
 * every state - "no cards, no in-app checkout". The first version of this
 * screen printed a brand and last four anyway, against a rule written on the
 * type it read them from.
 */

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";

type Phase = "loading" | "ready" | "failed" | "denied";

function todayLine(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const CADENCE: Record<string, string> = {
  annual: "per year",
  per_term: "per term",
};

/** The headline's label: the rate as served, or none rather than a guess. */
function vatIncluded(vatRate: string | null | undefined): string {
  const rate = formatVatRate(vatRate);
  return rate ? `incl. VAT at ${rate}` : "incl. VAT";
}

export function FinanceHomeView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingCharge | null>(null);
  /** Null is "we did not find out", which is NOT "nothing is overdue". */
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);

  const load = useCallback(() => {
    billingApi
      .subscription()
      .then((s) => {
        setSubscription(s);
        setPhase("ready");
      })
      .catch((err: unknown) => setPhase(failureKind(err)));

    billingApi
      .upcoming()
      .then(setUpcoming)
      .catch(() => setUpcoming(null));

    billingApi
      .invoices()
      .then(setInvoices)
      .catch(() => setInvoices(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = financeHomeRows(subscription, upcoming, invoices);
  const overdue = overdueCount(invoices);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[860px]">
        <p className="m-0 text-[13px] text-nevo-near-black/55">{todayLine()}</p>
        <h2 className="mt-1.5 text-[23px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[28px]">
          Billing overview
        </h2>

        {phase === "loading" && (
          <div className={cn(CARD, "mt-6 h-[220px] animate-pulse")} />
        )}
        {phase === "denied" && <NoAccess what="billing" />}
        {phase === "failed" && (
          <div className={cn(CARD, "mt-6 px-[26px] py-7")}>
            <h3 className="text-[17px] font-semibold text-nevo-near-black">
              We couldn&rsquo;t load your billing
            </h3>
            <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
              Nothing has changed for your school, and nothing is owed that
              wasn&rsquo;t before. Try again in a moment.
            </p>
            <button
              type="button"
              onClick={() => {
                setPhase("loading");
                load();
              }}
              className="mt-5 h-[46px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-110 active:brightness-93"
            >
              Try again
            </button>
          </div>
        )}

        {phase === "ready" && subscription && (
          <>
            <div className={cn(CARD, "mt-[26px] px-[34px] py-[30px]")}>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[34px] leading-none font-semibold tracking-[-0.02em] text-nevo-near-black">
                  {formatMoney(
                    subscription.pricing.totalWithVat,
                    subscription.pricing.currency,
                  )}
                </span>
                <span className="text-[15px] text-nevo-near-black/58">
                  {CADENCE[subscription.pricing.pricingPlan] ?? ""}
                </span>
              </div>
              {isAmount(subscription.pricing.totalWithVat) ? (
                <p className="m-0 mt-1 text-[12.5px] text-nevo-near-black/50">
                  {vatIncluded(subscription.pricing.vatRate)}
                </p>
              ) : null}

              {/* THE STATUS LINE IS OMITTED when the invoice list did not
                  answer. "Settled and up to date" off an unread list is the
                  console's oldest mistake wearing a new hat. */}
              {invoices === null ? (
                <p className="mt-3 max-w-[62ch] text-[14.5px] leading-[1.55] text-nevo-near-black/62">
                  We couldn&rsquo;t read your invoice history just now, so this
                  doesn&rsquo;t say whether anything is outstanding.
                </p>
              ) : (
                <div className="mt-3 flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-[10px] shrink-0 rounded-full",
                      overdue && overdue > 0
                        ? "bg-nevo-violet"
                        : "bg-nevo-near-black/28",
                    )}
                  />
                  <span className="text-[15px] text-nevo-near-black/72">
                    {overdue && overdue > 0
                      ? overdue === 1
                        ? "One invoice hasn't been settled yet"
                        : `${overdue} invoices haven't been settled yet`
                      : "Your subscription is settled and up to date"}
                  </span>
                </div>
              )}

              <p className="mt-3 max-w-[62ch] text-[14.5px] leading-[1.55] text-nevo-near-black/62">
                {`Billed on ${subscription.pricing.studentCount} student${subscription.pricing.studentCount === 1 ? "" : "s"} at ${formatMoney(subscription.pricing.perStudentRate, subscription.pricing.currency)} each, before VAT.`}
                {longDate(subscription.contractEnd)
                  ? ` Your contract runs to ${longDate(subscription.contractEnd)}.`
                  : ""}
              </p>
            </div>

            <h3 className="mt-9 text-[13px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase">
              At a glance
            </h3>
            <div className="mt-3 flex flex-wrap gap-3.5">
              {/* Each tile is absent when its field is null - see the note on
                  `UpcomingCharge`, where five of seven fields are nullable. */}
              {upcoming?.amount && longDate(upcoming.dueAt) ? (
                <Tile
                  label="Next invoice"
                  value={formatMoney(
                    upcoming.amount,
                    subscription.pricing.currency,
                  )}
                  sub={`due ${longDate(upcoming.dueAt)}`}
                />
              ) : null}
              <Tile
                label="Coverage"
                value={String(subscription.pricing.studentCount)}
                sub={
                  subscription.pricing.studentCount === 1
                    ? "student billed"
                    : "students billed"
                }
              />
              {/* NO CARD ON SCREEN. This tile printed a brand and last four,
                  which SCRUM-98 and D11 forbid in every state - "no cards, no
                  in-app checkout" - and `PaymentMethod` is annotated "Read,
                  never rendered" on the type itself. Schools pay by transfer;
                  the tile names the ARRANGEMENT instead of the instrument. */}
              <Tile
                label="Payment"
                value="Bank transfer"
                sub="Details are in Billing"
              />
            </div>

            {rows.length > 0 && (
              <>
                <h3 className="mt-9 text-[13px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase">
                  Worth a glance
                </h3>
                <div className={cn(CARD, "mt-3 overflow-hidden")}>
                  {rows.map((r, i) => (
                    <Link
                      key={r.key}
                      href={r.href}
                      className={cn(
                        "flex items-center gap-[15px] px-[22px] py-[18px] transition-[filter] hover:brightness-[0.985]",
                        i < rows.length - 1 && "border-b border-nevo-near-black/7",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "shrink-0 rounded-full",
                          r.kind === "soft"
                            ? "size-[10px] bg-nevo-violet"
                            : "size-[9px] bg-nevo-near-black/28",
                        )}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[15px] font-semibold text-nevo-near-black">
                          {r.title}
                        </span>
                        <span className="mt-0.5 text-[13px] text-nevo-near-black/58">
                          {r.sub}
                        </span>
                      </span>
                      <span className="shrink-0 text-[13.5px] font-semibold text-nevo-navy">
                        {r.action} &rarr;
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={cn(CARD, "min-w-[196px] flex-1 px-6 py-[22px]")}>
      <span className="text-[11px] font-bold tracking-[0.14em] text-nevo-violet uppercase">
        {label}
      </span>
      <div className="mt-2 text-[21px] font-semibold text-nevo-near-black">
        {value}
      </div>
      <div className="mt-1 text-[13px] text-nevo-near-black/58">{sub}</div>
    </div>
  );
}
