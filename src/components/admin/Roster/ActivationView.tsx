"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CostSheet } from "../Billing/CostSheet";
import { HowToPayPanel } from "../Billing/HowToPayPanel";
import { ReadFailed } from "../ReadFailed";
import { CARD } from "./primitives";
import {
  billingApi,
  type Invoice,
  type ReceivingAccount,
  type Subscription,
} from "@/lib/api/billing";
import { onboardingApi, type OnboardingState } from "@/lib/api/onboarding";
import { schoolApi, type School } from "@/lib/api/school";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { billingCurrency, mayActivate, screenFor } from "./activation";

/**
 * D24 OB-03 headcount and cost, OB-04 payment, OB-05 activation.
 *
 * ONE SCREEN, SWITCHED BY `stage`. The three frames are three moments of the
 * same waiting room rather than three destinations, and the server owns which
 * one a school is in - see `screenFor`.
 *
 * REUSES THE BILLING PANELS RATHER THAN RESTATING THEM. `CostSheet` and
 * `HowToPayPanel` already exist, are already tested, and already get the
 * decimal-string handling right. A second cost breakdown on this screen would
 * be two places describing one invoice, and they would disagree the first time
 * either changed - which is exactly the defect this codebase keeps finding.
 *
 * NOTHING IS COMPUTED. `PricingResponse` carries `perStudentRate`,
 * `totalBeforeVat`, `vatRate`, `vatAmount` and `totalWithVat`, and its own
 * description says why: *"vatAmount is totalBeforeVat multiplied by this and
 * divided by 100, already rounded, so a client never has to compute it."*
 *
 * THE WAITING STATE IS NOT A SPINNER. *"A school paying by transfer may leave
 * overnight and come back."* So it survives being left: the state is re-read
 * on mount, there is no countdown, nothing polls, and the copy says plainly
 * that they can close the tab.
 *
 * CALM, NEVER RED - the frame's words. A school whose transfer has not landed
 * yet is in the ordinary case, so the "we haven't matched it" reassurance sits
 * alongside the waiting copy rather than replacing it on a timer. Nothing here
 * counts hours and decides the school has a problem.
 */

type Phase = "loading" | "ready" | "failed";

