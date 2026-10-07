"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  billingApi,
  type BillingContact,
  type Invoice,
  type InvoiceStatus,
  type PaymentOutcome,
  type ReceivingAccount,
  type Subscription,
  type UpcomingCharge,
} from "@/lib/api/billing";
import { formatMoney } from "@/lib/money";
import {
  daysPastDue,
  overdueHeadline,
  overduePanel,
  overdueLine,
} from "./overdue";
import { cn } from "@/lib/utils";
import { ReadFailed } from "../ReadFailed";
import { BillingContactSheet } from "./BillingContactSheet";
import { CostSheet } from "./CostSheet";
import { HowToPayPanel } from "./HowToPayPanel";
import { InvoicePdfLink } from "./InvoicePdfLink";
import { NoAccess, failureKind } from "../NoAccess";

/**
 * D11 / D11b Billing - the half of the screen that can be built honestly.
 *
 * WHAT IS HERE. The invoice history with its real PDFs, the next charge, the
 * renewal note the backend raises itself, and the billing contact, which is the
 * one thing on this screen an admin can change.
 *
 * WHAT IS DELIBERATELY ABSENT, and why - a billing screen missing its cost is a
 * conspicuous hole, and the next reader deserves the reason rather than a guess:
 *
 * 1. THE COST SHEET IS BUILT (7 Sep). The dispute that blocked it is settled in
 *    the contract itself: `pricingModel` is a const `"per_student"`, and the
 *    read carries `studentCount`, `perStudentRate`, the server's VAT figures
 *    and `currency`. See `CostSheet` - it shows the totals the server computed
 *    and does no arithmetic of its own.
 * 2. THE "HOW TO PAY" PANEL IS LIVE (D11c, design ruling 7 Sep). Its account
 *    comes from `GET /billing/bank-transfer-details`, served since 8 Sep; see
 *    `HowToPayPanel`. The frame's Kuda Bank account number is its
 *    illustration, not a value to hard-code.
 * 3. PAYMENT METHOD AND CHECKOUT. `PUT /billing/payment-method` takes `card` or
 *    `direct_debit`, and `POST /payments/checkout` returns a Paystack
 *    `authorizationUrl`. D11: "no cards, no in-app checkout."
 *
 * The screen says all this to the admin in one line at the foot, rather than
 * looking unfinished by accident.
 *
 * DESIGN LAW: no red anywhere. Overdue is the loudest state on this screen and
 * it renders violet, not alarm - and per D11b an overdue invoice never gates
 * access, so nothing here blocks anything.
 */

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";

type Phase = "loading" | "ready" | "failed" | "denied";

/*
 * `naira()` lived here and stamped a naira sign on every figure on the screen.
 * See `lib/money.ts` - amounts carry their own currency now, and the fraction
 * is no longer truncated away.
 */

function longDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** No red: overdue is violet, paid is navy, pending is quiet. */
export function StatusPill({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-3 py-1 text-[12.5px] font-semibold capitalize",
        status === "paid" && "bg-nevo-navy/10 text-nevo-navy",
        status === "overdue" && "bg-nevo-violet/25 text-nevo-navy",
        status === "pending" &&
          "bg-nevo-near-black/[0.07] text-nevo-near-black/70",
      )}
    >
      {status}
    </span>
  );
}

