"use client";

import { useEffect, useState } from "react";
import { billingApi, type PlanOption, type PricingPlan } from "@/lib/api/billing";
import { feedbackApi } from "@/lib/api/feedback";
import { formatMoney, formatVatRate } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CheckIcon } from "../Roster/primitives";
import { WINDOW } from "./CostSheet";

/**
 * D11d's plan choice - "D11d wins. The plan choice exists. There are two: the
 * annual partnership and the per-term plan." (Lydia, 7 Oct.)
 *
 * WHAT IS SHOWN IS WHAT THE SERVER SENDS (`GET /api/billing/plan-options`):
 * each plan's name, its published per-student rate and period, and what its
 * access window covers. VAT is the school's own rate, through `formatVatRate`.
 * D11d's "Saves ₦15,000 per student compared to paying per term" would be our
 * subtraction, and its "Recommended" / "Flexible" badges a claim nothing
 * sends, so neither is drawn.
 *
 * PUBLISHED RATES, SAID SO. A founding-partner school pays its own rate, which
 * the cost sheet above shows; the line under the heading keeps the two apart.
 *
 * SWITCHING IS A REQUEST, NOT A SWITCH. Backend confirms a change "through the
 * relationship manager" and has no self-service route, on purpose - SCRUM-98:
 * "Nothing commercial is self-service". D11d's "Switch to this plan" would
 * promise an action this screen cannot take, so the control says what pressing
 * it does: it asks. Same route as "Request another account". D11d's "Plan
 * changes take effect at the start of your next billing cycle" is not stated:
 * nothing sends it.
 *
 * ITS OWN READ AND ITS OWN ABSENCE. A plan list that could not be read costs
 * this section, never the billing page above it.
 */

type Asked = "idle" | "sending" | "sent" | "failed";

export function PlanOptions({
  current,
  vatRate,
}: {
  current: PricingPlan;
  vatRate: string | null | undefined;
}) {
  const [plans, setPlans] = useState<PlanOption[] | null>(null);
  const [asked, setAsked] = useState<Asked>("idle");

  useEffect(() => {
    billingApi
      .planOptions()
      .then((rows) => setPlans(Array.isArray(rows) ? rows : []))
      .catch(() => setPlans([]));
  }, []);

  if (!plans || plans.length === 0) return null;

  const vat = formatVatRate(vatRate);

  const ask = (plan: PlanOption) => {
    if (asked === "sending" || asked === "sent") return;
    setAsked("sending");
    feedbackApi
      .submit({
        type: "plan_change",
        note: `Requesting a switch to the ${plan.name} plan.`,
        context: "/admin/billing",
      })
      .then(() => setAsked("sent"))
      .catch(() => setAsked("failed"));
  };

  return (
    <section aria-labelledby="plans-heading" className="mt-10">
      <h2
        id="plans-heading"
        className="text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase"
      >
        Your plan
      </h2>
      <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-[1.55] text-nevo-near-black/62">
        Nevo&rsquo;s published rates. What your school pays is in your cost above.
      </p>
      <div className="mt-3 grid gap-3.5 md:grid-cols-2">
        {plans.map((plan) => {
          const isCurrent = plan.plan === current;
          return (
            <div
              key={plan.plan}
              className={cn(
                "flex flex-col rounded-xl bg-nevo-cream-elevated px-6 py-[22px] shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
                isCurrent && "ring-2 ring-nevo-navy/70",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="m-0 text-[16px] font-semibold text-nevo-near-black">{plan.name}</h3>
                {isCurrent ? (
                  <span className="rounded-full bg-nevo-navy/12 px-3 py-1 text-[12px] font-semibold text-nevo-navy">
                    Your current plan
                  </span>
                ) : null}
              </div>
              <p className="m-0 mt-3 text-[26px] leading-none font-semibold text-nevo-near-black tabular-nums">
                {formatMoney(plan.perStudentRate, plan.currency)}
              </p>
              <p className="m-0 mt-1.5 text-[13px] text-nevo-near-black/58">
                {`per student / ${plan.billingPeriod}`}
                {vat ? ` · plus VAT at ${vat}` : " · plus VAT"}
              </p>
              <p className="m-0 mt-3 text-[13.5px] leading-[1.55] text-nevo-near-black/66">
                {WINDOW[plan.accessWindow]}
              </p>
              {!isCurrent ? (
                <div className="mt-auto pt-4">
                  <p className="m-0 text-[13px] leading-[1.5] text-nevo-near-black/58">
                    Switching is arranged with your relationship manager.
                  </p>
                  {asked === "sent" ? (
                    <p
                      role="status"
                      className="m-0 mt-3 flex items-center gap-2 text-[13.5px] font-semibold text-nevo-navy"
                    >
                      <span className="flex size-[20px] flex-none items-center justify-center rounded-full bg-nevo-navy text-nevo-cream">
                        <CheckIcon size={11} />
                      </span>
                      Asked. Your relationship manager will be in touch.
                    </p>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => ask(plan)}
                        disabled={asked === "sending"}
                        className="mt-3 h-[42px] cursor-pointer rounded-[10px] border-[1.5px] border-nevo-navy/30 px-4 text-[13.5px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/[0.05] disabled:cursor-wait disabled:opacity-55"
                      >
                        {asked === "sending" ? "Asking…" : `Ask to switch to ${plan.name}`}
                      </button>
                      {asked === "failed" ? (
                        <p className="m-0 mt-2 text-[13px] text-nevo-near-black/62">
                          That didn&rsquo;t send. Nothing has changed - try again in a moment.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
