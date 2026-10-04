import { api } from "./client";

/**
 * D24 Getting to Active - where a school is between registering and paying.
 *
 * NONE OF THIS WAS CALLED UNTIL 23 SEP. Six endpoints were deployed and the
 * whole flow was unbuilt.
 *
 * ~~The rest - imports, class corrections, confirm, activate, additions/quote
 * - are still unbuilt.~~ That line went stale within a day and stayed wrong
 * for two, which is the decay this codebase keeps finding in other people's
 * files. As of 25 Sep all six are called EXCEPT one, and that one on purpose:
 *
 *  - `PATCH /onboarding/classes` (class corrections) is typed and deliberately
 *    unused. D24 routes every correction back through the spreadsheet - the
 *    server names what is wrong with each row and the school fixes it in
 *    Excel and re-uploads - so an in-app rename/drop would be a second route
 *    the frame chose not to have. Raised with design, not built.
 */

/**
 * Where a school is, AS THE SERVER SEES IT. Backend's own description says why
 * it is an enum rather than something we work out:
 *
 *   *"The order is the ruling: upload, derive, confirm, pay, activate. A stage
 *   is typed so the server decides which step a school is on, rather than a
 *   console inferring it from which arrays happen to be empty."*
 *
 * So: read `stage`. Never compose it out of `studentCount > 0 && invoiceId`.
 */
export type OnboardingStage =
  | "uploading"
  | "confirmed"
  | "awaiting_payment"
  | "activated";

/**
 * A class Nevo found in the file, with what it found in it.
 *
 * **BOTH SHAPES BELOW WERE GUESSED WHEN THIS FILE WAS WRITTEN, AND BOTH WERE
 * WRONG.** `DerivedClass` was declared as `{name, studentCount}` and
 * `RejectedRow` as `{row, value, reason}` - neither read from the document,
 * because at the time nothing rendered them and the guess cost nothing.
 *
 * It would have cost something the moment it did: `row` is `rowNumber` on the
 * wire, so the screen that exists to tell a school WHICH LINE to fix would
 * have printed "Row undefined" on every one.
 *
 * `normalisedName` is what `PATCH /onboarding/classes` corrects against -
 * corrections are keyed on it, not on `name`.
 */
export interface DerivedClass {
  name: string;
  normalisedName: string;
  yearGroup: string | null;
  section: string | null;
  studentCount: number;
  teacherCount: number;
  /** Already created. Optional in the schema with a default of false. */
  committed?: boolean;
}

/** Why one line of the file cannot be used, in terms of that line. */
export interface RejectedRow {
  rowNumber: number;
  field: string;
  value: string;
  reason: string;
}

/** Rename a derived class, or drop it before anything is created. */
export interface ClassCorrection {
  normalisedName: string;
  renameTo?: string | null;
  drop?: boolean | null;
}

/**
 * `OnboardingState`, described by backend as *"Everything the onboarding
 * screens render, in one read."*
 *
 * The three `can*` booleans are the server's permission to take the next step
 * and default to false. They are read, not derived - the same rule as `stage`.
 *
 * `amountDue` is a STRING. The schema types it as a decimal-patterned string
 * rather than a number, which is correct for money and wrong to coerce: a
 * naira total for four hundred students does not survive a round trip through
 * a float. It is rendered, never arithmetic'd.
 */
export interface OnboardingState {
  stage: OnboardingStage;
  classes: DerivedClass[];
  teacherCount: number;
  studentCount: number;
  rejected: RejectedRow[];
  invoiceId: string | null;
  amountDue: string | null;
  currency: string | null;
  periodLabel: string | null;
  canConfirm: boolean;
  canPay: boolean;
  canActivate: boolean;
  /**
   * WHETHER THIS SCHOOL IS IN THE FUNNEL AT ALL, and the field to branch on.
   *
   * Backend added it on 24 Sep after finding something worse than the gap it
   * fills: this read SHARED A HELPER WITH THE WRITE ROUTES, and that helper
   * CREATES a record when it finds none. So the first admin page load at any
   * school predating the funnel wrote a row saying that school was back at the
   * uploading stage - **a read that changed the answer to itself**.
   *
   * Our gate then read that stage and held the school's console read-only, on
   * the strength of its own page load. The read only looks now, and this
   * boolean is what says whether the funnel applies.
   *
   * NOT `required`, with a default of false. Absent means false means "not in
   * onboarding", which is the safe direction: a school we cannot place is left
   * alone rather than paused.
   */
  inOnboarding: boolean;
}

