import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Invoice } from "@/lib/api/billing";
import type { OnboardingState } from "@/lib/api/onboarding";
import { ActivationView } from "./ActivationView";

/**
 * The pay screens took the FIRST row of the invoice list - so a school with
 * more than one invoice could be shown another invoice's reference and amount
 * to transfer against. The onboarding state names the invoice raised at
 * confirm; the screens use that one, and show its own breakdown.
 */

const get = vi.fn();
const invoices = vi.fn();

vi.mock("@/lib/api/onboarding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/onboarding")>();
  return { ...actual, onboardingApi: { ...actual.onboardingApi, get: () => get() } };
});
vi.mock("@/lib/api/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/billing")>();
  return {
    ...actual,
    billingApi: {
      ...actual.billingApi,
      subscription: () => Promise.reject(new Error("not needed")),
      receivingAccount: () => Promise.reject(new Error("not needed")),
      invoices: () => invoices(),
    },
  };
});
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return { ...actual, schoolApi: { ...actual.schoolApi, get: async () => ({ name: "Brightgate" }) } };
});

const state = (over: Partial<OnboardingState>): OnboardingState => ({
  stage: "awaiting_payment",
  classes: [],
  teacherCount: 18,
  studentCount: 340,
  rejected: [],
  invoiceId: "inv-setup",
  amountDue: "54825000.00",
  currency: "NGN",
  periodLabel: "2026/27",
  canConfirm: false,
  canPay: true,
  canActivate: false,
  inOnboarding: true,
  ...over,
});

const invoice = (id: string, number: string, amount: string): Invoice => ({
  id,
  invoiceNumber: number,
  issuedAt: "2026-09-01T00:00:00Z",
  amount,
  status: "pending",
  dueAt: "2026-10-01T00:00:00Z",
  paidAt: null,
  pdfUrl: `/api/billing/invoices/s1/${number}.pdf`,
  currency: "NGN",
  periodLabel: "Session 2026/27",
  studentCount: 340,
  perStudentRate: "150000.00",
  totalBeforeVat: "51000000.00",
  vatAmount: "3825000.00",
  vatRate: "7.50",
});

beforeEach(() => {
  vi.clearAllMocks();
  invoices.mockResolvedValue([
    // An older, unrelated invoice listed FIRST.
    invoice("inv-old", "NEV-001", "1000.00"),
    invoice("inv-setup", "NEV-002", "54825000.00"),
  ]);
});

describe("the pay-and-activate screens", () => {
  it("show the invoice the school is paying, not whichever came first", async () => {
    get.mockResolvedValue(state({}));
    const { container } = render(<ActivationView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/Invoice NEV-002/));
    expect(visibleText(container)).not.toMatch(/NEV-001/);
  });

  it("break the invoice down in its own figures", async () => {
    get.mockResolvedValue(state({ stage: "confirmed" }));
    const { container } = render(<ActivationView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/340 students × ₦150,000/));
    const text = visibleText(container);
    expect(text).toMatch(/VAT at 7\.5%/);
    expect(text).toMatch(/₦3,825,000/);
    expect(text).toMatch(/₦54,825,000/);
  });

  it("guess no invoice when the state names none", async () => {
    get.mockResolvedValue(state({ invoiceId: null }));
    const { container } = render(<ActivationView />);

    await waitFor(() => expect(invoices).toHaveBeenCalled());
    await waitFor(() => expect(visibleText(container)).toMatch(/Pay for the year/));
    expect(visibleText(container)).not.toMatch(/NEV-00/);
  });
});
