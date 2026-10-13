import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { clearSession, setSession } from "@/lib/auth/session";
import { READ_STATE_EVENT } from "../Notifications/readState";
import { AdminSidebar } from "./AdminSidebar";

/**
 * The unread dot read `.exists` from a body whose key the contract never
 * names, read once per session, and never heard about reads on the full page.
 */

const unreadExists = vi.fn();

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/notifications" }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    scopes: ["oversight"],
    resolved: true,
    status: "ready",
    refresh: vi.fn(),
    hasScope: () => true,
  }),
}));
vi.mock("@/lib/api/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/notifications")>();
  return { ...actual, notificationsApi: { ...actual.notificationsApi, unreadExists: () => unreadExists() } };
});

const dot = (c: HTMLElement) => c.querySelector("button[data-notification-toggle] span.bg-nevo-violet");

beforeEach(() => {
  vi.clearAllMocks();
  clearSession();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "a1",
    role: "senco_admin",
  });
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

describe("the notifications dot", () => {
  it("lights whatever the body calls its answer", async () => {
    unreadExists.mockResolvedValue({ unreadExists: true });
    const { container } = render(<AdminSidebar />);
    await waitFor(() => expect(dot(container)).not.toBeNull());
  });

  it("clears when the full page says something was read", async () => {
    unreadExists.mockResolvedValueOnce({ unreadExists: true }).mockResolvedValue({ unreadExists: false });
    const { container } = render(<AdminSidebar />);
    await waitFor(() => expect(dot(container)).not.toBeNull());
    window.dispatchEvent(new Event(READ_STATE_EVENT));
    await waitFor(() => expect(dot(container)).toBeNull());
  });

  it("shows the row as active on the Notifications page", async () => {
    unreadExists.mockResolvedValue({ unreadExists: false });
    const { container } = render(<AdminSidebar />);
    await waitFor(() => expect(unreadExists).toHaveBeenCalled());
    expect(container.querySelector("button[data-notification-toggle]")?.className).toMatch(
      /bg-nevo-navy\/\[0\.08\]/,
    );
  });
});
