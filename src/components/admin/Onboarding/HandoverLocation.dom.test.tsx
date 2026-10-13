import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { WizardState } from "./OnboardingWizard";
import { HandoverStep } from "./HandoverStep";

/**
 * The location typed at sign-up is written after sign-in and never holds the
 * flow up. So the handover is where a location that did not land is said -
 * not left to come up empty in Settings some weeks later.
 */

const get = vi.fn();

vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: {
      ...actual.schoolApi,
      get: () => get(),
      saveOnboarding: async () => ({}),
    },
  };
});

const STATE: WizardState = {
  schoolName: "Brightgate Academy",
  location: "Lagos, Nigeria",
  adminName: "Folake Adebayo",
  email: "f@brightgate.edu.ng",
  band: null,
  registration: null,
};

const school = (contact: Record<string, string>) => ({
  id: "sch1",
  name: "Brightgate Academy",
  profile: { contact },
  academicConfig: {},
});

beforeEach(() => vi.clearAllMocks());

describe("the handover, about the sign-up location", () => {
  it("says so when the location did not reach the school's record", async () => {
    get.mockResolvedValue(school({}));
    const { container } = render(<HandoverStep state={STATE} />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Brightgate Academy isn.t active yet/));
    expect(visibleText(container)).toMatch(/couldn.t save your school.s location/);
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
      "/admin/settings#settings-school",
    );
  });

  it("says nothing when it landed, or when none was given", async () => {
    get.mockResolvedValue(school({ location: "Lagos, Nigeria" }));
    const first = render(<HandoverStep state={STATE} />);
    await waitFor(() => expect(visibleText(first.container)).toMatch(/Brightgate Academy isn.t active yet/));
    expect(visibleText(first.container)).not.toMatch(/location/);
    first.unmount();

    get.mockResolvedValue(school({}));
    const second = render(<HandoverStep state={{ ...STATE, location: "  " }} />);
    await waitFor(() => expect(visibleText(second.container)).toMatch(/Brightgate Academy isn.t active yet/));
    expect(visibleText(second.container)).not.toMatch(/location/);
  });
});

describe("the handover to a school that has not paid (Lydia, 7 Oct)", () => {
  it("says what has not happened, and that the transfer is what starts it", async () => {
    get.mockResolvedValue(school({ location: "Lagos, Nigeria" }));
    const { container } = render(<HandoverStep state={STATE} />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Brightgate Academy isn.t active yet/),
    );
    const text = visibleText(container);
    expect(text).toMatch(/No accounts have been created, no invitations have gone out and no consent requests have been sent\./);
    expect(text).toMatch(/All of it happens when your transfer clears\./);
    expect(text).not.toMatch(/all set up/i);
    expect(text).not.toMatch(/share your school code/i);
  });

  it("asks nothing about a sign-in provider - that is cut from onboarding", async () => {
    get.mockResolvedValue(school({ location: "Lagos, Nigeria" }));
    const { container } = render(<HandoverStep state={STATE} />);
    await waitFor(() => expect(visibleText(container)).toMatch(/isn.t active yet/));
    expect(visibleText(container)).not.toMatch(/Microsoft|Google|Connect/);
  });
});
