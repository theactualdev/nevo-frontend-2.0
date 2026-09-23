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

/** One class Nevo read out of an uploaded roster, before anything is created. */
export interface DerivedClass {
  name: string;
  studentCount: number;
}

/** One row an import could not use, with enough to fix it. */
export interface RejectedRow {
  row: number;
  value: string;
  reason: string;
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
};
