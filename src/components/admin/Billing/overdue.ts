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
 * So the row line says the invoice is past its due date and that nothing has
 * changed for the children, and stops.
 *
 * NO NUMBER IS WORKED OUT HERE (architecture rule 3; Lydia's L1, 14 Oct; the
 * 2 Nov audit). This used to count the days past due from `dueAt` and this
 * device's clock, gate a page panel on its own 60-day threshold, and add the
 * overdue invoices into a total. All three are the backend's to give:
 * `InvoiceResponse` carries no day count, no outstanding total and no panel
 * flag, so the line says what the server's `overdue` status does, and the
 * page-level panel waits for those fields (asked). Paying needs no panel:
 * How to pay carries the bank details for an owed invoice.
 *
 * A SETTLED INVOICE LEAVES NO RESIDUE: "Row returns to Paid with no residue:
 * no 'was late' marker, ever."
 */

/** The row's own line, on the server's `overdue` status. Never a consequence. */
export const OVERDUE_LINE =
  "Past its due date. Nothing has changed for your students.";
