import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { classSelector, compiledCss, styleAt } from "@/test/compiledCss";
import type { Invoice } from "@/lib/api/billing";
import type { OnboardingState } from "@/lib/api/onboarding";
import { ActivationView } from "./ActivationView";
import { NotActiveDashboard } from "../Overview/NotActiveDashboard";

/**
 * D24's DRAWN TWO-COLUMN LAYOUTS, BUILT (Lydia, 16 Nov, SCRUM-347: "Admin
 * BUILDS the drawn two-column layouts").
 *
 *  - The unfinished dashboard, moments B and C: steps left, counts or price
 *    right, `1.4fr 1fr`. Moment A stays one column. Below 1280, moment C puts
 *    the price above the steps (D24's tablet frame).
 *  - OB-03 cost: roster left, cost right, `1fr 1.1fr`.
 *  - OB-04 payment: How to pay left, invoice right, `1.1fr 1fr`.
 *
 * Desktop starts at 1280 (`xl:`). jsdom applies no media query, so what the
 * classes DO at a width is read from the stylesheet as Tailwind compiles it.
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

const INVOICE: Invoice = {
  id: "inv-setup",
  invoiceNumber: "NEV-002",
  issuedAt: "2026-09-01T00:00:00Z",
  amount: "54825000.00",
  status: "pending",
  dueAt: "2026-10-01T00:00:00Z",
  paidAt: null,
  pdfUrl: "/api/billing/invoices/s1/NEV-002.pdf",
  currency: "NGN",
  periodLabel: "Session 2026/27",
  studentCount: 340,
  perStudentRate: "150000.00",
  totalBeforeVat: "51000000.00",
  vatAmount: "3825000.00",
  vatRate: "7.50",
};

beforeEach(() => {
  vi.clearAllMocks();
  invoices.mockResolvedValue([INVOICE]);
});

/** The grid that holds the two columns: the parent of the first column. */
const gridOf = (el: Element | null) => el?.parentElement ?? null;
const order = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-column]")].map((e) => e.getAttribute("data-column"));

describe("the compiled grid at 1279 and 1280", () => {
  const CLASSES = ["flex", "xl:grid", "xl:grid-cols-[1.4fr_1fr]", "order-first", "xl:order-none"];
  let css = "";
  beforeAll(async () => {
    css = await compiledCss(CLASSES);
  });
  const at = (classes: string[], width: number) =>
    styleAt(css, classes.map(classSelector), { width });

  it("is one column (flex) below 1280, and two columns from 1280", () => {
    expect(at(["flex", "xl:grid"], 1279).display).toBe("flex");
    expect(at(["flex", "xl:grid"], 1280).display).toBe("grid");
    expect(at(["xl:grid-cols-[1.4fr_1fr]"], 1280)["grid-template-columns"]).toBe("1.4fr 1fr");
    expect(at(["xl:grid-cols-[1.4fr_1fr]"], 1279)["grid-template-columns"]).toBe(undefined);
  });

  it("moves the price first below 1280 only", () => {
    expect(at(["order-first", "xl:order-none"], 1279).order).not.toBe("0");
    expect(at(["order-first", "xl:order-none"], 1280).order).toBe("0");
  });
});

describe("the unfinished dashboard (D24 OB-00)", () => {
  it("moment B: steps, then the counts, in two columns from 1280", () => {
    const { container } = render(
      <NotActiveDashboard state={state({ stage: "uploading", studentCount: 0, invoiceId: null })} />,
    );
    const soFar = container.querySelector('[data-column="so-far"]');
    expect(soFar).not.toBeNull();
    const grid = gridOf(soFar);
    expect(grid?.className).toMatch(/(^|\s)xl:grid(\s|$)/);
    expect(grid?.className).toMatch(/xl:grid-cols-\[1\.4fr_1fr\]/);
    // The steps come first in the source, so first in the left column.
    expect(grid?.firstElementChild?.textContent).toMatch(/What.s left/);
  });

  it("moment C: the price is first below 1280 and in the right column from 1280", () => {
    const { container } = render(<NotActiveDashboard state={state({})} />);
    const toPay = container.querySelector('[data-column="to-pay"]');
    expect(toPay?.className).toMatch(/(^|\s)order-first(\s|$)/);
    expect(toPay?.className).toMatch(/xl:order-none/);
    expect(gridOf(toPay)?.className).toMatch(/xl:grid-cols-\[1\.4fr_1fr\]/);
  });

  it("moment A has nothing beside its steps, so it stays one column", () => {
    const { container } = render(
      <NotActiveDashboard
        state={state({ stage: "uploading", studentCount: 0, teacherCount: 0, invoiceId: null })}
      />,
    );
    expect(container.querySelector("[data-column]")).toBeNull();
    expect(container.innerHTML).not.toMatch(/xl:grid-cols-\[1\.4fr_1fr\]/);
  });
});

describe("pay and activate (D24 OB-03, OB-04)", () => {
  it("OB-03: the roster left and the cost right, 1fr 1.1fr, from 1280", async () => {
    get.mockResolvedValue(state({ stage: "confirmed" }));
    const { container } = render(<ActivationView />);
    await waitFor(() => expect(container.querySelector('[data-column="cost"]')).not.toBeNull());
    expect(order(container)).toEqual(["roster", "cost"]);
    expect(gridOf(container.querySelector('[data-column="roster"]'))?.className).toMatch(
      /xl:grid-cols-\[1fr_1\.1fr\]/,
    );
    // "Pay by bank transfer" sits with the cost, as the frame draws it.
    expect(container.querySelector('[data-column="cost"]')?.textContent).toMatch(/Pay by bank transfer/);
  });

  it("OB-04: How to pay left and the invoice right, 1.1fr 1fr, from 1280", async () => {
    get.mockResolvedValue(state({}));
    const { container } = render(<ActivationView />);
    await waitFor(() => expect(container.querySelector('[data-column="invoice"]')).not.toBeNull());
    expect(order(container)).toEqual(["how-to-pay", "invoice"]);
    expect(gridOf(container.querySelector('[data-column="how-to-pay"]'))?.className).toMatch(
      /xl:grid-cols-\[1\.1fr_1fr\]/,
    );
  });

  it("OB-04 with no invoice: How to pay alone, one column", async () => {
    invoices.mockResolvedValue([]);
    get.mockResolvedValue(state({ invoiceId: null }));
    const { container } = render(<ActivationView />);
    await waitFor(() =>
      expect(container.querySelector('[data-column="how-to-pay"]')).not.toBeNull(),
    );
    expect(container.querySelector('[data-column="invoice"]')).toBeNull();
    expect(gridOf(container.querySelector('[data-column="how-to-pay"]'))?.className).not.toMatch(
      /xl:grid/,
    );
  });
});
