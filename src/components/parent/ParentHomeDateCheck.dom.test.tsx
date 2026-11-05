import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { myChildren, subjectProgress, getSession, parentChecks } = vi.hoisted(() => ({
  myChildren: vi.fn(),
  subjectProgress: vi.fn(),
  getSession: vi.fn(),
  parentChecks: vi.fn(),
}));

// Replaced wholesale - see ParentDataManagement.test.tsx for why importOriginal
// deadlocks the jsdom worker here.
vi.mock("@/lib/api/parent", () => ({ parentApi: { myChildren, subjectProgress } }));
vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/lib/api/ageChecks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/ageChecks")>();
  return { ...actual, ageChecksApi: { parent: parentChecks } };
});

import { ParentHome } from "./ParentHome";

/**
 * SCRUM-243: the parent's route to D01d. One quiet line on the home, only
 * when the school has re-checked and the parent hasn't given the date yet -
 * nothing at all otherwise.
 */

const CHILD = {
  studentId: "s-1",
  firstName: "Amara",
  lastName: "Okafor",
  status: "active",
  schoolId: "sc-1",
  schoolName: "Corona Secondary School",
};

const check = (over: Record<string, unknown> = {}) => ({
  id: "ac1",
  studentId: "s-1",
  blocksAccess: true,
  schoolRecheckedAt: "2026-10-21T09:00:00Z",
  parentReconfirmedAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockReturnValue({ token: "t", expiresAt: "2026-12-01T00:00:00Z", userId: "p-1", role: "parent_guardian" });
  myChildren.mockResolvedValue([CHILD]);
  subjectProgress.mockResolvedValue({
    studentId: "s-1",
    window: { startsOn: "2026-10-05", endsOn: "2026-10-11", state: "in_term", inProgress: false },
    subjects: [],
  });
});

describe("the route to the date check", () => {
  it("is one line, for the child it's about, when the parent has something to confirm", async () => {
    parentChecks.mockResolvedValue([check()]);
    render(<ParentHome />);
    const link = await screen.findByRole("link", { name: /Can you confirm Amara’s date of birth\?/ });
    expect(link).toHaveAttribute("href", "/parent-portal/date-check?child=s-1");
  });

  it("isn't there before the school has checked", async () => {
    parentChecks.mockResolvedValue([check({ schoolRecheckedAt: null })]);
    render(<ParentHome />);
    await waitFor(() => expect(parentChecks).toHaveBeenCalled());
    await screen.findByRole("link", { name: "Your child’s data" });
    // The checks read answers after the children read; let it land.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("link", { name: /date of birth/ })).toBeNull();
  });

  it("isn't there once the parent has given it, or when nothing is held", async () => {
    parentChecks.mockResolvedValue([
      check({ parentReconfirmedAt: "2026-10-21T12:00:00Z" }),
      check({ id: "ac2", blocksAccess: false }),
    ]);
    render(<ParentHome />);
    await screen.findByRole("link", { name: "Your child’s data" });
    // The checks read answers after the children read; let it land.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("link", { name: /date of birth/ })).toBeNull();
  });
});