/**
 * What adding people mid-term costs. `POST /onboarding/additions/quote`
 *
 * **ADVISORY. IT QUOTES AND CHARGES NOTHING, AND NEITHER DOES ANYTHING ELSE.**
 * Enrolling a student has no billing side effect; the addition reaches the
 * school as a bigger next invoice, because the invoice run prices the term off
 * whoever is active when it runs. `billed` is a constant - `"next_invoice"` -
 * added on 25 Sep precisely so a screen cannot quietly assume otherwise.
 *
 * **NOT PRORATED.** It is the full per-student rate for a whole term, not the
 * remainder of this one. So a figure here is never "what this child costs for
 * the weeks left".
 *
 * THE VAT SPLIT IS THE SERVER'S. `totalBeforeVat`, `vatRate`, `vatAmount` and
 * `totalWithVat` come from the same pricing function as `PricingResponse`,
 * already rounded. `vatRate` is a PERCENTAGE - 7.5% arrives as "7.50" - so it
 * is rendered with a per-cent sign and never multiplied by 100. `amount` stays
 * and equals `totalWithVat`; prefer the named fields.
 *
 * `appliesTo` is the term, spelt the way `academic_session()` spells it
 * everywhere - "Term 2 · 2026/2027", year in full. **NULL when the school has
 * not configured its term dates**, and then nothing is printed: an invented
 * term on a price is worse than none.
 */
export interface AdditionQuote {
  students: number;
  teachers: number;
  perStudentRate: string;
  amount: string;
  totalBeforeVat: string;
  vatRate: string;
  vatAmount: string;
  totalWithVat: string;
  currency: string;
  appliesTo: string | null;
  billed: "next_invoice";
  message: string;
}

export const onboardingApi = {
  /**
   * Quote an addition. Advisory - see `AdditionQuote`. A teacher costs
   * nothing, which the quote says rather than the screen assuming it.
   */
  quoteAddition: (counts: { students?: number; teachers?: number }) =>
    api.post<AdditionQuote>("/api/v1/onboarding/additions/quote", counts),

  /** GET /api/v1/onboarding - the whole resumable state in one read. */
  get: () => api.get<OnboardingState>("/api/v1/onboarding"),

  /**
   * Stage one file. POST /api/v1/onboarding/imports, multipart.
   *
   * ONE FILE PER CALL, and `kind` says which. OB-01 takes staff and students
   * as two independent uploads in any order - *"whichever arrives first sets
   * the class list"* - so this is deliberately not a two-file call.
   *
   * It returns the whole `OnboardingState`, which is what makes the screen
   * resumable: every upload re-answers where the school is, so nothing has to
   * be remembered between them.
   */
  stageImport: (kind: "teacher" | "student", file: File) => {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", file);
    return api.post<OnboardingState>("/api/v1/onboarding/imports", form);
  },

  /**
   * The file a school fills in. GET /api/v1/onboarding/templates/{template}
   *
   * Kept as bytes: it is a CSV the school saves, with a BOM so Excel reads
   * Nigerian names as written, and an example row in the school's own class
   * names. Its header row is generated from the same columns the parser
   * checks, so the console holds no column list of its own - a copy here is
   * how a school once downloaded a file its own upload rejected.
   */
  template: (name: "students" | "teachers") =>
    api.blob(`/api/v1/onboarding/templates/${name}`),

  /**
   * Correct what was derived, before anything is created.
   * PATCH /api/v1/onboarding/classes
   *
   * Keyed on `normalisedName`, not the display name.
   */
  correctClasses: (corrections: ClassCorrection[]) =>
    api.patch<OnboardingState>("/api/v1/onboarding/classes", { corrections }),

  /**
   * Switch the school on. POST /api/v1/onboarding/activate
   *
   * Gated by `canActivate`, which the server owns. OB-05's caption says
   * activation follows payment clearing, so a console deriving the offer from
   * the stage alone would show it to every school still waiting on a transfer.
   */
  activate: () => api.post<OnboardingState>("/api/v1/onboarding/activate"),

  /**
   * Create everything that read cleanly. POST /api/v1/onboarding/confirm
   *
   * No body. The server already holds the staged import; sending it back would
   * be the console asserting what it thinks was staged.
   */
  confirm: () => api.post<OnboardingState>("/api/v1/onboarding/confirm"),
};
