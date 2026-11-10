"use client";

import { useCallback, useEffect, useState } from "react";
import { billingApi, type BillingContact } from "@/lib/api/billing";
import { ApiError, apiErrorCode, apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { ReadFailed } from "../ReadFailed";
import { BillingContactSheet } from "./BillingContactSheet";

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";

/*
 * D11b "WHO GETS THE INVOICES" (several contacts, Lydia 4 Nov: yes), built to
 * what the server does (a16224d routes; e8b70bd delivery, checked 6 Nov):
 *
 *  - every contact here is emailed each invoice as it is issued, and a
 *    reminder 7 days before it is due and on the day, and ONE overdue
 *    reminder once it is past due (SCRUM-310, 236f99b) - a paid invoice is
 *    never chased;
 *  - the LAST contact can't be removed (SCRUM-311, 236f99b): the server
 *    refuses with 409 `last_billing_contact` and says why, and the row shows
 *    the server's words - never "try again", which could not work;
 *  - one of them is the school's PRIMARY contact - the subscription's
 *    `billingContact` - so that row carries the frame's "Primary" pill;
 *  - Add a contact, Edit and Remove are the routes themselves.
 *
 * Left out, and why:
 *  - each row's name and role ("Mr. Tayo Adeniyi · Bursar"): a contact is an
 *    email, phone and address - no name or role is stored;
 *  - "Every invoice" / "Only when something needs attention": there is no
 *    per-contact choice - every contact gets every invoice and reminder;
 *  - "Invoices also go to {founding admin}, as the founding admin" and
 *    "Remove everyone and they'll go to the founding admin": admins get an
 *    in-app notice, not the invoice, and with no contacts nothing is emailed.
 *    So only the frame's first half stands: "Someone needs to receive your
 *    invoices."
 */
export function BillingContacts({
  primaryId,
  onChanged,
}: {
  /** The subscription's primary contact, for the pill. */
  primaryId: string | null;
  /** Something changed that can move the primary - re-read it. */
  onChanged: () => void;
}) {
  const [contacts, setContacts] = useState<BillingContact[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** null: closed. "new": adding. A contact: editing that one. */
  const [sheet, setSheet] = useState<BillingContact | "new" | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeFailed, setRemoveFailed] = useState<string | null>(null);
  /** The server refused - the last contact (SCRUM-311) - in its own words. */
  const [removeRefused, setRemoveRefused] = useState<{ id: string; why: string } | null>(null);

  useEffect(() => {
    let alive = true;
    billingApi
      .contacts()
      .then((rows) => {
        if (!alive) return;
        setContacts(rows);
        setFailed(false);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const reread = useCallback(() => {
    setAttempt((a) => a + 1);
    onChanged();
  }, [onChanged]);

  const remove = (c: BillingContact) => {
    if (removing) return;
    setRemoving(c.id);
    setRemoveFailed(null);
    setRemoveRefused(null);
    billingApi
      .removeContact(c.id)
      .then(reread)
      .catch((err: unknown) => {
        if (err instanceof ApiError && apiErrorCode(err.detail) === "last_billing_contact") {
          setRemoveRefused({
            id: c.id,
            why:
              apiErrorMessage(err.detail) ??
              "This is the school's only billing contact. Add another one before removing this one, or the school cannot be invoiced.",
          });
          return;
        }
        setRemoveFailed(c.id);
      })
      .finally(() => setRemoving(null));
  };

  return (
    <>
      <h2 className="mt-8 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
        Who gets the invoices
      </h2>
      <div className={cn(CARD, "mt-3 overflow-hidden")}>
        {failed ? (
          <ReadFailed
            className="px-6 py-[22px]"
            what="who gets your invoices"
            onRetry={() => setAttempt((a) => a + 1)}
          />
        ) : contacts === null ? (
          <div aria-busy="true" className="h-[72px]" />
        ) : contacts.length === 0 ? (
          /*
           * NO ONE TO SEND TO - Lydia's words (SCRUM-321, 7 Nov). True to the
           * server: with no contact nothing is emailed (2de78a1 only logs it),
           * so the invoices are on this page and nowhere else.
           */
          <div className="px-6 py-[22px]">
            <p className="m-0 text-[14.5px] leading-[1.55] text-nevo-near-black/78">
              No one is set to receive your invoices. Add a billing contact and we&rsquo;ll send
              them there.
            </p>
            <p className="m-0 mt-1.5 text-[13.5px] leading-[1.5] text-nevo-near-black/58">
              Until then, your invoices appear here only.
            </p>
            <button
              type="button"
              onClick={() => setSheet("new")}
              className="mt-3.5 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
            >
              Add a billing contact
            </button>
          </div>
        ) : (
          contacts.map((c, i) => (
            <div
              key={c.id}
              className={cn(
                "flex flex-wrap items-start justify-between gap-4 px-6 py-[18px]",
                i > 0 && "border-t border-nevo-near-black/7",
              )}
            >
              <div className="min-w-0 text-[14px] leading-[1.6] text-nevo-near-black/78">
                <p className="m-0 flex items-center gap-2 font-semibold text-nevo-near-black">
                  {c.email}
                  {c.id === primaryId ? (
                    <span className="rounded-full bg-nevo-navy/10 px-2 py-0.5 text-[11.5px] font-semibold text-nevo-navy">
                      Primary
                    </span>
                  ) : null}
                </p>
                {c.phone ? <p className="m-0">{c.phone}</p> : null}
                <p className="m-0 mt-0.5 text-[13px] text-nevo-near-black/58">
                  {[c.addressLine1, c.addressLine2, c.city, c.region, c.postalCode, c.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {removeRefused?.id === c.id ? (
                  <p role="alert" className="m-0 mt-1.5 text-[13px] text-nevo-navy">
                    {removeRefused.why}
                  </p>
                ) : removeFailed === c.id ? (
                  <p className="m-0 mt-1.5 text-[13px] text-nevo-navy">
                    That didn&rsquo;t remove them, and nothing has changed. Try again in a moment.
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <button
                  type="button"
                  onClick={() => setSheet(c)}
                  className="cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(c)}
                  disabled={removing !== null}
                  className="cursor-pointer text-[13.5px] font-semibold text-nevo-near-black/55 hover:text-nevo-navy disabled:cursor-default"
                >
                  {removing === c.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      {!failed && contacts !== null && contacts.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={() => setSheet("new")}
            className="cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
          >
            Add a contact
          </button>
          <p className="m-0 text-[13px] text-nevo-near-black/55">
            Someone needs to receive your invoices.
          </p>
        </div>
      ) : null}

      {sheet !== null ? (
        <BillingContactSheet
          contact={sheet === "new" ? null : sheet}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            reread();
          }}
        />
      ) : null}
    </>
  );
}
