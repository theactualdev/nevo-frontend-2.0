import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { SafetyEvent } from "@/lib/api/safety";
import type { LearningSupportHolders } from "@/lib/api/learningSupport";

const { events, acknowledge, holders } = vi.hoisted(() => ({
  events: vi.fn(),
  acknowledge: vi.fn(),
  holders: vi.fn(),
}));

vi.mock("@/lib/api/safety", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/safety")>();
  return { ...actual, safetyApi: { events, acknowledge } };
});
vi.mock("@/lib/api/learningSupport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/learningSupport")>();
  return { ...actual, learningSupportApi: { holders } };
});
vi.mock("@/lib/auth/session", () => ({ getSession: () => ({ userId: "u-me" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/admin/safeguarding",
  useSearchParams: () => new URLSearchParams(),
}));

import { SafeguardingView } from "./SafeguardingView";

/**
 * D29 Safeguarding (SCRUM-260). An entry is the child, when, and the category
 * - never the child's words - and seeing it records that it was seen; it
 * never closes anything. Learning Support holders only.
 */

const HOLDS: LearningSupportHolders = {
  viewerHoldsIt: true,
  holders: [
    { userId: "u-me", name: "Folake Adebayo", role: "senco_admin", grantedAt: "2026-10-01T00:00:00Z", grantedBy: "u-root" },
    { userId: "u-grace", name: "Grace Eze", role: "other_admin", grantedAt: "2026-10-02T00:00:00Z", grantedBy: "u-root" },
  ],
};

const event = (over: Partial<SafetyEvent>): SafetyEvent => ({
  id: "e1",
  studentId: "s-ada",
  phase: "input:ask_nevo",
  action: "safeguard",
  categories: ["self_harm"],
  policyVersion: "child-safety-2026-10-v1",
  createdAt: "2026-10-18T13:14:00Z",
  acknowledgedAt: null,
  acknowledgedBy: null,
  studentName: "Adaeze Okonkwo",
  acknowledgedByName: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  holders.mockResolvedValue(HOLDS);
  events.mockResolvedValue([]);
});

describe("nothing flagged", () => {
  it("reads as reassuring, not as a failure", async () => {
    render(<SafeguardingView />);
    expect(await screen.findByRole("heading", { name: "Nothing has been flagged" })).toBeInTheDocument();
    // Everything, not only what's unseen: a seen entry stays on the list.
    expect(events).toHaveBeenCalledWith({ limit: 100 });
  });
});

describe("entries", () => {
  it("show the child, when, and the category - and nothing the child wrote", async () => {
    events.mockResolvedValue([event({})]);
    const { container } = render(<SafeguardingView />);
    const item = (await screen.findByText("Adaeze Okonkwo")).closest("li") as HTMLElement;
    expect(within(item).getByText(/^Flagged 18 October 2026 · /)).toBeInTheDocument();
    expect(within(item).getByText("Self-harm")).toBeInTheDocument();
    expect(within(item).getByRole("link", { name: /Open profile/ })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/admin\/senco\/s-ada\?back=%2Fadmin%2Fsafeguarding/),
    );
    // No count anywhere - the server sends none.
    expect(container.textContent).not.toMatch(/\b\d+ (entries|flagged|unacknowledged)/i);
  });

  it("leaves out checks that name no child - a teacher's lesson is not a disclosure", async () => {
    events.mockResolvedValue([event({ id: "lesson", studentId: null, phase: "source" })]);
    render(<SafeguardingView />);
    expect(await screen.findByRole("heading", { name: "Nothing has been flagged" })).toBeInTheDocument();
  });

  it("says 'A student' rather than guessing when the server sends no name", async () => {
    events.mockResolvedValue([event({ studentName: null })]);
    render(<SafeguardingView />);
    expect(await screen.findByText("A student")).toBeInTheDocument();
  });

  it("records that it was seen, and keeps the entry, showing who and when", async () => {
    events.mockResolvedValue([event({})]);
    acknowledge.mockResolvedValue(
      event({ acknowledgedAt: "2026-10-20T09:00:00Z", acknowledgedBy: "u-me" }),
    );
    render(<SafeguardingView />);
    fireEvent.click(await screen.findByRole("button", { name: "Record that I’ve seen this" }));

    await waitFor(() => expect(acknowledge).toHaveBeenCalledWith("e1"));
    expect(await screen.findByText("Seen by you · 20 October 2026")).toBeInTheDocument();
    // Still listed; nothing about closing or resolving it.
    expect(screen.getByText("Adaeze Okonkwo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resolve|close/i })).toBeNull();
  });

  it("names who saw it, as the server sends it", async () => {
    events.mockResolvedValue([
      event({ acknowledgedAt: "2026-10-12T09:00:00Z", acknowledgedBy: "u-grace", acknowledgedByName: "Grace Eze" }),
    ]);
    render(<SafeguardingView />);
    expect(await screen.findByText("Seen by Grace Eze · 12 October 2026")).toBeInTheDocument();
  });

  it("says only 'Seen' when nobody can say who", async () => {
    events.mockResolvedValue([
      event({ acknowledgedAt: "2026-10-12T09:00:00Z", acknowledgedBy: "u-unknown" }),
    ]);
    render(<SafeguardingView />);
    expect(await screen.findByText("Seen · 12 October 2026")).toBeInTheDocument();
  });

  it("says so when recording didn't go through, and changes nothing", async () => {
    events.mockResolvedValue([event({})]);
    acknowledge.mockRejectedValue(new Error("down"));
    render(<SafeguardingView />);
    fireEvent.click(await screen.findByRole("button", { name: "Record that I’ve seen this" }));
    expect(await screen.findByText(/That didn.t go through, and nothing has changed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record that I’ve seen this" })).toBeInTheDocument();
  });
});

describe("who can open it", () => {
  it("is refused to someone who doesn't hold Learning Support", async () => {
    holders.mockResolvedValue({ ...HOLDS, viewerHoldsIt: false });
    render(<SafeguardingView />);
    expect(await screen.findByText(/the safeguarding list/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /seen this/ })).toBeNull();
  });

  it("shows the server's refusal as it stands", async () => {
    events.mockRejectedValue(new ApiError(403, "Forbidden"));
    render(<SafeguardingView />);
    expect(await screen.findByText(/the safeguarding list/)).toBeInTheDocument();
  });
});
