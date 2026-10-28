import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { SafetyEvent } from "@/lib/api/safety";
import type { LearningSupportHolders } from "@/lib/api/learningSupport";

const { events } = vi.hoisted(() => ({ events: vi.fn() }));

vi.mock("@/lib/api/safety", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/safety")>();
  return { ...actual, safetyApi: { events } };
});
vi.mock("@/lib/auth/session", () => ({ getSession: () => ({ userId: "u-me" }) }));

import { SafeguardingRecord } from "./SafeguardingRecord";

/**
 * D08b's safeguarding line: plain, dated, routed to the list - and absent
 * whenever there is nothing to say or the reader doesn't hold the role.
 */

const HOLDS: LearningSupportHolders = {
  viewerHoldsIt: true,
  holders: [{ userId: "u-grace", name: "Grace Eze", role: "senco_admin", grantedAt: "2026-10-01T00:00:00Z", grantedBy: "u-root" }],
};

const event = (over: Partial<SafetyEvent>): SafetyEvent => ({
  id: "e1",
  studentId: "s-amara",
  phase: "input:ask_nevo",
  action: "safeguard",
  categories: ["self_harm"],
  policyVersion: "child-safety-2026-10-v1",
  createdAt: "2026-10-18T13:14:00Z",
  acknowledgedAt: "2026-10-18T15:00:00Z",
  acknowledgedBy: "u-grace",
  acknowledgedByName: "Grace Eze",
  studentName: "Amara Okafor",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the safeguarding line on a profile", () => {
  it("is dated, names who saw it, says seeing isn't resolving, and leads to the list", async () => {
    events.mockResolvedValue([event({ studentId: "s-other", id: "e0" }), event({})]);
    const { container } = render(<SafeguardingRecord studentId="s-amara" firstName="Amara" holders={HOLDS} />);
    expect(
      await screen.findByText(
        "A safeguarding concern was recorded for Amara on 18 October 2026. What Amara asked is never shown here.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Grace Eze recorded this as seen on 18 October 2026.")).toBeInTheDocument();
    expect(container.textContent).toMatch(/Seeing it is not the same as resolving it\./);
    expect(screen.getByRole("link", { name: /Open the safeguarding list/ })).toHaveAttribute(
      "href",
      "/admin/safeguarding",
    );
  });

  it("is absent when this child has no entry", async () => {
    events.mockResolvedValue([event({ studentId: "s-other" })]);
    const { container } = render(<SafeguardingRecord studentId="s-amara" firstName="Amara" holders={HOLDS} />);
    await waitFor(() => expect(events).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("is absent, and asks nothing, for someone who doesn't hold Learning Support", () => {
    const { container } = render(
      <SafeguardingRecord studentId="s-amara" firstName="Amara" holders={{ ...HOLDS, viewerHoldsIt: false }} />,
    );
    expect(events).not.toHaveBeenCalled();
    expect(container.textContent).toBe("");
  });

  it("is absent when the read is refused", async () => {
    events.mockRejectedValue(new Error("403"));
    const { container } = render(<SafeguardingRecord studentId="s-amara" firstName="Amara" holders={HOLDS} />);
    await waitFor(() => expect(events).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
