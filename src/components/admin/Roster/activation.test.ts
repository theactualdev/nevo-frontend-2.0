import { describe, expect, it } from "vitest";
import type { OnboardingState } from "@/lib/api/onboarding";
import { billingCurrency, mayActivate, screenFor } from "./activation";

/**
 * D24's pay-and-activate half, and the two places a console would be tempted
 * to decide something the server already decided.
 */

const state = (over: Partial<OnboardingState> = {}): OnboardingState => ({
  stage: "confirmed",
  classes: [],
  teacherCount: 0,
  studentCount: 0,
  rejected: [],
  invoiceId: null,
  amountDue: null,
  currency: null,
  periodLabel: null,
  canConfirm: false,
  canPay: false,
  canActivate: false,
  inOnboarding: false,
  ...over,
});

describe("screenFor", () => {
  it("maps every stage the enum has", () => {
    // Four members, four screens. A default branch would hide a fifth.
    expect(screenFor("uploading")).toBe("roster");
    expect(screenFor("confirmed")).toBe("cost");
    expect(screenFor("awaiting_payment")).toBe("waiting");
    expect(screenFor("activated")).toBe("active");
  });
});

describe("mayActivate", () => {
  it("does not offer activation to a school still waiting on a transfer", () => {
    /*
     * The one a derived version gets wrong. `stage === "awaiting_payment"`
     * would show "switch your school on" to every school that has not paid.
     */
    expect(mayActivate(state({ stage: "awaiting_payment", canActivate: false }))).toBe(
      false,
    );
    expect(mayActivate(state({ stage: "awaiting_payment", canActivate: true }))).toBe(
      true,
    );
  });

  it("answers no for a state it has not read", () => {
    expect(mayActivate(null)).toBe(false);
  });
});

describe("billingCurrency", () => {
  it("passes through the three the formatter knows", () => {
    expect(billingCurrency("NGN")).toBe("NGN");
    expect(billingCurrency("USD")).toBe("USD");
    expect(billingCurrency("GBP")).toBe("GBP");
  });

  it("refuses anything else rather than letting it reach the formatter", () => {
    /*
     * A cast would put the wrong symbol in front of a school's total, and the
     * wrong symbol on an invoice is worse than no symbol. `OnboardingState`
     * types currency as a bare string on this route, so it really can be
     * something unrecognised.
     */
    expect(billingCurrency("EUR")).toBeNull();
    expect(billingCurrency("")).toBeNull();
    expect(billingCurrency(null)).toBeNull();
    expect(billingCurrency(undefined)).toBeNull();
  });
});
