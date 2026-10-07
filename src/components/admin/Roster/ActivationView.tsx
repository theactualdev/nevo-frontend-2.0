"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CostSheet } from "../Billing/CostSheet";
import { HowToPayPanel } from "../Billing/HowToPayPanel";
import { InvoiceBreakdown } from "../Billing/InvoiceBreakdown";
import { ReadFailed } from "../ReadFailed";
import { NoAccess, failureKind } from "../NoAccess";
import { SupportEmailLink } from "../SupportEmail";
import { CARD, CheckIcon } from "./primitives";
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
import { useSetupGate } from "@/hooks";
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

type Phase = "loading" | "ready" | "failed" | "denied";

export function ActivationView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<OnboardingState | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [account, setAccount] = useState<ReceivingAccount | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [activating, setActivating] = useState(false);
  const [activateFailed, setActivateFailed] = useState(false);
  /**
   * What `activate` answered, when it answered in this visit. OB-05's list is
   * "What just happened", and on a later visit nothing just did.
   */
  const [activated, setActivated] = useState<OnboardingState | null>(null);
  const [rechecking, setRechecking] = useState(false);
  /** A re-read that failed, as distinct from one that found nothing new. */
  const [recheckFailed, setRecheckFailed] = useState(false);
  /*
   * The dashboard reads where the school is from the setup gate. When this
   * screen learns the school moved - paid, or switched on - the gate has to
   * hear it too, or "Go to your dashboard" lands on a page still saying the
   * school is not active.
   */
  const { refresh: refreshGate } = useSetupGate();

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
      // A 403 is this admin's scope, not a failure: no retry can grant it.
      .catch((err) => setPhase(failureKind(err) === "denied" ? "denied" : "failed"));

    billingApi.subscription().then(setSub).catch(() => setSub(null));
    billingApi.receivingAccount().then(setAccount).catch(() => setAccount(null));
    schoolApi.get().then(setSchool).catch(() => setSchool(null));
    billingApi
      .invoices()
      .then((rows) => setInvoices(rows))
      .catch(() => setInvoices(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recheck = () => {
    setRechecking(true);
    setRecheckFailed(false);
    onboardingApi
      .get()
      .then((s) => {
        setState(s);
        refreshGate();
      })
      /*
       * Was `.catch(() => {})`: the spinner stopped and nothing changed, which
       * reads exactly like "we looked and your transfer isn't here". A check
       * that could not be made has to say so.
       */
      .catch(() => setRecheckFailed(true))
      .finally(() => setRechecking(false));
  };

  const activate = () => {
    setActivating(true);
    setActivateFailed(false);
    onboardingApi
      .activate()
      .then((s) => {
        setState(s);
        setActivated(s);
        refreshGate();
      })
      .catch(() => setActivateFailed(true))
      .finally(() => setActivating(false));
  };

  if (phase === "loading") {
    return <div className={cn(CARD, "mt-5 h-[380px] animate-pulse")} />;
  }
  if (phase === "denied") {
    return <NoAccess className="mt-5" what="your school's activation" />;
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
  /*
   * THE INVOICE THIS SCHOOL IS PAYING, BY ID. This took the first row of the
   * invoice list, so a school with more than one invoice could be shown
   * another invoice's reference and amount to transfer against. The
   * onboarding state names the invoice raised at confirm; nothing else is
   * guessed - no id, no invoice card.
   */
  const invoice = state.invoiceId
    ? invoices?.find((i) => i.id === state.invoiceId) ?? null
    : null;

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[860px]">
        <p className="m-0 text-[13px] text-nevo-near-black/55">
          Getting to active
        </p>

        {screen === "roster" ? (
          <NothingConfirmedYet />
        ) : screen === "cost" ? (
          <Cost state={state} sub={sub} invoice={invoice} />
        ) : screen === "waiting" ? (
          <Waiting
            state={state}
            account={account}
            invoice={invoice}
            rechecking={rechecking}
            recheckFailed={recheckFailed}
            onRecheck={recheck}
            canActivate={mayActivate(state)}
            activating={activating}
            activateFailed={activateFailed}
            onActivate={activate}
          />
        ) : (
          <Active school={school} activated={activated} />
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
  invoice,
}: {
  state: OnboardingState;
  sub: Subscription | null;
  invoice: Invoice | null;
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
      {/*
        * THE INVOICE RAISED AT CONFIRM, WHEN THERE IS ONE. The subscription
        * cost sheet prices "N active students", and before activation the
        * roster is held, not active - so it could describe a different
        * headcount from the one this school is about to pay for. The invoice
        * carries its own students, rate, VAT and period; the cost sheet is
        * the fallback for a confirm that raised none.
        */}
      {invoice ? (
        <InvoiceBreakdown invoice={invoice} />
      ) : sub?.pricing ? (
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
  recheckFailed,
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
  recheckFailed: boolean;
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
          <SupportEmailLink className="h-[44px] cursor-pointer rounded-[10px] px-4 text-sm font-semibold leading-[44px] text-nevo-near-black/70 transition-colors hover:bg-nevo-near-black/[0.05]">
            Contact us
          </SupportEmailLink>
        </div>
        {recheckFailed ? (
          <p className="mt-3 max-w-[56ch] text-[13.5px] leading-[1.5] text-nevo-navy">
            We couldn&rsquo;t check just now, so we don&rsquo;t know yet
            whether it has arrived. Try again in a moment.
          </p>
        ) : null}
      </div>

      {/* OB-04's invoice card and "Download invoice" - the invoice this school
          is transferring against, with its PDF. */}
      {invoice ? <InvoiceBreakdown invoice={invoice} /> : null}

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

/**
 * OB-05's "What just happened", as far as the contract can say it.
 *
 * `POST /onboarding/activate` is documented as "Create the accounts, once the
 * invoice is paid and not before", and answers with the school's
 * `OnboardingState`. So the accounts it created - students across their
 * classes, and teachers - are established by the call that just returned, and
 * the counts are the ones it returned. Nothing is counted here.
 *
 * THREE OF THE FRAME'S FOUR ROWS ARE LEFT OUT OR REDUCED, because nothing
 * backs them:
 * - "18 teacher invitations sent · Each teacher gets a link to set their
 *   password". Activate says it creates accounts; it says nothing about
 *   emailing anyone, and an invitation carries `deliveryStatus` precisely
 *   because a send can fail to happen. The row says ACCOUNTS CREATED, which
 *   the contract does establish, and not that anything was sent.
 * - "Parent consent requests sent" - the response carries no consent field,
 *   and consent wording is with counsel.
 * - "Student sign-in details ready · Download or print them" - no endpoint
 *   produces them.
 * TODO(api): counts and delivery state for anything activate sends, on the
 * activate response.
 */
function happenedRows(s: OnboardingState): { label: string; sub: string | null }[] {
  const rows: { label: string; sub: string | null }[] = [];
  const classes = s.classes.length;
  if (s.studentCount > 0) {
    rows.push({
      label: `${s.studentCount} student ${s.studentCount === 1 ? "account" : "accounts"} created`,
      sub: classes > 0 ? `Across your ${classes} ${classes === 1 ? "class" : "classes"}` : null,
    });
  }
  if (s.teacherCount > 0) {
    rows.push({
      label: `${s.teacherCount} teacher ${s.teacherCount === 1 ? "account" : "accounts"} created`,
      sub: null,
    });
  }
  return rows;
}

/** OB-05. */
function Active({
  school,
  activated,
}: {
  school: School | null;
  /** What activate returned in this visit, or null on any later one. */
  activated: OnboardingState | null;
}) {
  const happened = activated ? happenedRows(activated) : [];
  return (
    <>
      <h2 className="mt-1.5 text-[23px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[28px]">
        {school?.name ? `${school.name} is active` : "Your school is active"}
      </h2>
      <p className="mt-2 max-w-[64ch] text-[15px] leading-[1.55] text-nevo-near-black/68">
        Your payment is confirmed and your school is switched on.
        {happened.length > 0 ? " Here’s what just happened." : ""}
      </p>

      {happened.length > 0 ? (
        <>
          <h3 className="m-0 mt-7 mb-3 text-[13px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
            What just happened
          </h3>
          <ul className={cn(CARD, "m-0 list-none overflow-hidden p-0")}>
            {happened.map((row, i) => (
              <li
                key={row.label}
                className={cn(
                  "flex items-center gap-3.5 px-[18px] py-4",
                  i < happened.length - 1 && "border-b border-nevo-near-black/7",
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 flex-none items-center justify-center rounded-full bg-nevo-navy text-nevo-cream"
                >
                  <CheckIcon />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-nevo-near-black">
                    {row.label}
                  </span>
                  {row.sub ? (
                    <span className="mt-0.5 block text-[12.5px] text-nevo-near-black/55">
                      {row.sub}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

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
