import { describe, expect, it } from "vitest";
import type { PermissionScope } from "@/lib/constants/permissions";
import { adminHomeForScopes, canOpen, navForScopes } from "./adminNav";

/**
 * Where an admin lands after signing in.
 *
 * Everyone used to land on the Overview, which is gated on `oversight` — so an
 * IT contractor or a finance administrator met a refusal as their first sight
 * of Nevo. These pin that each persona now lands somewhere they can actually
 * open.
 */
const scopes = (...s: string[]) => s as PermissionScope[];

describe("adminHomeForScopes", () => {
  it("sends an oversight admin to the Overview", () => {
    expect(adminHomeForScopes(scopes("oversight", "roster"))).toBe("/admin/dashboard");
  });

  it("prefers the Overview when someone holds oversight AND another scope", () => {
    // A proprietor who also holds billing wants the school, not the invoices.
    expect(adminHomeForScopes(scopes("billing", "oversight"))).toBe("/admin/dashboard");
  });

  it("sends an IT-only admin to the Overview, like everyone else (6 Oct ruling)", () => {
    // Not D17 any more: provider sign-in is deferred, so that home was about
    // nothing a manual school uses.
    expect(adminHomeForScopes(scopes("it_sso"))).toBe("/admin/dashboard");
  });

  it("sends a billing-only admin to their own home", () => {
    expect(adminHomeForScopes(scopes("billing"))).toBe("/admin/billing/home");
  });

  it("falls back to whatever their rail offers first", () => {
    // Never a screen they cannot open.
    const home = adminHomeForScopes(scopes("roster"));
    expect(home).not.toBe("/admin/dashboard");
    expect(home.startsWith("/admin/")).toBe(true);
  });

  it("has somewhere to send an admin holding no scopes at all", () => {
    expect(adminHomeForScopes(scopes())).toMatch(/^\/admin\//);
  });
});

/**
 * The 6 Oct ruling, built to what the server allows ("option 1"): an IT admin
 * sees every screen the backend serves to any admin, and nothing it refuses.
 */
describe("an IT / SSO admin's rail", () => {
  const labels = (s: PermissionScope[]) => navForScopes(s).map((i) => i.label);

  it("adds the school's screens any admin may read", () => {
    expect(labels(scopes("it_sso"))).toEqual([
      "Overview",
      "Classes",
      "Teachers",
      "Students",
      "Invitations",
      "Settings",
    ]);
  });

  it("keeps out what the server refuses without the scope", () => {
    const rail = labels(scopes("it_sso"));
    for (const refused of ["Learning Support", "Billing", "Admin Team", "Reports"]) {
      expect(rail).not.toContain(refused);
    }
  });

  it("changes nothing for an admin without IT", () => {
    // A finance admin's rail is still theirs alone.
    expect(labels(scopes("billing"))).toEqual(["Billing", "Settings"]);
  });
});

describe("canOpen", () => {
  it("is true for a screen on this admin's rail", () => {
    expect(canOpen("/admin/students", scopes("it_sso"))).toBe(true);
    expect(canOpen("/admin/students/s1", scopes("roster"))).toBe(true);
  });

  it("is false for a screen the rail leaves out - no link to a refusal", () => {
    // The founding admin holds everything but SENCo.
    expect(canOpen("/admin/senco", scopes("oversight", "roster", "billing"))).toBe(false);
    expect(canOpen("/admin/billing", scopes("it_sso"))).toBe(false);
  });

  it("holds an Overview drill-down to its own scope, not the Overview's", () => {
    expect(canOpen("/admin/compliance", scopes("it_sso"))).toBe(false);
    expect(canOpen("/admin/adaptations", scopes("it_sso"))).toBe(false);
    expect(canOpen("/admin/compliance", scopes("oversight"))).toBe(true);
  });

  it("does not gate routes that are not rail screens", () => {
    expect(canOpen("/admin/roster", scopes("it_sso"))).toBe(true);
  });
});
