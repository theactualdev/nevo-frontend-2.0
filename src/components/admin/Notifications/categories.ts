import type { PermissionScope } from "@/lib/constants/permissions";

/**
 * Notification categories, as the ADMIN console can actually offer them.
 *
 * ============================================================================
 * DESIGN AND BACKEND NAME DIFFERENT SETS. This is the central problem on this
 * screen and it is worth stating plainly rather than papering over.
 *
 * SCRUM-100 specifies six admin categories:
 *     Consent · Roster · Billing · SSO · Teacher · Platform
 *
 * The backend's `NotificationCategory` enum - enumerated on 1 Sep 2026, and a
 * 422 for anything outside it - is:
 *     assignments · messages · attention · reports · consent · billing · account
 *
 * Only CONSENT and BILLING appear in both. `account` is close enough to
 * Platform to carry it. ROSTER, SSO and TEACHER have no enum value at all, so
 * three of the six rows the spec asks for cannot be saved and are not drawn.
 * The other four enum values are teacher-console streams; an admin who also
 * holds the `teacher` scope genuinely receives them, so they appear for that
 * admin and nobody else.
 *
 * Adding `roster`, `sso` and `teacher` to the enum is what completes D13.4.
 * Raised with backend.
 * ============================================================================
 *
 * The scope map below is NOT guesswork - SCRUM-100's "Who receives what" sets
 * it out: "A billing event reaches admins holding billing; an SSO event
 * reaches it_sso; roster and consent reach roster; teacher reaches roster or
 * senco; platform reaches everyone."
 */

export const ADMIN_CATEGORIES = [
  "consent",
  "billing",
  "account",
  "attention",
  "messages",
  "assignments",
  "reports",
] as const;

export type AdminCategory = (typeof ADMIN_CATEGORIES)[number];

export interface CategoryMeta {
  key: AdminCategory;
  name: string;
  /** One plain line saying what it covers, per D13b's row anatomy. */
  description: string;
  /** Null means every admin sees it, whatever they hold. */
  scope: PermissionScope | null;
  /**
   * Email that cannot be turned off.
   *
   * SCRUM-100 names three fixed kinds - security, legal/compliance, and
   * billing-critical - and says the list is SERVER-HELD, not a client one.
   * No endpoint exposes it, so this is our reading of those three onto the
   * enum: `account` is security, `consent` is the legal obligation, `billing`
   * is billing-critical. It is an inference, and the server remains the
   * authority: a save it refuses reverts the toggle and says so, rather than
   * this list being treated as the truth.
   *
   * Fixed is PER CHANNEL, not per category - the email is the obligation, the
   * in-app row is a convenience, so the in-app toggle stays writable.
   */
  fixedEmail: boolean;
}

export const CATEGORY_META: Record<AdminCategory, CategoryMeta> = {
  consent: {
    key: "consent",
    name: "Consent",
    description: "When a parent confirms, withdraws, or hasn't replied for a while",
    scope: "roster",
    fixedEmail: true,
  },
  billing: {
    key: "billing",
    name: "Billing",
    description: "Invoices, payments recorded, and when a renewal window opens",
    scope: "billing",
    fixedEmail: true,
  },
  account: {
    key: "account",
    name: "Platform", // SCRUM-100's name (Lydia, 7 Oct: the names people read are ours)
    description: "Maintenance, changes to screens you use, and policy updates",
    scope: null,
    fixedEmail: true,
  },
  attention: {
    key: "attention",
    name: "Something changed suddenly",
    description: "When a student's pattern shifts enough to be worth a look",
    scope: "teacher",
    fixedEmail: false,
  },
  messages: {
    key: "messages",
    name: "Messages",
    description: "New replies in your threads",
    scope: "teacher",
    fixedEmail: false,
  },
  assignments: {
    key: "assignments",
    name: "Assignments",
    description: "When work you set is handed in or falls due",
    scope: "teacher",
    fixedEmail: false,
  },
  reports: {
    key: "reports",
    name: "Weekly summary",
    description: "The calm Monday overview",
    scope: "teacher",
    fixedEmail: false,
  },
};

/**
 * The categories an admin holding these scopes actually sees.
 *
 * Absent, not disabled - the same structural rule as the sidebar. A bursar
 * holding billing alone sees Billing and Platform, and the page does not look
 * broken for it.
 */
export function categoriesForScopes(scopes: PermissionScope[]): CategoryMeta[] {
  return ADMIN_CATEGORIES.map((k) => CATEGORY_META[k]).filter(
    (c) => c.scope === null || scopes.includes(c.scope),
  );
}

/**
 * The line under the preferences heading, which changes with how much the
 * admin looks after. A bursar should not be told they are seeing a filtered
 * list; they should be told this is what theirs covers.
 */
export function preferencesIntro(visible: CategoryMeta[], scopes: PermissionScope[]): string {
  if (scopes.includes("oversight") || visible.length > 4) {
    return "Choose what reaches you, and how. This is yours alone; other admins set their own.";
  }
  const named = visible.filter((c) => c.scope !== null).map((c) => c.name.toLowerCase());
  if (named.length === 1) {
    return `You look after ${named[0]}, so that's what's here.`;
  }
  return "Choose what reaches you, and how. You only see the areas your access covers.";
}

/**
 * What a notification row is labelled: its category's own name, from the same
 * table the preferences use. NULL when the server gave no category, or one
 * this console does not show - and then the row carries no label at all. It
 * used to print the raw `type` instead, which could put an engine event name
 * ("MODALITY SHIFT") in front of an admin.
 */
export function categoryLabel(category: string | null | undefined): string | null {
  return category && category in CATEGORY_META
    ? CATEGORY_META[category as AdminCategory].name
    : null;
}