export function ActivationView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<OnboardingState | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [account, setAccount] = useState<ReceivingAccount | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [activating, setActivating] = useState(false);
  const [activateFailed, setActivateFailed] = useState(false);
  const [rechecking, setRechecking] = useState(false);

  const load = useCallback(() => {
    /*
     * The onboarding read decides the screen; everything else decorates it. So
     * only that one can fail the page - a missing bank account costs the
     * transfer panel, not the whole thing, and `HowToPayPanel` already draws
     * its own absence.
     */
    onboardingApi
      .get()
      .then((s) => {
        setState(s);
        setPhase("ready");
      })
      .catch(() => setPhase("failed"));

    billingApi.subscription().then(setSub).catch(() => setSub(null));
    billingApi.receivingAccount().then(setAccount).catch(() => setAccount(null));
    schoolApi.get().then(setSchool).catch(() => setSchool(null));
    billingApi
      .invoices()
      .then((rows) => setInvoice(rows[0] ?? null))
      .catch(() => setInvoice(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recheck = () => {
    setRechecking(true);
    onboardingApi
      .get()
      .then(setState)
      .catch(() => {})
      .finally(() => setRechecking(false));
  };

  const activate = () => {
    setActivating(true);
    setActivateFailed(false);
    onboardingApi
      .activate()
      .then(setState)
      .catch(() => setActivateFailed(true))
      .finally(() => setActivating(false));
  };

  if (phase === "loading") {
    return <div className={cn(CARD, "mt-5 h-[380px] animate-pulse")} />;
  }
  if (phase === "failed" || !state) {
    return (
      <ReadFailed
        what="where your school has got to"
        onRetry={() => {
          setPhase("loading");
          load();
        }}
      />
    );
  }

  const screen = screenFor(state.stage);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[860px]">
        <p className="m-0 text-[13px] text-nevo-near-black/55">
          Getting to active
        </p>

        {screen === "roster" ? (
          <NothingConfirmedYet />
        ) : screen === "cost" ? (
          <Cost state={state} sub={sub} />
        ) : screen === "waiting" ? (
          <Waiting
            state={state}
            account={account}
            invoice={invoice}
            rechecking={rechecking}
            onRecheck={recheck}
            canActivate={mayActivate(state)}
            activating={activating}
            activateFailed={activateFailed}
            onActivate={activate}
          />
        ) : (
          <Active school={school} />
        )}
      </div>
    </div>
  );
}

/** A school that has not confirmed a roster has nothing to pay for yet. */
function NothingConfirmedYet() {
  return (
    <>
      <h2 className="mt-1.5 text-[23px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[28px]">
        Your roster comes first
      </h2>
      <p className="mt-2 max-w-[62ch] text-[15px] leading-[1.55] text-nevo-near-black/68">
        Your headcount decides what your school pays, so there is nothing to
        settle until your roster is confirmed.
      </p>
      <Link
        href="/admin/roster"
        className="mt-6 inline-flex h-[48px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110"
      >
        Add your roster
      </Link>
    </>
  );
}

/** OB-03. */
function Cost({
  state,
  sub,
}: {
  state: OnboardingState;
  sub: Subscription | null;
}) {
  return (
    <>
      <h2 className="mt-1.5 text-[23px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[28px]">
        Your headcount and cost
      </h2>
      <p className="mt-2 max-w-[64ch] text-[15px] leading-[1.55] text-nevo-near-black/68">
        What your school pays for the year, based on the roster you confirmed.
        This panel stays on your dashboard.
      </p>

      <div className={cn(CARD, "mt-6 px-[26px] py-[22px]")}>
        <h3 className="m-0 text-[13px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase">
          Roster
        </h3>
        <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-3">
          <Fact label="Students" value={String(state.studentCount)} />
          <Fact label="Classes" value={String(state.classes.length)} />
          {/* The frame's own "18 · free", and it is the reassurance not the aside. */}
          <Fact label="Teachers" value={`${state.teacherCount} · free`} />
        </dl>
      </div>

      {/*
        * THE COST SHEET IS THE BILLING ONE. Same invoice, same component, so
        * the two screens cannot describe one total differently.
        *
        * Absent rather than approximated when the subscription read failed:
        * `state.amountDue` carries a total but none of the breakdown the frame
        * draws, and a bare figure under the heading "Your headcount and cost"
        * would be the one number a school checks against its own arithmetic.
        */}
      {sub?.pricing ? (
        <div className="mt-4">
          <CostSheet pricing={sub.pricing} />
        </div>
      ) : (
        <p className="mt-4 max-w-[56ch] text-[13.5px] leading-[1.55] text-nevo-near-black/62">
          We couldn&rsquo;t load your cost breakdown just now. Nothing has
          changed and nothing has been charged &ndash; try again in a moment.
        </p>
      )}

      <Link
        href="/admin/billing"
        className="mt-7 inline-flex h-[48px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110"
      >
        Pay by bank transfer
      </Link>
    </>
  );
}

/** OB-04, both states. */
function Waiting({
  state,
  account,
  invoice,
  rechecking,
  onRecheck,
  canActivate,
  activating,
  activateFailed,
  onActivate,
}: {
  state: OnboardingState;
  account: ReceivingAccount | null;
  invoice: Invoice | null;
  rechecking: boolean;
  onRecheck: () => void;
  canActivate: boolean;
  activating: boolean;
  activateFailed: boolean;
  onActivate: () => void;
}) {
  /*
   * Both halves guarded. An amount with no currency we recognise is rendered
   * as nothing rather than with a guessed symbol - see `billingCurrency`.
   */
  const currency = billingCurrency(state.currency);
  const amount =
    state.amountDue && currency ? formatMoney(state.amountDue, currency) : null;

  return (
    <>
      <h2 className="mt-1.5 text-[23px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[28px]">
        Pay for the year
      </h2>
      <p className="mt-2 max-w-[64ch] text-[15px] leading-[1.55] text-nevo-near-black/68">
        Transfer the total to Nevo&rsquo;s account using your reference. You
        don&rsquo;t have to wait here &ndash; we&rsquo;ll email you when it
        lands.
      </p>

      <div className={cn(CARD, "mt-6 px-[26px] py-[22px]")}>
        <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
          Waiting for your transfer to arrive
        </h3>
        <p className="mt-2 max-w-[62ch] text-[14.5px] leading-[1.55] text-nevo-near-black/68">
          You can close this and come back tomorrow &ndash; it stays right here.
          Bank transfers usually confirm within a few hours, sometimes
          overnight, and we&rsquo;ll email you the moment yours clears.
        </p>
      </div>

      {/*
        * "We haven't matched your payment yet" - OB-04's second state, offered
        * rather than triggered. Nothing here counts hours and decides a school
        * has a problem; it is simply the answer to "I transferred it, where is
        * it?", available whenever they think to ask.
        */}
      <div className={cn(CARD, "mt-4 px-[26px] py-[22px]")}>
        <h3 className="m-0 text-[15.5px] font-semibold text-nevo-near-black">
          Transferred it already?
        </h3>
        <p className="mt-2 max-w-[62ch] text-[14.5px] leading-[1.55] text-nevo-near-black/68">
          If you&rsquo;ve just made the transfer, it can take a few hours to
          show &ndash; your place is saved and nothing is lost. If it&rsquo;s
          been longer than a day, send us your reference and we&rsquo;ll track
          it down.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onRecheck}
            disabled={rechecking}
            className="h-[44px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-60"
          >
            {rechecking ? "Checking…" : "Check again"}
          </button>
          <a
            href="mailto:support@nevolearning.com"
            className="h-[44px] cursor-pointer rounded-[10px] px-4 text-sm font-semibold leading-[44px] text-nevo-near-black/70 transition-colors hover:bg-nevo-near-black/[0.05]"
          >
            Contact us
          </a>
        </div>
      </div>

      <div className="mt-4">
        <HowToPayPanel
          account={account}
          reference={invoice?.invoiceNumber ?? null}
          amount={amount}
          invoiceId={invoice?.id ?? null}
          billedIn={currency}
        />
      </div>

      {/*
        * ACTIVATION IS THE SERVER'S TO OFFER. `canActivate` gates it, so a
        * school still waiting on a transfer never sees a button that would
        * refuse them - see `mayActivate`.
        */}
      {canActivate ? (
        <div className="mt-6">
          <button
            type="button"
            onClick={onActivate}
            disabled={activating}
            className="h-[48px] cursor-pointer rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-60"
          >
            {activating ? "Switching on…" : "Switch your school on"}
          </button>
          {activateFailed ? (
            <p className="mt-3 max-w-[56ch] text-[13.5px] leading-[1.5] text-nevo-navy">
              We couldn&rsquo;t switch it on just now. Your payment is still
              recorded &ndash; try again in a moment.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** OB-05. */
function Active({ school }: { school: School | null }) {
  return (
    <>
      <h2 className="mt-1.5 text-[23px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[28px]">
        {school?.name ? `${school.name} is active` : "Your school is active"}
      </h2>
      <p className="mt-2 max-w-[64ch] text-[15px] leading-[1.55] text-nevo-near-black/68">
        Your payment is confirmed and your school is switched on.
      </p>

      {/*
        * THE SCHOOL CODE, when there is one. `School.code` is null for SSO
        * schools - which is every school's eventual case and no school's
        * current one, since design deferred provider sign-in - so the card is
        * absent rather than blank.
        */}
      {school?.code ? (
        <div className={cn(CARD, "mt-6 px-[26px] py-[22px]")}>
          <h3 className="m-0 text-[13px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase">
            Your school code
          </h3>
          <p className="m-0 mt-2 text-[28px] font-semibold tracking-[0.04em] text-nevo-near-black">
            {school.code}
          </p>
          <p className="m-0 mt-2 max-w-[56ch] text-[13.5px] leading-[1.55] text-nevo-near-black/62">
            Now on your dashboard overview &ndash; share it so staff and
            students can join.
          </p>
        </div>
      ) : null}

      {/*
        * OB-05 ALSO OFFERS THE PAPER CONSENT FORM - *"Some parents won't reply
        * to the emailed request... download the paper consent form."* It is
        * ABSENT, and not for want of an endpoint: `GET /api/v1/consents/form`
        * is deployed.
        *
        * Design, 24 Sep: the form is stamped v0.0 DRAFT, three of its sections
        * are placeholders marked "to be supplied by Nevo's counsel", and
        * **nothing paper ships** until they return. A download button here
        * would put an unfinished legal document in a school's hands on the day
        * they switch on, which is the worst possible day for it.
        */}

      <Link
        href="/admin"
        className="mt-7 inline-flex h-[48px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110"
      >
        Go to your dashboard
      </Link>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12.5px] text-nevo-near-black/55">{label}</dt>
      <dd className="m-0 mt-0.5 text-[19px] font-semibold text-nevo-near-black">
        {value}
      </dd>
    </div>
  );
}
