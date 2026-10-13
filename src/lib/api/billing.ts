import { api } from "./client";
import { isOwnApiHost } from "./upstream";

/**
 * Billing reads and the one write we can honestly make.
 *
 * NINE operations are deployed; this file types the four the screen can use,
 * and deliberately leaves the rest alone. What is missing is not plumbing:
 *
 * - THE PRICING DISPUTE IS SETTLED (7 Sep). `pricingModel` is a CONST
 *   `"per_student"` in the contract itself, and the read now carries
 *   `activeStudentCount`, `perStudentAnnualRate` and `currency` - so the cost
 *   sheet is computed from the same numbers the school is billed on. The old
 *   `subscriptionTier` / `studentCountBand` / `contractValue` fields are still
 *   returned and still not displayed: they are SCRUM-98's model, which D11
 *   superseded.
 * - `PUT /billing/payment-method` takes `card` or `direct_debit`. D11 says
 *   "no cards, no in-app checkout".
 * - `POST /billing/payments/checkout` returns a Paystack `authorizationUrl` -
 *   a hosted gateway checkout, which is the thing D11 forbids.
 * - `POST /billing/payments/{reference}/verify` is a WRITE, not a lookup:
 *   backend's own words are that it asks Paystack about a transaction and
 *   settles the invoice off the answer, so a bank reference 404s there. A
 *   school's transfer is reported through `reportTransfer` below instead.
 * - D11's "How to pay" panel needs Nevo's own bank account. When this was
 *   written nothing in the spec carried one, and the panel was absent rather
 *   than hard-coding the frame's literal account; it is live now - see below.
 *
 * THE RECEIVING ACCOUNT IS REAL NOW (8 Sep). `GET /billing/bank-transfer-details`
 * is deployed and serves `{bankName, accountNumber, accountName, currency}`,
 * all required. The seam pointed at `/billing/receiving-account`, a path the
 * spec has never had, so every school was told transfer details were "not
 * available here yet" while the account sat live on the API - and bank transfer
 * is the ONLY payment route this console offers, cards and checkout being
 * deliberately absent.
 *
 * The four values are bound, never literals. D11c's frame fills them in with
 * Kuda Bank and an account number - those are the frame's illustration, and an
 * unsourced payable account in frontend source sends real money to the wrong
 * place the day it goes stale.
 */

export type InvoiceStatus = "paid" | "pending" | "overdue";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  issuedAt: string;
  /** A decimal STRING from the API - never parsed into a float for display. */
  amount: string;
  status: InvoiceStatus;
  dueAt: string;
  paidAt: string | null;
  pdfUrl: string;
  /**
   * REQUIRED IN THE CONTRACT, and it was being discarded while the screen
   * printed a naira sign on every invoice in the list. A school billed in
   * dollars read its own invoice history in the wrong currency.
   */
  currency: PricingCurrency;
  /** "Michaelmas 2026", when the backend has one. */
  periodLabel: string | null;
  studentCount: number | null;
  perStudentRate: string | null;
  totalBeforeVat: string | null;
  vatAmount: string | null;
  /**
   * The percentage THIS invoice's VAT was charged at - stored per invoice now
   * rather than assumed, so the VAT line has a rate to label itself with.
   *
   * NULLABLE AND OMISSIBLE, and both matter: invoices issued before the field
   * existed genuinely have no rate recorded. Backfilled at 7.50 where known.
   * An invoice without one shows its AMOUNT and no rate, rather than borrowing
   * today's - a historic invoice charged at a different rate would otherwise
   * be relabelled with a figure it was never charged at.
   */
  vatRate?: string | null;
}

export interface UpcomingCharge {
  invoiceId: string | null;
  invoiceNumber: string | null;
  dueAt: string | null;
  amount: string | null;
  status: InvoiceStatus | null;
  renewalBannerVisible: boolean;
  renewalMessage: string | null;
}

export interface BillingContact {
  id: string;
  email: string;
  phone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  country: string;
}

export interface BillingContactDraft {
  email: string;
  phone?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  region?: string | null;
  postalCode?: string | null;
  country: string;
}

/**
 * The subscription read. `subscriptionTier`, `studentCountBand` and
 * `contractValue` are typed because the endpoint returns them, and are NOT
 * rendered - see the note above.
 */
/** The three the backend will price in. Never assume naira. */
export type PricingCurrency = "USD" | "NGN" | "GBP";

/** How a school buys Nevo. Pricing is per student on both. */
export type PricingPlan = "annual" | "per_term";

/**
 * What the fee buys access to - and the schema's own description calls it "a
 * fact the cost sheet has to state": annual covers the calendar including
 * breaks, per-term covers only the school's own session.
 */
export type AccessWindow = "year_round" | "school_session";

/**
 * One of Nevo's published plans (`GET /api/billing/plan-options`, 8 Oct).
 * PUBLISHED rates, not this school's - a founding-partner school pays its own
 * rate, which the cost sheet shows. `switchMethod` is always
 * `relationship_manager`: there is no self-service switch, deliberately.
 */
