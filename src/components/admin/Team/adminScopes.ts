import type { EnrolmentBand } from "@/lib/api/school";

import {
  ALL_PERMISSION_SCOPES,
  type PermissionScope,
} from "@/lib/constants/permissions";

/**
 * The scope vocabulary as D03 writes it, keyed to the backend enum.
 *
 * The frame is explicit that these names are load-bearing: "the same scope
 * names appear everywhere, so a person recognises them whether they're being
 * invited here or applied elsewhere". So this is the one place they are
 * written, and every admin surface reads them from here.
 *
 * Order matters too - it is the order the invite panel lists them in.
 */

export interface ScopeDescriptor {
  scope: PermissionScope;
  name: string;
  desc: string;
  /** Ticked by default in the invite panel. */
  defaultOn: boolean;
}

export const SCOPE_CATALOGUE: ScopeDescriptor[] = [
  {
    scope: "oversight",
    name: "General Oversight",
    desc: "The Overview dashboard and school-wide picture.",
    defaultOn: true,
  },
  {
    scope: "roster",
    name: "Roster",
    desc: "Classes, teachers and students.",
    defaultOn: true,
  },
  {
    scope: "curriculum",
    name: "Curriculum",
    desc: "The lesson library and uploads.",
    defaultOn: false,
  },
  {
    scope: "senco",
    name: "SENCo / Learning Support",
    desc: "Escalations, flags and the IEP Exporter.",
    defaultOn: false,
  },
  {
    scope: "it_sso",
    name: "IT / SSO",
    desc: "Sign-in provider and roster sync.",
    defaultOn: false,
  },
  {
    scope: "billing",
    name: "Billing",
    desc: "Subscription and invoices.",
    defaultOn: false,
  },
  {
    scope: "teacher",
    name: "Teacher",
    desc: "A teacher's own console, in addition to admin.",
    defaultOn: false,
  },
];

const BY_SCOPE = new Map(SCOPE_CATALOGUE.map((s) => [s.scope, s]));

export function scopeName(scope: PermissionScope): string {
  return BY_SCOPE.get(scope)?.name ?? scope;
}

/** Catalogue order, so a person's pills always read in the same sequence. */
export function orderScopes(scopes: PermissionScope[]): PermissionScope[] {
  return ALL_PERMISSION_SCOPES.filter((s) => scopes.includes(s)).sort(
    (a, b) =>
      SCOPE_CATALOGUE.findIndex((c) => c.scope === a) -
      SCOPE_CATALOGUE.findIndex((c) => c.scope === b),
  );
}

/**
 * D03: "Brightgate Academy includes five admin accounts as standard."
 *
 * FIVE IS THE BOUTIQUE NUMBER, NOT EVERY SCHOOL'S. Onboarding's band step
 * tells a school its allowance in its own words - "Mid-Market comes with 10
 * admin seats" - and this file then asserted five to all of them. A 10-seat
 * school was told "All five admin accounts are in use" at its fifth admin and
 * had the Invite button taken away; a school already holding six read "6 of 5
 * admin accounts" with six rows listed underneath it.
 *
 * The band was the school's own answer, written at onboarding and readable
 * from the school record, so the allowance is derived from it. The band step
 * has since gone with flat pricing, so a school onboarded after it has no band
 * and gets no cap asserted (see `adminSeatAllowance`). Whether the cap still
 * exists at all is with design.
 *
 * TODO(api): a seat allowance on the team response. The table below is the
 * client's copy of a commercial fact it does not own, and it is only right for
 * as long as the two agree.
 */

/** SCRUM-98's per-band admin seat defaults for v1. */
const SEATS_BY_BAND: Record<EnrolmentBand, number> = {
  boutique: 5,
  mid_market: 10,
  premium: 15,
  enterprise: 25,
};

/**
 * The school's allowance, or null when we cannot say.
 *
 * Null is not a number to fall back on. A school whose band we could not read
 * gets no cap asserted and no invite path closed, because guessing low locks
 * an admin out of their own team and guessing high promises seats they may
 * not have.
 */
export function adminSeatAllowance(band: EnrolmentBand | undefined): number | null {
  return band ? (SEATS_BY_BAND[band] ?? null) : null;
}

/** "Mrs. F. Adebayo" -> "FA"; falls back to the email's first letter. */
export function initialsFor(name: string, email: string | null): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  // "Mrs." and the like carry no identity - skip an honorific if one leads.
  const useful = words.filter((w) => !/^(mr|mrs|ms|miss|dr|prof)\.?$/i.test(w));
  const parts = useful.length ? useful : words;
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (email?.[0] ?? "?").toUpperCase();
}
