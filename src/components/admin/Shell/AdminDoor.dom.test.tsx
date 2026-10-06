import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
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

let perms = { scopes: [] as string[], resolved: true, status: "ready" };
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => perms }));

beforeEach(() => replace.mockReset());

describe("the admin door", () => {
  it("opens an IT admin on the Overview (6 Oct ruling)", async () => {
    perms = { scopes: ["it_sso"], resolved: true, status: "ready" };
    render(<AdminRootPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/dashboard"));
  });

  it("opens on the Overview when the permissions read failed, not on Settings", async () => {
    perms = { scopes: [], resolved: true, status: "failed" };
    render(<AdminRootPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/dashboard"));
    expect(replace).not.toHaveBeenCalledWith("/admin/settings");
  });

  it("waits while permissions have not answered", () => {
    perms = { scopes: [], resolved: false, status: "loading" };
    render(<AdminRootPage />);
    expect(replace).not.toHaveBeenCalled();
  });
});
