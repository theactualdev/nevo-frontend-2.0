import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { path } = vi.hoisted(() => ({ path: { now: "/admin/settings" } }));

vi.mock("next/navigation", () => ({ usePathname: () => path.now }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    scopes: ["it_sso"],
    resolved: true,
    status: "ready",
    refresh: vi.fn(),
    hasScope: (s: string) => s === "it_sso",
  }),
}));
vi.mock("@/lib/api", () => ({
  notificationsApi: { unreadExists: async () => ({ unreadExists: false }) },
}));
vi.mock("@/lib/api/learningSupport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/learningSupport")>();
  return {
    ...actual,
    learningSupportApi: { holders: async () => ({ viewerHoldsIt: false, holders: [] }) },
  };
});

import { AdminSidebar } from "./AdminSidebar";

/**
 * Backlog 20: once an IT admin opened Settings, nothing on screen returned them
 * to the Systems overview they land on - IT & SSO left the rail on 24 Sep and
 * nothing replaced it. D17 draws this persona's rail with a row lit on that
 * screen; it is a Systems overview row now, and the rail stays as narrow as
 * Lydia's 6 Oct ruling keeps it.
 */

beforeEach(() => {
  path.now = "/admin/settings";
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

describe("an IT admin's rail", () => {
  it("leads back to the Systems overview from Settings", async () => {
    render(<AdminSidebar />);
    const home = await screen.findByRole("link", { name: "Systems overview" });
    expect(home).toHaveAttribute("href", "/admin/sso/home");
    expect(home).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  });

  it("lights the row on the Systems overview itself", async () => {
    path.now = "/admin/sso/home";
    render(<AdminSidebar />);
    expect(await screen.findByRole("link", { name: "Systems overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("offers nothing wider - no school screens, and no IT & SSO set-up", async () => {
    render(<AdminSidebar />);
    await screen.findByRole("link", { name: "Systems overview" });
    const rows = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"))
      .filter((h) => h?.startsWith("/admin/"));
    expect(rows).toEqual(["/admin/sso/home", "/admin/settings"]);
  });
});
