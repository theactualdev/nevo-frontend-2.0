import type { PricingCurrency } from "@/lib/api/billing";
import type { OnboardingStage, OnboardingState } from "@/lib/api/onboarding";

/**
 * Which of D24's pay-and-activate screens a school is on.
 *
 * DRIVEN BY `stage`, NEVER BY WHAT HAPPENS TO BE LOADED. Backend's own note on
 * the enum: *"The order is the ruling: upload, derive, confirm, pay, activate.
 * A stage is typed so the server decides which step a school is on, rather
 * than a console inferring it from which arrays happen to be empty."*
 *
 * So this is a mapping, not a decision. It exists to keep the mapping in one
 * testable place rather than as four conditions inside a render.
 */
export type ActivationScreen =
  /** OB-03 - headcount and cost, with a way to pay. */
  | "cost"
  /** OB-04 - the transfer is out there somewhere. */
  | "waiting"
  /** OB-05 - switched on. */
  | "active"
  /** Nothing confirmed yet: the roster screens own this school. */
  | "roster";

export function screenFor(stage: OnboardingStage): ActivationScreen {
  switch (stage) {
    case "uploading":
      return "roster";
    case "confirmed":
      return "cost";
    case "awaiting_payment":
      return "waiting";
    case "activated":
      return "active";
  }
}

/**
 * Whether the school may press activate.
 *
 * READ, NOT DERIVED - `canActivate` is the server's, like its two siblings.
 * OB-05's own caption says activation follows payment clearing, so a console
 * deriving this from `stage === "awaiting_payment"` would offer the button to
 * every school still waiting on a transfer.
 */
export function mayActivate(state: OnboardingState | null): boolean {
  return state?.canActivate === true;
}

/**
 * `OnboardingState.currency` narrowed to a currency the money formatter knows.
 *
 * The contract types it as a bare `string | null` on this route while billing
 * types the same idea as a three-member enum. A CAST WOULD BE A LIE: an
 * unrecognised code would reach `formatMoney`, which would render a total with
 * the wrong symbol in front of it - and the wrong symbol on a school's invoice
 * is worse than no symbol.
 *
 * Null for anything unrecognised, so the caller falls back rather than guesses.
 */
export function billingCurrency(
  currency: string | null | undefined,
): PricingCurrency | null {
  return currency === "NGN" || currency === "USD" || currency === "GBP"
    ? currency
    : null;
}