export interface PlanOption {
  plan: PricingPlan;
  name: string;
  perStudentRate: string;
  billingPeriod: "year" | "term";
  accessWindow: AccessWindow;
  currency: PricingCurrency;
  switchMethod: string;
}

/** Which rate card a school is held to. */
export type RateType = "founding_partner" | "standard";

export type PaymentMethodType = "card" | "direct_debit";

/**
 * THE COST SHEET, AS THE BACKEND COMPUTES IT.
 *
 * ============================================================================
 * THIS WAS FLAT, AND THE FLAT SHAPE NO LONGER EXISTS.
 *
 * `Subscription` used to declare `pricingModel`, `activeStudentCount`,
 * `perStudentAnnualRate` and `currency` at the TOP LEVEL. The deployed contract
 * carries none of those names there: they live inside `pricing`, under
 * different names again (`studentCount`, `perStudentRate`). Every one of them
 * read `undefined` at runtime, so `computeCost` returned null and EVERY school
 * was shown "your per-student rate isn't set yet" on a screen whose entire job
 * is to say what they pay.
 *
 * Nothing caught it. `client.ts` ends in `as T`, which is an assertion the
 * compiler never checks; `npm run contract` did not compare the paths of READS
 * at all; and the one signal that did exist - "GET /billing/subscription →
 * pricing" in the advisory unread-field list - sat there being scrolled past.
 *
 * THE TOTALS ARE THE SERVER'S NOW. `totalBeforeVat`, `vatRate`, `vatAmount` and
 * `totalWithVat` all arrive computed. The client used to derive them itself in
 * integer minor units with a hard-coded Nigerian 7.5%, which was careful work
 * against the wrong authority: an invoice is a legal document and the number on
 * it is the backend's to state.
 * ============================================================================
 */
export interface Pricing {
  /** A const in the contract - the model is settled, not a variable. */
  pricingModel: "per_student";
  pricingPlan: PricingPlan;
  accessWindow: AccessWindow;
  /** What the school is billed ON. Not invited, not profiled. */
  studentCount: number;
  /** Decimal STRINGS, every one. Never parsed into a float for display. */
  perStudentRate: string;
  rateType: RateType;
  rateLockedUntil: string | null;
  totalBeforeVat: string;
  /**
   * A PERCENTAGE, not a fraction - settled 15 Sep and now documented in the
   * schema with an example. Nigeria's 7.5% arrives as "7.50": render it with a
   * per-cent sign and do not multiply.
   *
   * This carried a TODO(api) asking the question, twice, because "7.5" and
   * "0.075" are the same rate a hundredfold apart on screen and a wrong tax
   * rate on a school's invoice is not a rounding error. Rendered through
   * `formatVatRate`, which is the one place that knows.
   */
  vatRate: string;
  vatAmount: string;
  totalWithVat: string;
  currency: PricingCurrency;
}

/** Read, never rendered - D11 is explicit: "no cards, no in-app checkout." */
export interface PaymentMethod {
  id: string;
  methodType: PaymentMethodType;
  displayName: string;
  lastFour: string;
  cardBrand: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  bankName: string | null;
  accountHolderName: string | null;
  updatedAt: string;
}

export interface Subscription {
  schoolId: string;
  schoolName: string;
  contractStart: string | null;
  contractEnd: string | null;
  renewalBannerVisible: boolean;
  renewalMessage: string | null;
  billingContact: BillingContact | null;
  paymentMethod: PaymentMethod | null;
  pricing: Pricing;
}

/**
 * Where a school transfers to. Every field is required: a partial account is
 * worse than none, because an admin would transfer against it anyway.
 */
export interface ReceivingAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
  /**
   * The currency the ACCOUNT takes, which is not automatically the currency the
   * school is billed in. Telling a pound-billed school to transfer into a naira
   * account, or the reverse, is a real way to lose real money.
   */
  currency: PricingCurrency;
}

/**
 * Where to send one invoice's money, and the exact reference to quote on it
 * (`GET /billing/invoices/{id}/bank-transfer-details`). The backend's own
 * description of `reference`: "Write this invoice number as the bank-transfer
 * reference." Served for any unpaid invoice.
 */
export interface InvoiceTransferDetails extends ReceivingAccount {
  invoiceId: string;
  reference: string;
}

/**
 * A school saying "we've sent it" (`POST /billing/payments/transfer-report`).
 *
 * A CLAIM, NEVER A PAYMENT. The backend records it "without marking the
 * invoice paid": only Nevo finance, reading a bank statement, confirms a
 * transfer. So no answer to a report can settle an invoice, and none is a
 * failure - `awaiting_confirmation` and `confirmed` are both a report on file.
 *
 * THIS WAS `manual-transfer`, which is now "Confirm Manual Transfer": finance's
 * own write, behind an `X-Nevo-Finance-Key`, whose description says a transfer
 * is confirmed by "a person with the billing scope looking at a bank statement
 * - never the payer asserting it in the UI". The school's button was still
 * posting there.
 */
export interface TransferReport {
  transactionId: string;
  invoiceId: string;
  bankReference: string;
  status: "awaiting_confirmation" | "confirmed";
  message: string;
}

