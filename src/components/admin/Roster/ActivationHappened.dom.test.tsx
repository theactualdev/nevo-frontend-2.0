import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { DerivedClass, OnboardingState } from "@/lib/api/onboarding";
import { ActivationView } from "./ActivationView";

/**
 * OB-05's "What just happened" was not rendered at all. It says what the
 * activate call that just returned established - accounts created, counted by
 * that response - and nothing the contract does not: no invitations "sent",
 * no consent requests, no sign-in sheets. On a later visit nothing just
 * happened, so there is no list.
 */

const get = vi.fn();
const activate = vi.fn();

vi.mock("@/lib/api/onboarding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/onboarding")>();
  return {
    ...actual,
    onboardingApi: { ...actual.onboardingApi, get: () => get(), activate: () => activate() },
  };
});
vi.mock("@/lib/api/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/billing")>();
  return {
    ...actual,
    billingApi: {
      ...actual.billingApi,
      subscription: () => Promise.reject(new Error("not needed")),
      receivingAccount: () => Promise.reject(new Error("not needed")),
      invoices: async () => [],
    },
  };
});
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return { ...actual, schoolApi: { ...actual.schoolApi, get: async () => ({ name: "Brightgate" }) } };
});

const klass = (name: string): DerivedClass => ({
  name,
  normalisedName: name.toLowerCase(),
  yearGroup: null,
  section: null,
  studentCount: 20,
  teacherCount: 1,
});

const state = (over: Partial<OnboardingState>): OnboardingState => ({
  stage: "awaiting_payment",
  classes: [klass("JSS 1A"), klass("JSS 1B"), klass("JSS 2A")],
  teacherCount: 18,
  studentCount: 340,
  rejected: [],
  invoiceId: null,
  amountDue: null,
  currency: "NGN",
  periodLabel: null,
  canConfirm: false,
  canPay: false,
  canActivate: true,
  inOnboarding: true,
  ...over,
});

async function switchOn(activated: OnboardingState) {
  get.mockResolvedValue(state({}));
  activate.mockResolvedValue(activated);
  const r = render(<ActivationView />);
  fireEvent.click(await screen.findByRole("button", { name: "Switch your school on" }));
  await waitFor(() => expect(visibleText(r.container)).toMatch(/Brightgate is active/));
  return r;
}

beforeEach(() => vi.clearAllMocks());

describe("OB-05's What just happened", () => {
  it("lists the accounts the activate call created, with its own counts", async () => {
    const { container } = await switchOn(state({ stage: "activated", canActivate: false }));
    const text = visibleText(container);
    expect(text).toMatch(/Here.s what just happened/);
    expect(text).toMatch(/What just happened/);
    expect(text).toMatch(/340 student accounts created/);
    expect(text).toMatch(/Across your 3 classes/);
    expect(text).toMatch(/18 teacher accounts created/);
  });

  it("claims nothing the contract does not establish", async () => {
    const { container } = await switchOn(state({ stage: "activated", canActivate: false }));
    const text = visibleText(container);
    expect(text).not.toMatch(/invitations? sent/i);
    expect(text).not.toMatch(/consent/i);
    expect(text).not.toMatch(/sign-in details/i);
  });

  it("leaves out a row with nothing in it, and says one in the singular", async () => {
    const { container } = await switchOn(
      state({ stage: "activated", canActivate: false, teacherCount: 0, studentCount: 1, classes: [klass("JSS 1A")] }),
    );
    const text = visibleText(container);
    expect(text).toMatch(/1 student account created/);
    expect(text).toMatch(/Across your 1 class\b/);
    expect(text).not.toMatch(/teacher account/);
  });

  it("shows no list on a later visit, when nothing just happened", async () => {
    get.mockResolvedValue(state({ stage: "activated", canActivate: false }));
    const { container } = render(<ActivationView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Brightgate is active/));
    expect(visibleText(container)).not.toMatch(/just happened/);
    expect(visibleText(container)).not.toMatch(/accounts created/);
  });
});

describe("a refusal on the activation screen", () => {
  it("says it is about access, with no retry", async () => {
    get.mockRejectedValue(new ApiError(403, "forbidden"));
    const { container } = render(<ActivationView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/don't have access to your school's activation/),
    );
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
  });
});