export function BillingView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [invoicesFailed, setInvoicesFailed] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingCharge | null>(null);
  const [upcomingFailed, setUpcomingFailed] = useState(false);
  /**
   * The instant every due date is judged against, captured once when the read
   * lands. Not `Date.now()` during render - React purity, and the better
   * reason underneath it: every row on this page should be measured against
   * the same moment, not against whenever each happened to be evaluated.
   */
  const [now, setNow] = useState(0);
  const [contact, setContact] = useState<BillingContact | null>(null);
  const [editing, setEditing] = useState(false);
  const [account, setAccount] = useState<ReceivingAccount | null>(null);
  /**
   * Transfers the BACKEND has on file this session, keyed by invoice number.
   * No longer optimistic: `manual-transfer` records it, and a repeat of the
   * same bank reference comes back as the original transaction rather than
   * paying twice.
   */
  const [recorded, setRecorded] = useState<Record<string, PaymentOutcome>>({});

  const load = useCallback(() => {
    // The subscription read owns the page - it carries the school name and the
    // contact. The other two are their own cards and their own failures, so a
    // broken invoice list does not take the whole screen down with it.
    billingApi
      .subscription()
      .then((s) => {
        setSubscription(s);
        setContact(s.billingContact);
        setNow(Date.now());
        setPhase("ready");

        setInvoicesFailed(false);
        billingApi
          .invoices()
          .then((rows) => {
            // Newest first; the endpoint does not promise an order.
            setInvoices(
              [...rows].sort(
                (a, b) =>
                  new Date(b.issuedAt).getTime() -
                  new Date(a.issuedAt).getTime(),
              ),
            );
            setInvoicesFailed(false);
          })
          .catch(() => {
            setInvoices([]);
            setInvoicesFailed(true);
          });

        // The receiving account is its own read and its own absence: when it
        // fails, How to pay says the details aren't available, not "try again".
        billingApi
          .receivingAccount()
          .then(setAccount)
          .catch(() => setAccount(null));

        setUpcomingFailed(false);
        billingApi
          .upcoming()
          .then((u) => {
            setUpcoming(u);
            setUpcomingFailed(false);
          })
          .catch(() => setUpcomingFailed(true));
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const renewal =
    upcoming?.renewalBannerVisible || subscription?.renewalBannerVisible
      ? (upcoming?.renewalMessage ?? subscription?.renewalMessage ?? null)
      : null;

  return (
    <div className="mx-auto w-full max-w-[980px] px-8 py-9">
      <p className="m-0 text-[13px] font-semibold tracking-[0.12em] text-nevo-near-black/45 uppercase">
        {subscription?.schoolName ?? "Billing"}
      </p>
      <h1 className="m-0 mt-1.5 text-[26px] font-semibold tracking-[-0.01em] text-nevo-near-black">
        Billing &amp; subscription
      </h1>

      {phase === "loading" && (
        <div className="mt-7 space-y-3" aria-hidden>
          <div className="h-24 animate-pulse rounded-xl bg-nevo-near-black/[0.06]" />
          <div className="h-40 animate-pulse rounded-xl bg-nevo-near-black/[0.06]" />
        </div>
      )}

      {phase === "denied" && <NoAccess what="billing" />}
        {phase === "failed" && (
        <div className={cn(CARD, "mt-7 px-6 py-[22px]")}>
          <p className="m-0 text-[15px] font-semibold text-nevo-near-black">
            We couldn&rsquo;t load your billing
          </p>
          <p className="m-0 mt-1.5 text-[13.5px] leading-[1.55] text-nevo-near-black/62">
            Nothing has changed for your school. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={load}
            className="mt-3.5 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {phase === "ready" && subscription && (
        <>
          {renewal && (
            <div className="mt-6 rounded-xl bg-nevo-violet/[0.18] px-6 py-4">
              <p className="m-0 text-sm leading-[1.55] text-nevo-navy">
                {renewal}
              </p>
            </div>
          )}

          <CostSheet
            pricing={subscription.pricing}
            payStatus={
              !upcomingFailed && upcoming?.invoiceId
                ? upcoming.status === "paid"
                  ? "active"
                  : "due"
                : null
            }
          />

          <h2 className="mt-8 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
            Next charge
          </h2>
          <div className={cn(CARD, "mt-3 px-6 py-[22px]")}>
            {upcomingFailed ? (
              <ReadFailed what="your next charge" onRetry={load} />
            ) : upcoming?.amount ? (
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <div>
                  <span className="text-[30px] leading-none font-semibold text-nevo-near-black tabular-nums">
                    {formatMoney(upcoming.amount, subscription.pricing.currency)}
                  </span>
                  <p className="m-0 mt-2 text-[13.5px] text-nevo-near-black/62">
                    Due {longDate(upcoming.dueAt)}
                    {upcoming.invoiceNumber
                      ? ` · ${upcoming.invoiceNumber}`
                      : ""}
                  </p>
                </div>
                {upcoming.status && <StatusPill status={upcoming.status} />}
              </div>
            ) : (
              <p className="m-0 text-[14.5px] text-nevo-near-black/62">
                Nothing due at the moment.
              </p>
            )}
          </div>

          {/*
            * D11.8's page-level panel, past 60 days only. Everything about its
            * treatment is fixed by the spec and none of it is decoration:
            * violet tint, not alarm; the bank details inline "so paying needs
            * no navigation"; and NOTHING about access, ever - "no red, no
            * warning glyph, no 'account at risk', no countdown to suspension,
            * and no automated dunning tone". Several overdue invoices
            * aggregate into ONE panel rather than repeating it per invoice.
            */}
          {(() => {
            const panel = overduePanel(invoices, now);
            if (!panel) return null;
            return (
              <div className="mt-8 rounded-xl bg-nevo-violet/[0.18] px-6 py-5">
                <p className="m-0 text-sm leading-[1.6] text-nevo-navy">
                  {overdueHeadline(
                    panel,
                    (amount) =>
                      formatMoney(amount, subscription.pricing.currency),
                    longDate,
                  )}{" "}
                  Our bank details are below, and your relationship manager can
                  help if something needs sorting out.
                </p>
                {account ? (
                  <dl className="m-0 mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[13.5px]">
                    <dt className="text-nevo-near-black/60">Bank</dt>
                    <dd className="m-0 font-medium text-nevo-near-black">
                      {account.bankName}
                    </dd>
                    <dt className="text-nevo-near-black/60">Account name</dt>
                    <dd className="m-0 font-medium text-nevo-near-black">
                      {account.accountName}
                    </dd>
                    <dt className="text-nevo-near-black/60">Account number</dt>
                    <dd className="m-0 font-mono font-medium text-nevo-near-black">
                      {account.accountNumber}
                    </dd>
                  </dl>
                ) : (
                  /* The account read is its own absence. An account number we
                     do not have must never be approximated on the one panel a
                     school would pay against. */
                  <p className="m-0 mt-3 text-[13px] leading-[1.5] text-nevo-near-black/62">
                    We couldn&rsquo;t load our bank details just now &ndash;
                    your relationship manager has them.
                  </p>
                )}
              </div>
            );
          })()}

          <h2 className="mt-8 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
            Invoices
          </h2>
          <div className={cn(CARD, "mt-3 overflow-hidden")}>
            {invoicesFailed ? (
              <ReadFailed
                className="px-6 py-[22px]"
                what="your invoices"
                onRetry={load}
              />
            ) : invoices === null ? (
              <div
                className="h-20 animate-pulse bg-nevo-near-black/[0.04]"
                aria-hidden
              />
            ) : invoices.length === 0 ? (
              /* SCRUM-98's done-criterion: "Empty state names the first
                 invoice date rather than saying nothing is here." The date is
                 `upcoming.dueAt`, which this screen already reads and renders
                 forty lines above - so the one thing a bursar opens this
                 section to find out was on the page and not in the state that
                 exists to answer it. Conditional: a school with nothing
                 scheduled keeps the old sentence rather than inventing one. */
              <div className="px-6 py-[22px]">
                <p className="m-0 text-[15px] font-semibold text-nevo-near-black">
                  No invoices yet
                </p>
                <p className="m-0 mt-1.5 text-[13.5px] leading-[1.55] text-nevo-near-black/62">
                  {upcoming?.dueAt
                    ? `Your first one is due ${longDate(upcoming.dueAt)}.`
                    : "Your first one appears here once your school is billed."}
                </p>
                <p className="m-0 mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/50">
                  Need to add a PO number to your invoices? Your relationship
                  manager can set that up.
                </p>
              </div>
            ) : (
              invoices.map((inv, i) => (
                <div
                  key={inv.id}
                  className={cn(
                    "flex flex-wrap items-center gap-4 px-6 py-[18px]",
                    i < invoices.length - 1 &&
                      "border-b border-nevo-near-black/7",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px] font-semibold text-nevo-near-black tabular-nums">
                      {formatMoney(inv.amount, inv.currency)}
                    </span>
                    <span className="mt-0.5 text-[13px] text-nevo-near-black/58">
                      {/* D11b: an invoice opens to its own page. The number is
                          the link rather than the whole row, because the row
                          also holds the PDF button. */}
                      <Link
                        href={`/admin/billing/invoices/${inv.id}`}
                        className="font-semibold text-nevo-navy hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>{" "}
                      &middot; issued{" "}
                      {longDate(inv.issuedAt)} &middot;{" "}
                      {inv.status === "paid"
                        ? `paid ${longDate(inv.paidAt)}`
                        : `due ${longDate(inv.dueAt)}`}
                    </span>
                  </span>
                  {inv.status === "overdue" && daysPastDue(inv.dueAt, now) ? (
                    /* D11.8's row line, and the whole of it. "How many days,
                       and that nothing has changed for the school's students.
                       No consequence threats, because there are none at this
                       stage." The spec is emphatic that no access is ever
                       affected by non-payment, at any number of days - so
                       there is deliberately nothing further to say. */
                    <span className="order-last w-full text-[13px] leading-[1.5] text-nevo-near-black/66">
                      {overdueLine(daysPastDue(inv.dueAt, now)!)}
                    </span>
                  ) : null}
                  {recorded[inv.invoiceNumber] && inv.status !== "paid" ? (
                    <span className="shrink-0 rounded-full bg-nevo-violet/25 px-3 py-1 text-[12.5px] font-semibold text-nevo-navy">
                      Pending verification
                    </span>
                  ) : (
                    <StatusPill status={inv.status} />
                  )}
                  <InvoicePdfLink
                    invoice={inv}
                    className="shrink-0 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
                  />
                </div>
              ))
            )}
          </div>

          <h2 className="mt-8 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
            Billing contact
          </h2>
          <div className={cn(CARD, "mt-3 px-6 py-[22px]")}>
            {contact ? (
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 text-[14px] leading-[1.6] text-nevo-near-black/78">
                  <p className="m-0 font-semibold text-nevo-near-black">
                    {contact.email}
                  </p>
                  {contact.phone && <p className="m-0">{contact.phone}</p>}
                  <p className="m-0 mt-1.5">
                    {[
                      contact.addressLine1,
                      contact.addressLine2,
                      contact.city,
                      contact.region,
                      contact.postalCode,
                      contact.country,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="shrink-0 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
                >
                  Edit
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="m-0 text-[14.5px] text-nevo-near-black/62">
                  No billing contact on file.
                </p>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="shrink-0 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
                >
                  Add one
                </button>
              </div>
            )}
          </div>

          {/*
            * ONLY WHEN SOMETHING IS OWED. This rendered whatever the upcoming
            * charge said - a paid invoice, or none at all - so a school with
            * nothing to pay met bank details and a disabled "I've made this
            * transfer" with no reference to quote.
            */}
          {upcoming?.invoiceId && upcoming.status !== "paid" ? (
          <HowToPayPanel
            account={account}
            reference={upcoming?.invoiceNumber ?? null}
            amount={
              upcoming?.amount
                ? formatMoney(upcoming.amount, subscription.pricing.currency)
                : null
            }
            billedIn={subscription.pricing.currency}
            invoiceId={upcoming?.invoiceId ?? null}
            recorded={
              upcoming?.invoiceNumber
                ? (recorded[upcoming.invoiceNumber] ?? null)
                : null
            }
            onRecord={billingApi.manualTransfer}
            onRecorded={(outcome) => {
              const ref = upcoming?.invoiceNumber;
              if (ref) setRecorded((prev) => ({ ...prev, [ref]: outcome }));
              // The backend may have settled it outright; re-read so the
              // invoice list shows what it now says rather than our guess.
              if (outcome.invoicePaid) load();
            }}
          />
          ) : null}

          {/* Name the hole, rather than letting it read as unfinished. It
              used to end "(D11d)" - an internal design-frame code, shown to
              a school. */}
          <p className="mt-8 text-[13px] leading-[1.6] text-nevo-near-black/55 italic">
            Plan options and switching aren&rsquo;t here yet. Your cost above
            is the model your school is billed on.
          </p>
        </>
      )}

      {editing && (
        <BillingContactSheet
          contact={contact}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setContact(next);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
