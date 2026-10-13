import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminRootPage from "@/app/admin/page";

/**
 * `/admin`, the console's door: where an admin opens, by what they hold.
 *
 * A failed permissions read reports itself resolved with no scopes. Taken as
 * fact, that sent a proprietor to the scope-less fallback - Settings - because
 * one GET blipped.
 */

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const refresh = vi.fn();
let perms = { scopes: [] as string[], resolved: true, status: "ready", refresh };
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => perms }));

beforeEach(() => replace.mockReset());

describe("the admin door", () => {
  it("opens an IT admin on their Systems overview - IT stays narrow (6 Oct)", async () => {
    perms = { scopes: ["it_sso"], resolved: true, status: "ready", refresh };
    render(<AdminRootPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/sso/home"));
  });

  it("opens nothing when the permissions read failed, and offers to check again", async () => {
    // Not Settings (a proprietor's password form), and not the Overview (wider
    // than an IT admin may see): it cannot know which, so it says so.
    perms = { scopes: [], resolved: true, status: "failed", refresh };
    render(<AdminRootPage />);
    expect(screen.getByText(/couldn.t check which parts of the console you can see/)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("waits while permissions have not answered", () => {
    perms = { scopes: [], resolved: false, status: "loading", refresh };
    render(<AdminRootPage />);
    expect(replace).not.toHaveBeenCalled();
  });
});
