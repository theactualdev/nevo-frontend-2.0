import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { holders } = vi.hoisted(() => ({ holders: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/dashboard" }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    scopes: ["oversight", "senco"],
    resolved: true,
    status: "ready",
    refresh: vi.fn(),
    hasScope: () => true,
  }),
}));
vi.mock("@/lib/api", () => ({
  notificationsApi: { unreadExists: async () => ({ unreadExists: false }) },
}));
vi.mock("@/lib/api/learningSupport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/learningSupport")>();
  return { ...actual, learningSupportApi: { holders } };
});

import { AdminSidebar } from "./AdminSidebar";

/**
 * SCRUM-260: Safeguarding is on the rail for a Learning Support holder and
 * ABSENT for everyone else - not a locked row (design D29). The holders read
 * is the only thing that decides it, not the senco scope.
 */

beforeEach(() => {
  vi.clearAllMocks();
  window.matchMedia = ((query: string) =>
    ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
});

describe("Safeguarding on the rail", () => {
  it("is there, under Learning Support, for a holder", async () => {
    holders.mockResolvedValue({ viewerHoldsIt: true, holders: [] });
    render(<AdminSidebar />);
    expect(await screen.findByRole("link", { name: "Safeguarding" })).toHaveAttribute(
      "href",
      "/admin/safeguarding",
    );
  });

  it("is absent - not locked - for someone who holds the senco scope but not the role", async () => {
    holders.mockResolvedValue({ viewerHoldsIt: false, holders: [] });
    render(<AdminSidebar />);
    await waitFor(() => expect(holders).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Learning Support" })).toBeInTheDocument();
    expect(screen.queryByText("Safeguarding")).toBeNull();
  });

  it("stays absent while the answer is unknown", async () => {
    holders.mockRejectedValue(new Error("down"));
    render(<AdminSidebar />);
    await waitFor(() => expect(holders).toHaveBeenCalled());
    expect(screen.queryByText("Safeguarding")).toBeNull();
  });
});
