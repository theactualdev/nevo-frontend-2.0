"use client";

import { useEffect, useRef, useState } from "react";
import {
  BANK_REF_MAX,
  BANK_REF_MIN,
  transferAccepted,
  type PaymentOutcome,
  type PricingCurrency,
  type ReceivingAccount,
} from "@/lib/api/billing";
import { cn } from "@/lib/utils";

/**
 * D11c "How to pay" - the transfer details for the invoice a school owes.
 *
 * BOUND, NEVER LITERAL. The frame fills this panel in with Kuda Bank and an
 * account number; those are its illustration. Every value here comes from
 * `billingApi.receivingAccount`, and when that answers with nothing the panel
 * says the details are not available and points at what IS known: the
 * reference, which the invoice already carries. It never invents an account.
 *
 * THE TRANSFER IS NOW RECORDED, NOT ASSUMED (backend, 7 Sep).
 * `POST /billing/payments/manual-transfer` takes the invoice and the school's
 * own bank reference, so "I've made this transfer" tells the backend rather
 * than only colouring a pill. The reference is required, 3-120 characters, so
 * the button expands IN PLACE to ask for it - still no modal, per the ruling.
 *
 * THE REFERENCE IS AN IDEMPOTENCY KEY. Sending the same one twice returns the
 * ORIGINAL transaction with `invoicePaid: false` and a message saying it was
 * already recorded. That is not a failure and is not shown as one: a
 * double-tap cannot settle an invoice twice, and the admin is told their
 * transfer is already on file.
 *
 * `POST /billing/payments/{reference}/verify` is deliberately NOT used -
 * backend's own words are that it is a write which asks Paystack about a
 * transaction and settles the invoice off the answer, so a bank reference 404s
 * there.
 */

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";
const COPIED_MS = 1800;

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = () => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      })
      // A clipboard an admin's browser refuses is not a copy that happened.
      .catch(() => setCopied(false));
  };

  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="flex min-w-0 flex-col">
        <span className="text-[12.5px] text-nevo-near-black/55">{label}</span>
        <span className="mt-0.5 font-mono text-[15px] font-semibold text-nevo-near-black">
          {value}
        </span>
      </span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 cursor-pointer text-[13px] font-semibold text-nevo-navy hover:underline"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function HowToPayPanel({
  account,
  reference,
  amount,
  invoiceId,
  billedIn,
  recorded,
  onRecord,
  onRecorded,
}: {
  /** Null until the endpoint exists, or when it answers incompletely. */
  account: ReceivingAccount | null;
  /** The invoice reference to quote on the transfer. */
  reference: string | null;
  /** Formatted, already grouped by the caller. */
  amount: string | null;
  /** Absent when there is no invoice to pay against. */
  invoiceId: string | null;
  /**
   * The currency the SCHOOL is billed in. The account has its own, and the two
   * are not guaranteed to agree - a school told to send pounds to a naira
   * account loses real money on a real transfer.
   */
  billedIn: PricingCurrency | null;
  /** The backend has this transfer on file. */
  recorded?: PaymentOutcome | null;
  /**
   * OPTIONAL, AND THEIR ABSENCE IS A REAL CASE RATHER THAN A CONVENIENCE.
   *
   * D24's OB-04 shows the same account details during onboarding, where
   * Paystack reconciles the transfer automatically off the reference -
   * *"Use the reference so Paystack can match your payment automatically.
   * This invoice then updates to Paid on its own."* There is nothing for a
   * school to record there, so the control is not rendered.
   *
   * Without these the panel is exactly the half that is still true: here is
   * where to send it, here is what to quote. Passing a no-op instead would
   * have left "I've made this transfer" on a screen where pressing it does
   * nothing.
   */
  onRecord?: (
    invoiceId: string,
    bankReference: string,
  ) => Promise<PaymentOutcome>;
  onRecorded?: (outcome: PaymentOutcome) => void;
}) {
  const [entering, setEntering] = useState(false);
  const [bankRef, setBankRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  /** The backend's own words when it declined, in preference to ours. */
  const [failedMessage, setFailedMessage] = useState<string | null>(null);

  /** Both known, and different. An unknown currency is not a mismatch. */
  const mismatched = Boolean(account && billedIn && account.currency !== billedIn);

  const trimmed = bankRef.trim();
  const validRef =
    trimmed.length >= BANK_REF_MIN && trimmed.length <= BANK_REF_MAX;

  const record = () => {
    if (!invoiceId || !validRef || saving) return;
    setSaving(true);
    setFailed(false);
    setFailedMessage(null);
    onRecord?.(invoiceId, trimmed)
      .then((outcome) => {
        /*
         * A 200 IS NOT AN ACCEPTANCE. `status` is
         * `pending | success | failed | abandoned` and was never read: a
         * response of `failed` was stored as a transfer on file, flipped the
         * invoice row to "Pending verification", and told the admin their
         * money was on its way. They stop chasing it and the invoice stays
         * unpaid with nothing on the screen ever saying otherwise.
         */
        if (!transferAccepted(outcome)) {
          setFailed(true);
          setFailedMessage(outcome.message ?? null);
          setSaving(false);
          return;
        }
        onRecorded?.(outcome);
      })
      .catch(() => {
        // Stay open, keep their reference, and say nothing changed.
        setFailed(true);
        setFailedMessage(null);
        setSaving(false);
      });
  };

  return (
    <>
      <h2 className="mt-8 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
        How to pay
      </h2>
      <div className={cn(CARD, "mt-3 px-6 py-[22px]")}>
        {account ? (
          <>
            {amount &&
              (mismatched ? (
                /*
                 * The account's currency and the school's are not the same.
                 * "Transfer GBP 54,825" against a naira account is a real
                 * transfer of real money to a place that cannot take it, so
                 * this states both and asks rather than instructing.
                 */
                <p className="m-0 text-[14.5px] leading-[1.55] text-nevo-near-black/78">
                  Your invoice is <strong>{amount}</strong>, and this account
                  receives {account.currency}. Check with us before you
                  transfer.
                </p>
              ) : (
                <p className="m-0 text-[14.5px] leading-[1.55] text-nevo-near-black/78">
                  Transfer <strong>{amount}</strong>{" "}
                  from your school&rsquo;s bank.
                </p>
              ))}
            <div className="mt-3 divide-y divide-nevo-near-black/7">
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[12.5px] text-nevo-near-black/55">
                    Bank
                  </span>
                  <span className="mt-0.5 text-[15px] font-semibold text-nevo-near-black">
                    {account.bankName}
                  </span>
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2.5">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[12.5px] text-nevo-near-black/55">
                    Account name
                  </span>
                  <span className="mt-0.5 text-[15px] font-semibold text-nevo-near-black">
                    {account.accountName}
                  </span>
                </span>
              </div>
              <CopyField label="Account number" value={account.accountNumber} />
              {reference && <CopyField label="Reference" value={reference} />}
            </div>
            {reference && (
              <p className="m-0 mt-3 text-[13px] leading-[1.55] text-nevo-near-black/62">
                Use the reference exactly as shown so your transfer is matched
                to this invoice.
              </p>
            )}
          </>
        ) : (
          /* No account, and no invented one. Say so, and give them the one
             thing that IS known - the reference is on the invoice already.

             WAS "Transfer details aren't available here yet." That was true
             before `GET /api/billing/bank-transfer-details` existed; it is
             live now, so an absent account means the read failed, and "not
             available yet" told the school the feature was unbuilt. */
          <>
            <p className="m-0 text-[14.5px] leading-[1.55] text-nevo-near-black/78">
              We couldn&rsquo;t load Nevo&rsquo;s bank details just now.
            </p>
            <p className="m-0 mt-1.5 text-[13.5px] leading-[1.55] text-nevo-near-black/62">
              Your invoice carries the amount
              {reference ? (
                <>
                  {" "}
                  and the reference <strong>{reference}</strong>
                </>
              ) : null}
              . Nevo will confirm the account to transfer to.
            </p>
          </>
        )}

        <div className="mt-5">
          {recorded ? (
            <p
              role="status"
              className="m-0 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-navy"
            >
              {/* The backend's own words when this reference was already on
                  file, so a repeat reads as "we have it" rather than a
                  failure. */}
              {recorded.message ??
                "Payment sent, pending verification. We’ll update this invoice as soon as the transfer is confirmed."}
            </p>
          ) : entering ? (
            /* Expands in place - no modal, per the ruling. */
            <div>
              <label className="block">
                <span className="text-[13px] font-semibold text-nevo-near-black/70">
                  Your bank&rsquo;s transfer reference
                </span>
                <input
                  value={bankRef}
                  onChange={(e) => setBankRef(e.target.value)}
                  autoFocus
                  maxLength={BANK_REF_MAX}
                  placeholder="From your bank&rsquo;s confirmation"
                  className="mt-1.5 h-11 w-full max-w-[420px] rounded-[10px] border border-nevo-near-black/15 bg-nevo-cream px-3.5 text-[15px] text-nevo-near-black outline-none focus:border-nevo-navy"
                />
              </label>
              <p className="m-0 mt-1.5 text-[12.5px] text-nevo-near-black/55">
                We use this to match your transfer. Sending the same reference
                twice won&rsquo;t pay the invoice twice.
              </p>
              {failed && (
                <p className="m-0 mt-2.5 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-navy">
                  {failedMessage ??
                    "That didn’t record, so nothing has changed. Your reference is still here – try again in a moment."}
                </p>
              )}
              <div className="mt-3 flex gap-2.5">
                <button
                  type="button"
                  onClick={record}
                  disabled={!validRef || saving || !invoiceId}
                  className="h-11 cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-[14.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 active:brightness-93 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Recording…" : "Record transfer"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEntering(false);
                    setFailed(false);
                    setFailedMessage(null);
                  }}
                  disabled={saving}
                  className="h-11 cursor-pointer rounded-[10px] px-4 text-[14.5px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : onRecord ? (
            <button
              type="button"
              onClick={() => setEntering(true)}
              disabled={!invoiceId}
              className="h-11 cursor-pointer rounded-[10px] border border-nevo-navy bg-nevo-cream px-5 text-[14.5px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-not-allowed disabled:opacity-60"
            >
              I&rsquo;ve made this transfer
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
