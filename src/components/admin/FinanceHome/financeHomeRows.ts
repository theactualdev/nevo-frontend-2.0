import type {
  Invoice,
  Subscription,
  UpcomingCharge,
} from "@/lib/api/billing";
import { formatMoney } from "@/lib/money";
import { longDate } from "@/lib/dates";

/**
 * What the finance home puts under "Worth a glance".
 *
 * Pure, because every row here is a statement about a school's money and the
 * rules are easier to test than to eyeball. Two in particular:
 *
 *  - A ROW WHOSE FIELD IS NULL DOES NOT RENDER. `UpcomingCharge` has FIVE
 *    nullable fields including `dueAt` and `amount`, and `Subscription`'s
 *    `paymentMethod` and `rateLockedUntil` are nullable too. An invoice row
 *    reading "due null" or a lock reading "until Invalid Date" is worse than an
 *    absent row on this screen of all screens.
 *  - NOTHING HERE CLAIMS A PAYMENT STATUS THE READ DID NOT ESTABLISH. Whether
 *    anything is overdue comes from the invoice list, and if that list did not
 *    answer, the screen says so rather than implying all is well.
 */

export type RowKind = "soft" | "neutral";

export interface MoneyRow {
  key: string;
  kind: RowKind;
  title: string;
  sub: string;
  action: string;
  href: string;
}

const BILLING = "/admin/billing";

/** Invoices the school still owes, or null when the list did not answer. */
export function overdueCount(invoices: Invoice[] | null): number | null {
  if (!invoices) return null;
  return invoices.filter((i) => i.status === "overdue").length;
}


export function financeHomeRows(
  subscription: Subscription | null,
  upcoming: UpcomingCharge | null,
  invoices: Invoice[] | null,
): MoneyRow[] {
  const rows: MoneyRow[] = [];
  if (!subscription) return rows;

  const overdue = overdueCount(invoices);
  if (overdue && overdue > 0) {
    rows.push({
      key: "overdue",
      // Soft violet, never red. Overdue billing never gates access and the
      // colour must not imply that it does.
      kind: "soft",
      title:
        overdue === 1
          ? "One invoice hasn't been settled yet"
          : `${overdue} invoices haven't been settled yet`,
      sub: "Your school keeps full access either way. Billing has the details.",
      action: "View in Billing",
      href: BILLING,
    });
  }

  // Both halves are nullable and the row needs both to say anything useful.
  const due = longDate(upcoming?.dueAt);
  if (due && upcoming?.amount) {
    const label = upcoming.invoiceNumber ? `Invoice ${upcoming.invoiceNumber}` : "Your next invoice";
    rows.push({
      key: "upcoming",
      kind: "neutral",
      // "is due", never "issues on": `UpcomingCharge` carries a due date and no
      // issue date, and the frame's "issues on" would name a different event.
      title: `${label} is due ${due}`,
      // No email promised (Lydia, 7 Oct): nothing is sent when a transfer clears.
      sub: `${formatMoney(upcoming.amount, subscription.pricing.currency)}. Your billing page updates once a transfer clears.`,
      action: "View in Billing",
      href: BILLING,
    });
  }

  /*
   * NO PAYMENT METHOD ROW. There was one, and it was a design-law breach I
   * introduced: it rendered the brand and last four of a saved card with a
   * "Manage" route. SCRUM-98 and D11 are explicit - "no cards, no in-app
   * checkout" - and `PaymentMethod` in `lib/api/billing.ts` is annotated
   * "Read, never rendered" on the very type I read it from.
   *
   * Nevo is not a card-on-file product: schools pay by transfer and the
   * arrangement, not the instrument, is what a finance administrator needs to
   * see. If a payment surface is wanted here it is the arrangement - who
   * confirms it and how - and that is design's to draw.
   */

  const locked = longDate(subscription.pricing.rateLockedUntil);
  if (locked) {
    rows.push({
      key: "rate-lock",
      kind: "neutral",
      title:
        subscription.pricing.rateType === "founding_partner"
          ? `Your founding-partner rate is held until ${locked}`
          : `Your rate is held until ${locked}`,
      /*
       * "THE FULL SCHEDULE IS IN BILLING" WAS A PROMISE BILLING CANNOT KEEP.
       *
       * SCRUM-98's D11.3 draws a six-year rate table off `GET rate_schedule`,
       * and no such endpoint is deployed - "schedule" does not appear in
       * `lib/api/billing.ts` at all. What Billing actually holds is the
       * `CostSheet`: this year's per-student rate, VAT and total, with the
       * lock date. So the row names that instead of sending a finance
       * administrator to look for a table that is not there.
       *
       * TODO(api): the rate schedule itself. Until it exists there is nothing
       * to link to, and a row promising one is worse than a row that does not.
       */
      sub: `${formatMoney(subscription.pricing.perStudentRate, subscription.pricing.currency)} per student. Billing shows this year's cost in full.`,
      action: "See the breakdown",
      href: BILLING,
    });
  }

  return rows;
}
