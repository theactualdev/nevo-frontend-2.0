import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Notification } from "@/lib/api/notifications";
import { PermissionContext } from "@/context/PermissionContext";
import type { PermissionScope } from "@/lib/constants/permissions";
import { NotificationRow } from "./NotificationRow";

/**
 * The two notification types the live spec has and this console didn't name
 * (found by the teacher lane's enum gate, #1003), checked against what the
 * server actually sends (ca58ae5, 5 Nov):
 *
 * - `payment_cleared`: "Payment received", to billing admins, category
 *   billing, linking to Billing. Reads right as it is.
 * - `deactivated_student_support_requested`: "A teacher needs help with a
 *   learner account", to EVERY active admin, category account, linking to the
 *   child's record. Two things read wrong:
 *   1. category `account` is named Platform here ("Maintenance, changes to
 *      screens you use, and policy updates"), so the row carried no label
 *      that fits;
 *   2. a billing-only or IT admin can't open a student's record, so the row
 *      was a link to a refusal.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const note = (over: Partial<Notification>): Notification =>
  ({
    notificationId: "n1",
    recipientId: "u1",
    recipientRole: "other_admin",
    type: "payment_cleared",
    category: null,
    title: "Something",
    description: "",
    read: false,
    createdAt: "2026-11-05T09:00:00Z",
    navigatesTo: null,
    archived: false,
    archivedAt: null,
    ...over,
  }) as Notification;

const asAdmin = (scopes: PermissionScope[], n: Notification) =>
  render(
    <PermissionContext.Provider
      value={{ scopes, resolved: true, status: "ready", refresh: () => {} } as never}
    >
      <NotificationRow
        notification={n}
        archived={false}
        now={Date.parse("2026-11-05T10:00:00Z")}
        onRead={vi.fn()}
        onArchive={vi.fn()}
        onRestore={vi.fn()}
      />
    </PermissionContext.Provider>,
  );

const support = note({
  type: "deactivated_student_support_requested",
  category: "account",
  title: "A teacher needs help with a learner account",
  description: "Amara Obi's deactivated account needs an administrator's review.",
  navigatesTo: "/admin/students/s1",
});

describe("a payment that cleared", () => {
  it("reads as Billing, and leads to Billing for a billing admin", () => {
    const { container } = asAdmin(
      ["billing"],
      note({ category: "billing", title: "Payment received", navigatesTo: "/admin/billing" }),
    );
    expect(visibleText(container)).toMatch(/Billing/);
    expect(screen.getByRole("link")).toBeInTheDocument();
  });
});

describe("a teacher asking for help with a deactivated learner", () => {
  it("isn't labelled Platform - a teacher asking about a child is not maintenance or policy", () => {
    const { container } = asAdmin(["roster"], support);
    expect(visibleText(container)).toMatch(/A teacher needs help with a learner account/);
    expect(visibleText(container)).not.toMatch(/Platform/i);
  });

  it("leads to the child's record for an admin who can open it", () => {
    asAdmin(["roster"], support);
    expect(screen.getByRole("link")).toBeInTheDocument();
  });

  it("is not a link for an admin the record would refuse - it still says what happened", () => {
    const { container } = asAdmin(["billing"], support);
    expect(visibleText(container)).toMatch(/A teacher needs help with a learner account/);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
