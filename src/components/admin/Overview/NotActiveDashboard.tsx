"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { billingApi, type Pricing } from "@/lib/api/billing";
import type { OnboardingState } from "@/lib/api/onboarding";
import { schoolApi } from "@/lib/api/school";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { billingCurrency } from "../Roster/activation";
import { leadFor, momentFor, setupSteps, type SetupStep } from "./notActive";

/**
 * D24 OB-00 "the unfinished dashboard" - the Overview of a school that is not
 * active yet.
 *
 * BEFORE THIS EXISTED, a school in onboarding landed on D04's "Welcome to
 * Nevo" with a getting-started checklist greyed out, and nothing on it led to
 * the roster upload or to paying. The pay-and-activate screen had no inbound
 * link at all, so a school that confirmed its roster could only reach it by
 * typing the address. This is the page that says where the school is and
 * which one thing to do next.
 *
 * Everything positional - the stage, the counts, the amount, the period - is
 * the onboarding read the setup gate already holds, handed in rather than
 * fetched again. The school name and the per-student rate decorate it and
 * cost only themselves when they fail.
 *
 * NOT YET SAID: the frame's "You can't make any changes until Brightgate is
 * active." Outside this page the console does not pause its writes for a
 * school that is not active, and the backend refuses none of them, so the
 * sentence would be false today. It comes back with the paused controls.
 */

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";

export function NotActiveDashboard({ state }: { state: OnboardingState }) {
  const [name, setName] = useState<string | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);

  useEffect(() => {
    let live = true;
    schoolApi
      .get()
      .then((s) => live && setName(s.name?.trim() || null))
      .catch(() => {});
    billingApi
      .subscription()
      .then((s) => live && setPricing(s.pricing ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const moment = momentFor(state);
  const currency = billingCurrency(state.currency);
  const amount =
    state.amountDue && currency ? formatMoney(state.amountDue, currency) : null;
  const payLine = amount
    ? state.periodLabel
      ? `${amount} for ${state.periodLabel}`
      : amount
    : null;
  const school = name ?? "Your school";

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[1000px]">
        <p className="m-0 text-[13.5px] text-nevo-near-black/55">Setup</p>
        <h2 className="mt-2 text-[23px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[28px]">
          {school} isn&rsquo;t active yet
        </h2>
        <p className="mt-2.5 max-w-[640px] text-[15.5px] leading-[1.55] text-nevo-near-black/62">
          {leadFor(state)}
        </p>

        <h3 className="mt-8 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
          What&rsquo;s left
        </h3>
        <ol className={cn(CARD, "mt-3 list-none overflow-hidden p-0")}>
          {setupSteps(state, payLine).map((s, i, all) => (
            <StepRow key={s.n} step={s} last={i === all.length - 1} />
          ))}
        </ol>

        {moment === "part_uploaded" && (
          <SoFar state={state} pricing={pricing} />
        )}

        {moment === "to_pay" && (
          <WhatYoullPay state={state} pricing={pricing} amount={amount} />
        )}

        <p className="mt-6 max-w-[640px] text-[13.5px] leading-[1.55] text-nevo-near-black/55">
          You can look around the rest of your console &ndash; Classes,
          Teachers, Reports, Billing.
        </p>
      </div>
    </div>
  );
}

function StepRow({ step, last }: { step: SetupStep; last: boolean }) {
  const row = (
    <>
      <span
        aria-hidden
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
          step.state === "done" && "bg-nevo-navy text-nevo-cream",
          step.state === "current" && "border-2 border-nevo-navy text-nevo-navy",
          step.state === "todo" && "border-2 border-nevo-near-black/18 text-nevo-near-black/40",
        )}
      >
        {step.state === "done" ? <Tick /> : step.n}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "text-[15px] font-semibold",
            step.state === "todo" ? "text-nevo-near-black/50" : "text-nevo-near-black",
          )}
        >
          {step.label}
          {step.state === "done" && <span className="sr-only"> (done)</span>}
        </span>
        <span className="mt-0.5 text-[12.5px] text-nevo-near-black/55">{step.sub}</span>
      </span>
      {step.action && (
        <span className="shrink-0 text-[13.5px] font-semibold text-nevo-navy">
          {step.action} &rarr;
        </span>
      )}
    </>
  );
  const shell = cn(
    "flex items-center gap-3.5 px-[18px] py-4",
    !last && "border-b border-nevo-near-black/7",
    step.state === "current" && "bg-nevo-violet/10",
  );
  return (
    <li aria-current={step.state === "current" ? "step" : undefined}>
      {step.href ? (
        <Link href={step.href} className={cn(shell, "transition-[filter] hover:brightness-[0.985]")}>
          {row}
        </Link>
      ) : (
        <div className={shell}>{row}</div>
      )}
    </li>
  );
}

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function perPeriod(pricing: Pricing): string {
  return pricing.pricingPlan === "per_term" ? "per term" : "per year";
}

/** Moment B: part of the roster is in. */
function SoFar({ state, pricing }: { state: OnboardingState; pricing: Pricing | null }) {
  return (
    <>
      <h3 className="mt-8 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
        Your school so far
      </h3>
      <div className={cn(CARD, "mt-3 px-[22px] py-[18px]")}>
        <dl className="m-0 grid gap-x-10 gap-y-3 sm:grid-cols-3">
          <Fact
            label="Teachers"
            value={state.teacherCount > 0 ? String(state.teacherCount) : "Not added yet"}
          />
          <Fact
            label="Students"
            value={state.studentCount > 0 ? String(state.studentCount) : "Not added yet"}
          />
          {/*
            * NEVER A PROVISIONAL TOTAL. The cost is the server's, raised when
            * the roster is confirmed; multiplying staged rows by a rate here
            * would put a number on screen nobody sent.
            */}
          <Fact
            label="Annual cost"
            value={
              state.studentCount > 0
                ? "Set when you confirm your roster"
                : "Pending your students"
            }
          />
        </dl>
        <p className="mt-4 text-[13px] leading-[1.5] text-nevo-near-black/58">
          Teacher accounts are free.
          {pricing &&
            ` Your cost is a flat ${formatMoney(pricing.perStudentRate, pricing.currency)} per student, ${perPeriod(pricing)}.`}
        </p>
      </div>
    </>
  );
}

/** Moment C: one question, one answer. */
function WhatYoullPay({
  state,
  pricing,
  amount,
}: {
  state: OnboardingState;
  pricing: Pricing | null;
  amount: string | null;
}) {
  const students = `${state.studentCount} ${state.studentCount === 1 ? "student" : "students"}`;
  return (
    <>
      <h3 className="mt-8 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
        What you&rsquo;ll pay
      </h3>
      <div className={cn(CARD, "mt-3 px-[22px] py-[20px]")}>
        <p className="m-0 text-[13.5px] text-nevo-near-black/62">
          {pricing
            ? `${students} × ${formatMoney(pricing.perStudentRate, pricing.currency)}`
            : students}
        </p>
        {amount && (
          <p className="mt-1.5 text-[28px] font-semibold tracking-[-0.02em] text-nevo-near-black">
            {amount}
          </p>
        )}
        {state.periodLabel && (
          <p className="mt-0.5 text-[13.5px] text-nevo-near-black/55">
            for {state.periodLabel}
          </p>
        )}
        <Link
          href="/admin/activate"
          className="mt-5 inline-flex h-[46px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110"
        >
          Pay by bank transfer
        </Link>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12.5px] text-nevo-near-black/55">{label}</dt>
      <dd className="m-0 mt-0.5 text-[16px] font-semibold text-nevo-near-black">{value}</dd>
    </div>
  );
}
