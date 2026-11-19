import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminSignOutModal } from "./AdminSignOutModal";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * THE COLLAPSED RAIL (backlog 90) and the admin's sign-out line (backlog 91).
 *
 * - SCRUM-39's spec, "Collapsed (tablet)": "Labels appear on hover as a quiet
 *   tooltip, cream on navy." They were the browser's own `title`.
 * - "Try loading your access again" rendered only expanded, so a collapsed
 *   rail with a failed permissions read offered no way to ask again.
 * - The admin frame's sign-out line says "with your admin account"; ours said
 *   the teacher variant's "with your school email".
 */

const perms = vi.hoisted(() => ({
  status: "ready" as "ready" | "failed",
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/dashboard" }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    scopes: perms.status === "failed" ? [] : ["oversight"],
    resolved: true,
    status: perms.status,
    refresh: perms.refresh,
    hasScope: () => perms.status !== "failed",
  }),
}));
vi.mock("@/lib/api", () => ({
  notificationsApi: { unreadExists: async () => ({ unreadExists: false }) },
}));
// The sign-out confirm signs out through the auth context.
vi.mock("@/hooks", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useAuth: () => ({ signOut: vi.fn() }),
}));

beforeAll(() => {
  // Radix's tooltip measures its trigger; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  perms.status = "ready";
  perms.refresh.mockReset();
  clearSession();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "a1",
    role: "senco_admin",
  });
  // A tablet: the rail opens collapsed below 1280px.
  window.matchMedia = ((query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("a collapsed row's label", () => {
  it("names each icon-only row, with no native title", () => {
    const { container } = render(<AdminSidebar />);

    const links = [...container.querySelectorAll("nav a")];
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      expect(a).toHaveAttribute("aria-label");
      expect(a).not.toHaveAttribute("title");
    }
    const bell = screen.getByRole("button", { name: "Notifications" });
    expect(bell).not.toHaveAttribute("title");
  });

  it("shows the label as SCRUM-39's quiet tooltip, cream on navy, on focus", async () => {
    const { container } = render(<AdminSidebar />);
    const first = container.querySelector("nav a")!;
    const label = first.getAttribute("aria-label")!;

    fireEvent.focus(first);

    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent(label);
    const drawn = document.querySelector("[data-radix-popper-content-wrapper] > div");
    expect(drawn?.className).toMatch(/bg-nevo-navy/);
    expect(drawn?.className).toMatch(/text-nevo-cream/);
  });
});

describe("a failed permissions read, on the collapsed rail", () => {
  it("still offers to try again, in the same words", () => {
    perms.status = "failed";
    render(<AdminSidebar />);

    fireEvent.click(
      screen.getByRole("button", { name: "Try loading your access again" }),
    );

    expect(perms.refresh).toHaveBeenCalledOnce();
  });

  it("offers nothing to retry when the read answered", () => {
    render(<AdminSidebar />);

    expect(
      screen.queryByRole("button", { name: "Try loading your access again" }),
    ).toBeNull();
  });
});

describe("the admin's sign-out confirm", () => {
  it("says the admin frame's line, not the teacher's", () => {
    render(<AdminSignOutModal onStay={() => {}} />);

    expect(
      screen.getByText("You can sign back in anytime with your admin account."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/school email/)).toBeNull();
  });
});
