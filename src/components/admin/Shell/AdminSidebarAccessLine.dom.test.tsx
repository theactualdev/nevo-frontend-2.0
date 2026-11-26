import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { AdminSidebar } from "./AdminSidebar";

/**
 * The line under the admin's name says what they may do - and nothing while
 * that isn't known. It said "No access yet" for the whole of every load,
 * because an unread list of scopes is empty (24 Nov QA).
 */

const identity = vi.fn();

vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => identity(),
}));

let perms: { scopes: string[]; resolved: boolean; status: "loading" | "ready" | "failed" } = {
  scopes: [],
  resolved: false,
  status: "loading",
};
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ ...perms, refresh: () => {}, hasScope: () => false }),
}));

vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/admin",
}));

vi.mock("@/lib/api/notifications", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/notifications")>();
  return {
    ...actual,
    notificationsApi: {
      ...actual.notificationsApi,
      unreadCount: async () => 0,
      list: async () => ({
        notifications: [],
        unreadCount: 0,
        total: 0,
        hasMore: false,
      }),
    },
  };
});

/**
 * jsdom ships a `matchMedia` that answers `matches: false` to everything, so
 * without this every test here renders the COLLAPSED rail - where the identity
 * block is initials alone and no name is drawn at all. The viewport has to be
 * stated rather than inherited.
 */
beforeEach(() => {
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
  identity.mockReset();
  identity.mockReturnValue({ name: "Folake Adebayo", initials: "FA" });
});

describe("the access line under the admin's name", () => {
  it("says nothing while the access read is out", async () => {
    perms = { scopes: [], resolved: false, status: "loading" };
    const { container } = render(<AdminSidebar />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Folake Adebayo/));
    expect(visibleText(container)).not.toMatch(/No access yet/);
  });

  it("says what the admin may do once it answers", async () => {
    perms = { scopes: ["oversight"], resolved: true, status: "ready" };
    const { container } = render(<AdminSidebar />);
    await waitFor(() => expect(visibleText(container)).toMatch(/General Oversight/));
  });

  it("still says No access yet when the answer really is none", async () => {
    perms = { scopes: [], resolved: true, status: "ready" };
    const { container } = render(<AdminSidebar />);
    await waitFor(() => expect(visibleText(container)).toMatch(/No access yet/));
  });
});
