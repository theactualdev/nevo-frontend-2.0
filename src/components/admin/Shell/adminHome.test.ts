import { describe, expect, it } from "vitest";
import type { PermissionScope } from "@/lib/constants/permissions";
import { adminHomeForScopes, canOpen, homeName, navForScopes } from "./adminNav";

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

  it("sends an IT-only admin to their own Systems overview, not the school's", () => {
    // Lydia, 6 Oct: IT admins stay narrow. The Overview is the school's.
    expect(adminHomeForScopes(scopes("it_sso"))).toBe("/admin/sso/home");
    expect(homeName("/admin/sso/home")).toBe("Systems overview");
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
 * Lydia, 6 Oct: IT admins see what their own scope gives them and nothing
 * wider. An earlier ruling that day widened this rail to every screen the
 * backend serves any admin; it was withdrawn, and this pins the narrowing.
 */
describe("an IT / SSO admin's rail", () => {
  const labels = (s: PermissionScope[]) => navForScopes(s).map((i) => i.label);

  it("stays narrow - the school's screens are not an IT admin's", () => {
    const rail = labels(scopes("it_sso"));
    for (const school of ["Overview", "Classes", "Teachers", "Students", "Invitations"]) {
      expect(rail).not.toContain(school);
    }
  });

  it("never reaches Learning Support, Billing, the Admin Team or Reports", () => {
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
    expect(canOpen("/admin/students", scopes("roster"))).toBe(true);
    expect(canOpen("/admin/students/s1", scopes("roster"))).toBe(true);
  });

  it("is false for a screen the rail leaves out - no link to a refusal", () => {
    // The founding admin holds everything but SENCo.
    expect(canOpen("/admin/senco", scopes("oversight", "roster", "billing"))).toBe(false);
    expect(canOpen("/admin/billing", scopes("it_sso"))).toBe(false);
    expect(canOpen("/admin/students", scopes("it_sso"))).toBe(false);
  });

  it("holds an Overview drill-down to its own scope, not the Overview's", () => {
    // An admin who holds the Overview's scope but not a drill-down's.
    expect(canOpen("/admin/dashboard", scopes("oversight"))).toBe(true);
    expect(canOpen("/admin/compliance", scopes("roster"))).toBe(false);
    expect(canOpen("/admin/adaptations", scopes("roster"))).toBe(false);
    expect(canOpen("/admin/compliance", scopes("oversight"))).toBe(true);
  });

  it("does not gate routes that are not rail screens", () => {
    expect(canOpen("/admin/roster", scopes("it_sso"))).toBe(true);
  });
});
