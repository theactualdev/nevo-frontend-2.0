import { api } from "./client";

/**
 * D24 Getting to Active - where a school is between registering and paying.
 *
 * NONE OF THIS WAS CALLED UNTIL 23 SEP. Six endpoints were deployed and the
 * whole flow was unbuilt; this is the first of them to be read. The rest -
 * imports, class corrections, confirm, activate, additions/quote - are still
 * unbuilt and are sized in docs/BUILD_STATUS.md.
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
}

export const onboardingApi = {
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
