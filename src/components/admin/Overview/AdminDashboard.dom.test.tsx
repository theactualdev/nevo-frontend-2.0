import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { OnboardingState } from "@/lib/api/onboarding";
import { AdminDashboard } from "./AdminDashboard";

/**
 * Which dashboard a school gets. Before this, a school that had not paid got
 * D04's "Welcome to Nevo", chosen because its adaptation total was zero, and
 * nothing on it led to the roster or to paying.
 */

const gate = vi.fn();
vi.mock("@/hooks", () => ({ useSetupGate: () => gate() }));
vi.mock("./OverviewView", () => ({ OverviewView: () => <h2>Overview</h2> }));

const subscription = vi.fn();
vi.mock("@/lib/api/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/billing")>();
  return { ...actual, billingApi: { ...actual.billingApi, subscription: () => subscription() } };
});
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: {
      ...actual.schoolApi,
      get: () => Promise.resolve({ name: "Brightgate Academy" }),
    },
  };
});

const state = (over: Partial<OnboardingState> = {}): OnboardingState => ({
  stage: "uploading",
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
  inOnboarding: true,
  ...over,
});

const PRICING = {
  pricingModel: "per_student",
  pricingPlan: "annual",
  accessWindow: "school_session",
  studentCount: 0,
  perStudentRate: "150000.00",
  rateType: "standard",
  rateLockedUntil: null,
  totalBeforeVat: "0.00",
  vatRate: "7.50",
  vatAmount: "0.00",
  totalWithVat: "0.00",
  currency: "NGN",
};

const open = (onboarding: OnboardingState | null, pause: string | null = "not_active") =>
  gate.mockReturnValue({ loading: false, pause, onboarding, refresh: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  subscription.mockResolvedValue({ pricing: PRICING });
});

describe("AdminDashboard", () => {
  it("shows a school that is not active where it is, not a welcome", async () => {
    open(state());
    const { container } = render(<AdminDashboard />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Brightgate Academy isn.t active yet/),
    );
    expect(visibleText(container)).not.toMatch(/Welcome to Nevo/);
    expect(screen.getByRole("link", { name: /Upload staff/ })).toHaveAttribute(
      "href",
      "/admin/roster",
    );
  });

  it("leads a confirmed school to paying", async () => {
    open(
      state({
        stage: "confirmed",
        teacherCount: 18,
        studentCount: 340,
        amountDue: "54825000.00",
        currency: "NGN",
        periodLabel: "the 2026/27 session",
      }),
    );
    const { container } = render(<AdminDashboard />);

    await waitFor(() => expect(visibleText(container)).toMatch(/₦54,825,000/));
    expect(visibleText(container)).toMatch(/for the 2026\/27 session/);
    expect(visibleText(container)).toMatch(/340 students × ₦150,000/);
    for (const name of [/Pay now/, /Pay by bank transfer/]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", "/admin/activate");
    }
  });

  it("never puts a provisional total on screen before the roster is confirmed", async () => {
    open(state({ teacherCount: 18, studentCount: 340 }));
    const { container } = render(<AdminDashboard />);

    await waitFor(() => expect(visibleText(container)).toMatch(/Your school so far/));
    const text = visibleText(container);
    expect(text).toMatch(/Set when you confirm your roster/);
    // The rate is the server's and may be shown; a multiplied total may not.
    expect(text).not.toMatch(/₦51,000,000|₦54,825,000/);
  });

  it("says the rest of the console is locked, in the frame's words for each moment", async () => {
    // True because every write control outside this page pauses for a school
    // in setup - see PausedNote. The backend refuses none of those writes.
    open(state());
    const a = render(<AdminDashboard />);
    await waitFor(() =>
      expect(visibleText(a.container)).toMatch(
        /can.t make any changes until Brightgate Academy is active/,
      ),
    );
    a.unmount();

    open(state({ stage: "awaiting_payment", studentCount: 3 }));
    const c = render(<AdminDashboard />);
    await waitFor(() =>
      expect(visibleText(c.container)).toMatch(/read-only until your payment is confirmed/),
    );
  });

  it("gives a running school its ordinary Overview", () => {
    open(state({ inOnboarding: false, stage: "activated" }), null);
    render(<AdminDashboard />);
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
  });

  it("lets an unconfirmed email come first", () => {
    // D01b AC-05 owns that console, banner and all.
    open(state(), "email_unconfirmed");
    render(<AdminDashboard />);
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
  });

  it("fails open to the Overview when the onboarding read failed", () => {
    open(null, "not_active");
    render(<AdminDashboard />);
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
  });

  it("says nothing either way until the gate has read", () => {
    gate.mockReturnValue({ loading: true, pause: null, onboarding: null, refresh: vi.fn() });
    const { container } = render(<AdminDashboard />);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(visibleText(container)).not.toMatch(/active yet|Welcome/);
  });
});
