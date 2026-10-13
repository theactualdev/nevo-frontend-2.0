import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Pricing } from "@/lib/api/billing";
import { FinanceHomeView } from "./FinanceHomeView";

/**
 * Finance home led with `totalWithVat` and said nothing about VAT, beside
 * "Billed on 340 students at ₦150,000 each" - a sum that does not come out,
 * because the per-student rate is before VAT. The figure now says it includes
 * VAT, at the server's rate, and the rate line says it is before VAT.
 */

let pricing: Partial<Pricing> = {};

vi.mock("@/lib/api/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/billing")>();
  return {
    ...actual,
    billingApi: {
      ...actual.billingApi,
      subscription: async () => ({
        schoolId: "sch1",
        schoolName: "Brightgate Academy",
        contractStart: null,
        contractEnd: null,
        renewalBannerVisible: false,
        renewalMessage: null,
        billingContact: null,
        paymentMethod: null,
        pricing: {
          pricingModel: "per_student",
          pricingPlan: "annual",
          accessWindow: "school_session",
          studentCount: 340,
          perStudentRate: "150000.00",
          rateType: "standard",
          rateLockedUntil: null,
          totalBeforeVat: "51000000.00",
          vatRate: "7.50",
          vatAmount: "3825000.00",
          totalWithVat: "54825000.00",
          currency: "NGN",
          ...pricing,
        },
      }),
      upcoming: async () => null,
      invoices: async () => [],
    },
  };
});

beforeEach(() => {
  pricing = {};
});

describe("Finance home's headline figure", () => {
  it("says it includes VAT, at the rate the server sent", async () => {
    const { container } = render(<FinanceHomeView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/₦54,825,000/));
    const text = visibleText(container);
    expect(text).toMatch(/incl\. VAT at 7\.5%/);
    expect(text).toMatch(/at ₦150,000 each, before VAT\./);
  });

  it("names no rate it cannot read - plain 'incl. VAT', never a guess", async () => {
    pricing = { vatRate: "" };
    const { container } = render(<FinanceHomeView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/₦54,825,000/));
    const text = visibleText(container);
    expect(text).toMatch(/incl\. VAT(?! at)/);
    expect(text).not.toMatch(/VAT at/);
  });

  it("carries no VAT label when there is no total to label", async () => {
    pricing = { totalWithVat: "" };
    const { container } = render(<FinanceHomeView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Billed on 340 students/));
    expect(visibleText(container)).not.toMatch(/incl\. VAT/);
  });
});
