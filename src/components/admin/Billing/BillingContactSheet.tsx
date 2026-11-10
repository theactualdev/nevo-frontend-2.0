"use client";

import { useState } from "react";
import { ApiError, apiErrorCode } from "@/lib/api/client";
import {
  billingApi,
  type BillingContact,
  type BillingContactDraft,
} from "@/lib/api/billing";

/**
 * The billing contact, which is the ONE thing on D11 an admin can change today.
 *
 * The required set is the API's, not ours: `email`, `addressLine1`, `city` and
 * `country` are required on `BillingContactRequest`; phone, second line, region
 * and postcode are genuinely optional and are sent as `null` when blank rather
 * than as empty strings, so a cleared field reads as cleared.
 *
 * The save reports what actually happened. A failed write leaves the sheet open
 * with the admin's typing intact and says so - the alternative, closing on a
 * failure, is the "Saved" that saved nowhere this codebase has shipped before.
 */

const FIELD =
  "mt-1.5 h-11 w-full rounded-[10px] border border-nevo-near-black/15 bg-nevo-cream px-3.5 text-[15px] text-nevo-near-black outline-none focus:border-nevo-navy";
const LABEL = "text-[13px] font-semibold text-nevo-near-black/70";

export function BillingContactSheet({
  contact,
  onClose,
  onSaved,
}: {
  contact: BillingContact | null;
  onClose: () => void;
  onSaved: (next: BillingContact) => void;
}) {
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [line1, setLine1] = useState(contact?.addressLine1 ?? "");
  const [line2, setLine2] = useState(contact?.addressLine2 ?? "");
  const [city, setCity] = useState(contact?.city ?? "");
  const [region, setRegion] = useState(contact?.region ?? "");
  const [postcode, setPostcode] = useState(contact?.postalCode ?? "");
  const [country, setCountry] = useState(contact?.country ?? "Nigeria");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  /** 409 `billing_contact_exists`: that address is already on the list. */
  const [duplicate, setDuplicate] = useState(false);

  const complete =
    email.trim().length > 0 &&
    line1.trim().length > 0 &&
    city.trim().length > 0 &&
    country.trim().length > 0;

  const save = () => {
    if (!complete || saving) return;
    setSaving(true);
    setFailed(false);
    setDuplicate(false);
    const blankToNull = (v: string) => (v.trim().length > 0 ? v.trim() : null);
    const draft: BillingContactDraft = {
      email: email.trim(),
      phone: blankToNull(phone),
      addressLine1: line1.trim(),
      addressLine2: blankToNull(line2),
      city: city.trim(),
      region: blankToNull(region),
      postalCode: blankToNull(postcode),
      country: country.trim(),
    };
    // One contact of several (a16224d): a new one is added, an existing one
    // edited by its id.
    (contact ? billingApi.editContact(contact.id, draft) : billingApi.addContact(draft))
      .then(onSaved)
      .catch((err: unknown) => {
        // Stay open, keep their typing, and say it did not save.
        if (err instanceof ApiError && apiErrorCode(err.detail) === "billing_contact_exists") {
          setDuplicate(true);
        } else {
          setFailed(true);
        }
        setSaving(false);
      });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-nevo-near-black/50 p-6"
      onClick={() => !saving && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Billing contact"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[86vh] w-full max-w-[520px] overflow-y-auto rounded-2xl bg-nevo-cream p-7 shadow-[0_24px_60px_rgba(0,0,0,0.3)]"
      >
        <h2 className="m-0 text-xl font-semibold text-nevo-near-black">
          Billing contact
        </h2>
        {/*
          * BACK, AND TRUE NOW (Teslim e8b70bd, 6 Nov). It came off in #1008
          * because nothing sent to this address. Now every billing contact is
          * emailed each invoice as it is issued, an overdue reminder once it
          * is past due (SCRUM-310, 236f99b), and a reminder 7 days before
          * it is due and on the day (billing/email_worker.py, the daily
          * `billing.invoice_reminders` job).
          */}
        <p className="m-0 mt-1.5 text-[13.5px] leading-[1.55] text-nevo-near-black/62">
          Where invoices and payment reminders go.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <label className="col-span-2 block">
            <span className={LABEL}>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className={FIELD}
              placeholder="bursar@school.edu.ng"
            />
          </label>
          <label className="col-span-2 block">
            <span className={LABEL}>Phone (optional)</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="col-span-2 block">
            <span className={LABEL}>Address</span>
            <input
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="col-span-2 block">
            <span className={LABEL}>Address line 2 (optional)</span>
            <input
              value={line2}
              onChange={(e) => setLine2(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>City</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>State (optional)</span>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>Postcode (optional)</span>
            <input
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>Country</span>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={FIELD}
            />
          </label>
        </div>

        {duplicate && (
          <p className="m-0 mt-4 text-[13.5px] leading-[1.5] text-nevo-navy">
            That address is already one of your billing contacts.
          </p>
        )}
        {failed && (
          <p className="m-0 mt-4 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-navy">
            That didn&rsquo;t save. Nothing has changed, and what you typed is
            still here &ndash; try again in a moment.
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-11 flex-1 cursor-pointer rounded-[10px] text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!complete || saving}
            className="h-11 flex-1 cursor-pointer rounded-[10px] bg-nevo-navy text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 active:brightness-93 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
