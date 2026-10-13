import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NoAccess, failureKind } from "./NoAccess";
import { ApiError } from "@/lib/api/client";

/** The admin's scopes, and whether permissions have answered yet. */
let scopes: string[] = [];
let status = "ready";
let pathname = "/admin/team";
vi.mock("@/context/PermissionContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/context/PermissionContext")>();
  const { createContext } = await import("react");
  return {
    ...actual,
    PermissionContext: createContext({
      get scopes() {
        return scopes;
      },
      get resolved() {
        return status !== "loading";
      },
      get status() {
        return status;
      },
      refresh: () => {},
    } as never),
  };
});
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
beforeEach(() => {
  scopes = [];
  status = "ready";
  pathname = "/admin/team";
});

/**
 * A 403 is a permission decision, not a broken read, and the two want different
 * words and different affordances.
 *
 * The harm being fixed was double: every scope-gated screen blamed the system
 * for a decision it had not made ("we couldn't load this... try again"), AND
 * offered a retry that cannot succeed. An admin would sit pressing it.
 */

const shown = (c: HTMLElement) => (c.textContent ?? "").replace(/\u2019/g, "'");

describe("failureKind", () => {
  it("calls only a 403 denied", () => {
    expect(failureKind(new ApiError(403, "nope"))).toBe("denied");
  });

  it("treats everything else as a failure the admin can retry", () => {
    // 401 never reaches a screen - the client ends the session first - but if
    // it did, it is not a scope problem.
    for (const status of [401, 404, 500, 502, 0]) {
      expect(failureKind(new ApiError(status, "x"))).toBe("failed");
    }
    expect(failureKind(new Error("network"))).toBe("failed");
    expect(failureKind(undefined)).toBe("failed");
  });
});

describe("NoAccess", () => {
  it("says it is about access, not about a failure", () => {
    const t = shown(render(<NoAccess what="the admin team" />).container);
    expect(t).toMatch(/don't have access to the admin team/i);
    expect(t).not.toMatch(/couldn't load|went wrong|try again/i);
  });

  it("offers no retry - a refused scope does not become granted by asking", () => {
    const { container } = render(<NoAccess what="billing" />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("points at who can change it, and uses no alarm colour", () => {
    const { container } = render(<NoAccess what="reports" />);
    expect(shown(container)).toMatch(/manages permissions/i);
    expect(container.innerHTML).not.toMatch(/red|rose|danger|destructive/);
  });
});

describe("the way back", () => {
  /*
   * A refusal used to be a dead end. The way back is this admin's OWN home -
   * not the Overview for everyone, which a finance admin cannot open.
   */
  it("leads an IT admin to their Systems overview, not the school's Overview", () => {
    scopes = ["it_sso"];
    render(<NoAccess what="the admin team" />);
    expect(screen.getByRole("link", { name: "Go to Systems overview" })).toHaveAttribute(
      "href",
      "/admin/sso/home",
    );
  });

  it("leads a proprietor to the Overview", () => {
    scopes = ["oversight", "roster"];
    render(<NoAccess what="learning support" />);
    expect(screen.getByRole("link", { name: "Go to Overview" })).toHaveAttribute("href", "/admin/dashboard");
  });

  it("leads a finance admin to Billing, not to a screen that refuses them too", () => {
    scopes = ["billing"];
    render(<NoAccess what="the admin team" />);
    expect(screen.getByRole("link", { name: "Go to Billing" })).toHaveAttribute("href", "/admin/billing/home");
  });

  it("offers nothing while permissions have not answered", () => {
    scopes = ["it_sso"];
    status = "loading";
    render(<NoAccess what="the admin team" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("offers nothing when the permissions read failed - that is not \"holds nothing\"", () => {
    // The context reports a failed read as resolved with no scopes. Read as
    // fact, it would send a proprietor to the scope-less fallback.
    scopes = [];
    status = "failed";
    render(<NoAccess what="the admin team" />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("offers nothing when they are already there", () => {
    scopes = ["billing"];
    pathname = "/admin/billing/home";
    render(<NoAccess what="the invoices" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
