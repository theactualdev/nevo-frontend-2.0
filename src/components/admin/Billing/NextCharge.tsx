import type { Invoice, UpcomingCharge } from "@/lib/api/billing";
import { longDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { PricingCurrency } from "@/lib/api/billing";

/**
 * L1, Lydia's 14 Oct copy for the Next charge card.
 *
 *   ₦150,500 on 15 January 2027
 *   Covers First term 2026/27 · 1 student · includes ₦10,500 VAT
 *
 * And overdue, under an "Overdue" heading:
 *
 *   ₦150,500 was due on 15 January 2027, 6 days ago
 *   Covers First term 2026/27 · 1 student · includes ₦10,500 VAT
 *   Your students' lessons carry on as normal.
 *
 * The last line is not optional: the platform is never a lever, and a school
 * that is late is told plainly that nothing has been withheld from a child.
 * Nothing red, no warning icon - a fact about a date. The day count is the
 * server's `daysOverdue`; nothing here counts days.
 *
 * Each part of the "Covers" line shows only when something carries it: the
 * period from the invoice, the students and VAT from the charge's recorded
 * lines (14 Oct), else from the invoice. A legacy charge with no breakdown
 * gets no invented student count or VAT split.
 */

export interface NextChargeCopy {
  amount: string;
  /** What follows the amount: " on 15 January 2027", " was due on …, 6 days ago". */
  when: string;
  covers: string | null;
  overdue: boolean;
}

export function nextChargeCopy(
  upcoming: UpcomingCharge,
  invoice: Invoice | null,
  currency: PricingCurrency,
): NextChargeCopy {
  const money = (v: string) => formatMoney(v, currency);
  const overdue = upcoming.status === "overdue";
  const date = longDate(upcoming.dueAt);
  const days = upcoming.daysOverdue;
  const ago = days ? `, ${days} ${days === 1 ? "day" : "days"} ago` : "";
  const when = date ? (overdue ? ` was due on ${date}${ago}` : ` on ${date}`) : "";

  const lines = upcoming.lineItems ?? [];
  const subscription = lines.find((l) => l.kind === "subscription");
  const vatLine = lines.find((l) => l.kind === "vat");
  const students =
    typeof subscription?.quantity === "number" ? subscription.quantity : (invoice?.studentCount ?? null);
  const vat = vatLine?.amount ?? invoice?.vatAmount ?? null;
  const parts = [
    invoice?.periodLabel ? `Covers ${invoice.periodLabel}` : null,
    students != null ? `${students} ${students === 1 ? "student" : "students"}` : null,
    vat ? `includes ${money(vat)} VAT` : null,
  ].filter(Boolean);

  return {
    amount: money(upcoming.amount ?? "0"),
    when,
    covers: parts.length ? parts.join(" · ") : null,
    overdue,
  };
}

export function NextCharge({
  upcoming,
  invoice,
  currency,
}: {
  upcoming: UpcomingCharge;
  invoice: Invoice | null;
  currency: PricingCurrency;
}) {
  const copy = nextChargeCopy(upcoming, invoice, currency);
  return (
    <div>
      <p className="m-0 text-[15px] text-nevo-near-black/78">
        <span className="text-[30px] leading-none font-semibold text-nevo-near-black tabular-nums">
          {copy.amount}
        </span>
        {copy.when}
      </p>
      {copy.covers ? (
        <p className="m-0 mt-2 text-[13.5px] text-nevo-near-black/62">{copy.covers}</p>
      ) : null}
      {copy.overdue ? (
        <p className="m-0 mt-3 text-[14px] leading-[1.5] text-nevo-near-black/78">
          Your students&rsquo; lessons carry on as normal.
        </p>
      ) : null}
    </div>
  );
}
