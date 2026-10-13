import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Invoice } from "@/lib/api/billing";
import type { OnboardingState } from "@/lib/api/onboarding";
import { ActivationView } from "./ActivationView";

/**
 * Waiting for a transfer, after Lydia's 7 Oct ruling. Both lines promised an
 * email that nothing sends, and a timeframe nobody keeps: a transfer is
 * confirmed by a person reading a statement. The copy now promises only what
 * is true, and the page re-reads when it comes back into view, so "this page
 * updates as soon as yours clears" holds for a tab left open overnight.
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
  invoices.mockResolvedValue([invoice("inv-setup", "NEV-002", "54825000.00")]);
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

describe("waiting for the transfer", () => {
  it("promises no email and no timeframe, in Lydia's words", async () => {
    get.mockResolvedValue(state({}));
    const { container } = render(<ActivationView />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/We check for transfers through the day\./),
    );
    const text = visibleText(container);
    expect(text).toMatch(/This page updates as soon as yours clears, and there is nothing else for you to do\./);
    expect(text).not.toMatch(/email/i);
    expect(text).not.toMatch(/hours|overnight|tomorrow/i); // a day is when to ask, not a promise
  });

  it("reads the state again when the page comes back into view", async () => {
    get.mockResolvedValue(state({}));
    render(<ActivationView />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it("does not read while the page is hidden", async () => {
    get.mockResolvedValue(state({}));
    render(<ActivationView />);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(get).toHaveBeenCalledTimes(1);
  });
});
