import type { PermissionScope } from "@/lib/constants/permissions";
import { scopeName } from "../Team/adminScopes";

/**
 * School Admin navigation model (`Nevo Admin Sidebar`).
 *
 * Eleven items in four groups, in the frame's own order. The group headings
 * show while the rail is expanded; collapsed, a hairline divider stands in for
 * each one.
 *
 * SCOPE FILTERING (Product Arch D.3, "dynamic navigation per scopes held").
 * D03 Admin Team names seven scopes and says what each one grants, and they map
 * 1:1 onto the backend's `PermissionScope` enum:
 *
 *   oversight   "The Overview dashboard and school-wide picture."
 *   roster      "Classes, teachers and students."
 *   curriculum  "The lesson library and uploads."
 *   senco       "Escalations, flags and the IEP Exporter."
 *   it_sso      "Sign-in provider and roster sync."
 *   billing     "Subscription and invoices."
 *   teacher     "A teacher's own console, in addition to admin."
 *
 * Five items map straight out of those sentences. Four are not covered by the
 * catalogue and are marked `inferred` below - a guess, made once, in one place,
 * and flagged to design rather than scattered through the screens.
 */

export interface AdminNavItem {
  label: string;
  href: string;
  /** "" for the ungrouped first item. */
  group: "" | "School" | "Support" | "Administration";
  /** Null means every admin sees it, whatever they hold. */
  scope: PermissionScope | null;
  /** True where D03's catalogue does not settle it - see the docblock. */
  inferred?: boolean;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { label: "Overview", href: "/admin/dashboard", group: "", scope: "oversight" },
  { label: "Classes", href: "/admin/classes", group: "School", scope: "roster" },
  { label: "Teachers", href: "/admin/teachers", group: "School", scope: "roster" },
  { label: "Students", href: "/admin/students", group: "School", scope: "roster" },
  // Invitations create teachers and students, which is what `roster` grants.
  { label: "Invitations", href: "/admin/invitations", group: "School", scope: "roster", inferred: true },
  { label: "Learning Support", href: "/admin/senco", group: "Support", scope: "senco" },
  // Reports are the school-wide picture, which is `oversight`'s own wording.
  { label: "Reports", href: "/admin/reports", group: "Support", scope: "oversight", inferred: true },
  // Administering other admins is school-wide administration; no scope names it.
  { label: "Admin Team", href: "/admin/team", group: "Administration", scope: "oversight", inferred: true },
  { label: "Billing", href: "/admin/billing", group: "Administration", scope: "billing" },
  /*
   * ~~{ label: "IT & SSO", href: "/admin/sso", group: "Administration",
   * scope: "it_sso" },~~ OFF THE RAIL, 24 Sep, and NOT deleted.
   *
   * Provider sign-in is deferred, not dead. Every school is manual for now -
   * school code, CSV upload, staff signing in with their own email and
   * password - and design's instruction was exact: *"Leave the code entirely
   * alone. Remove it from the sidebar so nobody navigates into it, and let
   * direct URL access stand."*
   *
   * THE ROUTES STILL WORK, deliberately. Nothing sets a school to SSO, so the
   * surface is unreachable in practice anyway, and ripping out working code
   * for a deferred feature is churn paid for twice - once now and once when it
   * comes back. Backend's SSO work is untouched for the same reason.
   *
   * Restoring this is one line. That is the point of removing it this way.
   */
  // D12c is "Settings - Your Account": everyone has an account to manage.
  { label: "Settings", href: "/admin/settings", group: "Administration", scope: null, inferred: true },
];

/** The nav an admin holding these scopes actually sees. */
export function navForScopes(scopes: PermissionScope[]): AdminNavItem[] {
  return ADMIN_NAV.filter((i) => i.scope === null || scopes.includes(i.scope));
}

/**
 * The longest matching href wins, so `/admin/settings` does not light up while
 * the reader is on a deeper route that merely starts the same way.
 */
/**
 * Routes that are not nav items but belong to one. D21 and D22 are drill-downs
 * from the Overview, and their frames set the rail's active item to Overview.
 */
const OWNED_BY: Record<string, string> = {
  "/admin/compliance": "Overview",
  "/admin/adaptations": "Overview",
};

export function activeNavLabel(pathname: string): string | null {
  const owner = Object.entries(OWNED_BY).find(
    ([p]) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (owner) return owner[1];
  const hit = [...ADMIN_NAV]
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return hit?.label ?? null;
}

/**
 * The role line under the admin's name. The session gives a `userId` and a
 * role and no name, so the job title half of the frame's "Proprietor · General
 * oversight" is not ours to write - but the scope half is real, and comes
 * straight from `permissions/me`.
 *
 * THE NAMES ARE D03'S CATALOGUE, NOT A COPY OF IT. This kept its own table -
 * "General oversight", "Learning support", "IT & SSO" - while the invite sheet
 * said "General Oversight", "SENCo / Learning Support", "IT / SSO". SCRUM-39's
 * done-when: "Scope names are byte-identical between this screen, the sidebar
 * and the invite sheet." One source makes that true by construction.
 */
export function scopeSummary(scopes: PermissionScope[]): string {
  if (scopes.length === 0) return "No access yet";
  if (scopes.length === 1) return scopeName(scopes[0]);
  if (scopes.includes("oversight")) return scopeName("oversight");
  return `${scopeName(scopes[0])} +${scopes.length - 1}`;
}

/**
 * Where an admin lands after signing in.
 *
 * THE PERSONA HOMES EXIST NOW, and sign-in used to send everyone to the
 * Overview because they did not - see the TODO(screen) this replaces. A
 * finance-only admin landed on a dashboard gated on `oversight`, which they do
 * not hold, so their first sight of Nevo was a refusal.
 *
 * `proxy.ts` CANNOT make this decision and must not try: it reads only the role
 * mirror cookie, and the role is `senco_admin | other_admin`, which says
 * nothing about scopes. `GET /api/v1/permissions/me` is the only source, and
 * `PermissionProvider` already fetches it above every /admin route - so this
 * costs no extra request.
 *
 * Oversight wins when present: a proprietor who also holds billing wants the
 * school, not the invoices.
 */
export function adminHomeForScopes(scopes: PermissionScope[]): string {
  if (scopes.includes("oversight")) return "/admin/dashboard";
  if (scopes.includes("it_sso")) return "/admin/sso/home";
  if (scopes.includes("billing")) return "/admin/billing/home";
  // Whatever their rail offers first, rather than a screen they cannot open.
  return navForScopes(scopes)[0]?.href ?? "/admin/settings";
}
