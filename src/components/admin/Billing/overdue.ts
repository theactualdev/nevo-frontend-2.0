import type { Invoice } from "@/lib/api/billing";

/**
 * D11.8 "Overdue, calmly" - the state SCRUM-98 says most products get wrong.
 *
 * Every sentence here is said to a school that owes money, and the spec's
 * constraints on it are absolute rather than stylistic:
 *
 *   "No red, no warning glyph, no 'account at risk', no countdown to
 *    suspension, and no automated dunning tone."
 *
 *   "Access is never a lever - permanent. Non-payment never affects a
 *    student's or a teacher's access."
 *
 * So the row line says how long it has been and that nothing has changed for
 * the children, and stops.
 *
 * NO NUMBER IS WORKED OUT HERE (architecture rule 3; Lydia's L1, 14 Oct; the
 * 2 Nov audit). This once counted the days past due from `dueAt` and this
 * device's clock, gated a page panel on its own 60-day threshold, and added
 * the overdue invoices into a total. Since Teslim's 4 Nov change the invoice
 * read carries all of it - `daysOverdue` per invoice, and `outstandingCount`,
 * `outstandingTotal` and `overduePanelApplies` for the school - so these
 * functions only put the server's figures into words. WHEN the panel shows is
 * the server's rule too (an unpaid invoice past its due date), not the
 * 60 days SCRUM-98 drew.
 *
 * A SETTLED INVOICE LEAVES NO RESIDUE: "Row returns to Paid with no residue:
 * no 'was late' marker, ever."
 */

/** The row's line when the server gives no day count. Never a consequence. */
export const OVERDUE_LINE =
  "Past its due date. Nothing has changed for your students.";

/**
 * The row's own line, with the server's day count when it gives one. "0 days
 * past its due date" is not a sentence anyone should read, so a count under
 * one is the plain line.
 */
export function overdueLine(daysOverdue: number | undefined): string {
  return typeof daysOverdue === "number" && daysOverdue >= 1
    ? `${daysOverdue} ${daysOverdue === 1 ? "day" : "days"} past its due date. Nothing has changed for your students.`
    : OVERDUE_LINE;
}

export interface OverduePanel {
  /** The server's count of unpaid invoices. */
  count: number;
  /** The server's total of them, a decimal string. */
  total: string;
  /** The one unpaid invoice, when there is exactly one and it is listed. */
  only: Invoice | null;
}

/**
 * The page-level panel, or null - on the server's `overduePanelApplies`,
 * which is the same on every row. Several unpaid invoices aggregate into ONE
 * panel with the server's count and total (SCRUM-98: "rather than repeating
 * the panel per invoice").
 */
export function overduePanel(invoices: Invoice[] | null): OverduePanel | null {
  const first = invoices?.[0];
  if (!first?.overduePanelApplies) return null;
  const count = first.outstandingCount ?? 0;
  if (count < 1 || !first.outstandingTotal) return null;
  const unpaid = (invoices ?? []).filter((i) => i.status !== "paid");
  return {
    count,
    total: first.outstandingTotal,
    only: count === 1 && unpaid.length === 1 ? unpaid[0] : null,
  };
}

/**
 * The panel's opening sentence, in SCRUM-98's two forms. `money` is injected
 * so the panel cannot disagree with the rows above it about how a figure is
 * written.
 */
export function overdueHeadline(
  panel: OverduePanel,
  money: (amount: string) => string,
  issuedOn: (iso: string) => string,
): string {
  if (panel.only) {
    return `${money(panel.only.amount)} is outstanding from ${panel.only.invoiceNumber}, issued ${issuedOn(panel.only.issuedAt)}.`;
  }
  if (panel.count === 1) return `${money(panel.total)} is outstanding.`;
  return `${panel.count} invoices are outstanding, totalling ${money(panel.total)}.`;
}
