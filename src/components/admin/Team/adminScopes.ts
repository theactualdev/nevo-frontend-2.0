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
  /**
   * False for a scope that is no longer handed out. It still has a name, so an
   * admin who already holds it sees it - and can untick it - but nobody new
   * is given it.
   */
  grantable?: false;
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
    // NOT GRANTED (Lydia, 7 Oct): no admin screen sits behind it, and "a
    // permission that opens nothing is a defect rather than a feature".
    grantable: false,
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
 * FIVE, FOR EVERY SCHOOL, RULED (Lydia, 7 Oct): "The five-admin cap stays and
 * is enforced ... it exists to control who can reach student data rather than
 * to sell seats. More are available on request at no charge." It used to
 * follow the onboarding band (5 / 10 / 15 / 25); the band went with flat
 * pricing, and a school onboarded since then was shown no cap at all.
 *
 * THE ALLOWANCE IS THE SERVER'S NOW (8 Oct). `GET /admin/team` carries
 * `seatLimit`, `seatsUsed` and `seatsRemaining`, overrides included, and a
 * sixth invitation past the limit is refused with `admin_seat_limit_reached`.
 * Five is only the standard the copy names when the server's limit is five.
 */
export const ADMIN_SEATS_STANDARD = 5;

/** "five" for the standard allowance, the figure for any other. */
export function seatWords(limit: number): string {
  return limit === ADMIN_SEATS_STANDARD ? "five" : String(limit);
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