/**
 * The path to fetch an invoice PDF through the proxy, from whatever the API put
 * in `pdfUrl`.
 *
 * The contract types it as a bare `string` with no format, so it may arrive
 * absolute or relative. An absolute backend URL is reduced to its path because
 * the browser cannot call the backend directly at all - there are no CORS
 * headers, which is why `BASE_URL` is a same-origin proxy. Anything pointing at
 * a genuinely different host (a pre-signed object-store link, say) is left
 * alone and returns null, so the caller can simply follow it.
 */
export function invoicePdfPath(pdfUrl: string): string | null {
  if (pdfUrl.startsWith("/")) return pdfUrl;
  let url: URL;
  try {
    url = new URL(pdfUrl);
  } catch {
    return null;
  }
  // Our own API, however it is addressed. Everything else is someone else's.
  // This matched nevolearning.com only, so once the backend moved hosts every
  // invoice PDF it served would have been treated as a stranger's link.
  return isOwnApiHost(url.hostname) ? `${url.pathname}${url.search}` : null;
}

/**
 * A `pdfUrl` that is someone else's link - a pre-signed object-store URL, say -
 * and so can be followed as a plain link. Null for anything that is not an
 * absolute http(s) URL: an empty string, a malformed value. Those are no
 * document at all, and a plain `<a href="">` to one reloads the page.
 */
export function externalPdfUrl(pdfUrl: string): string | null {
  try {
    const url = new URL(pdfUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export const billingApi = {
  /**
   * GET /api/billing/bank-transfer-details - the real path, at last.
   *
   * IT WAS `/api/billing/receiving-account`, WHICH NEVER EXISTED. That was a
   * deliberate seam typed to the shape D11c needs while Teslim built the
   * endpoint, on the understanding that whoever noticed it land would repoint
   * it. Nobody noticed, because nothing was watching: `npm run contract` only
   * compared the paths of WRITES, so a read aimed at a path the spec has never
   * had passed the gate in silence. The gate checks every verb now.
   *
   * Still resolves to null on an incomplete account rather than rendering a
   * partial one, for the reason on the interface above.
   */
  /** GET /api/billing/plan-options - D11d's two plans, at published rates. */
  planOptions: () => api.get<PlanOption[]>("/api/billing/plan-options"),

  receivingAccount: () =>
    api
      .get<Partial<ReceivingAccount>>("/api/billing/bank-transfer-details")
      .then((a) =>
        a && a.bankName && a.accountNumber && a.accountName && a.currency
          ? ({
              bankName: a.bankName,
              accountNumber: a.accountNumber,
              accountName: a.accountName,
              currency: a.currency,
            } satisfies ReceivingAccount)
          : null,
      ),
  subscription: () => api.get<Subscription>("/api/billing/subscription"),
  invoices: () => api.get<Invoice[]>("/api/billing/invoices"),
  upcoming: () => api.get<UpcomingCharge>("/api/billing/upcoming"),
  updateContact: (draft: BillingContactDraft) =>
    api.put<BillingContact>("/api/billing/billing-contact", draft),
  /**
   * One invoice's account and reference. Null on an incomplete answer, for the
   * reason on `ReceivingAccount`: a partial account is worse than none.
   */
  invoiceTransferDetails: (invoiceId: string) =>
    api
      .get<Partial<InvoiceTransferDetails>>(
        `/api/billing/invoices/${encodeURIComponent(invoiceId)}/bank-transfer-details`,
      )
      .then((d) =>
        d &&
        d.bankName &&
        d.accountNumber &&
        d.accountName &&
        d.currency &&
        d.reference
          ? ({
              bankName: d.bankName,
              accountNumber: d.accountNumber,
              accountName: d.accountName,
              currency: d.currency,
              invoiceId: d.invoiceId ?? invoiceId,
              reference: d.reference,
            } satisfies InvoiceTransferDetails)
          : null,
      ),
  /** Tell Nevo finance a transfer is on its way. See `TransferReport`. */
  reportTransfer: (invoiceId: string, bankReference: string) =>
    api.post<TransferReport>("/api/billing/payments/transfer-report", {
      invoiceId,
      bankReference,
    }),
  /**
   * Every transfer this school has reported. What makes "Pending
   * verification" survive a reload: it used to live in page state only, so
   * the invoice forgot the school had told us the moment they left.
   */
  transferReports: () =>
    api.get<TransferReport[]>("/api/billing/payments/transfer-reports"),

  /** The invoice PDF itself, with the Bearer token a plain link cannot send. */
  invoicePdf: (path: string) => api.blob(path),
};

/**
 * Each invoice's most recent report. The list arrives newest first, so the
 * first one seen for an invoice is the one that stands.
 */
export function latestReportByInvoice(
  rows: TransferReport[],
): Record<string, TransferReport> {
  const out: Record<string, TransferReport> = {};
  for (const r of rows) if (r.invoiceId && !out[r.invoiceId]) out[r.invoiceId] = r;
  return out;
}

/** The API's own bounds on `bankReference`. */
export const BANK_REF_MIN = 3;
export const BANK_REF_MAX = 120;
