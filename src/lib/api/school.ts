import { api } from "./client";

/**
 * The school record, and the sign-up that creates one (D1 · SCRUM-39).
 *
 * ============================================================================
 * ONBOARDING ANSWERS WITH NO FIELD OF THEIR OWN LIVE IN `profile`.
 *
 * SCRUM-39 asked for three: `PATCH school.authMethod`, `PATCH school.band`,
 * and a DPA acceptance. Two have resolved since. The DPA acceptance is a typed
 * record (7 Sep, `GET/POST /school/dpa-acceptance` - see `acceptDpa`), and the
 * band is retired with flat pricing. Only `authMethod` is left, and its step
 * is deferred with SSO and kept off the flow.
 *
 * `PATCH /api/v1/school` accepts only `{name, profile, academicConfig,
 * retentionPolicy}`, and `profile` is an untyped `object`, so what remains is
 * written under its `onboarding` key, with the shape below. THIS IS A
 * PROVISIONAL CONTRACT that backend needs to ratify or replace. Nothing
 * validates these keys, so a typo is silent: they are written through
 * `ONBOARDING_PROFILE_KEY` and this interface, never inline.
 * ============================================================================
 */

export const ONBOARDING_PROFILE_KEY = "onboarding" as const;

/** Set once at D1.2 and irreversible in v1. */
export type SchoolAuthMethod = "microsoft" | "google" | "manual";

/**
 * The single band taxonomy (SCRUM-39 D1.4). These exact names are used in
 * onboarding, in SCRUM-98 billing and in contract conversations; the older
 * Specialised-Small / Mid-Sized Premium / Mega-Campus shorthand is retired and
 * must not appear in any payload, enum or label.
 */
export type EnrolmentBand = "boutique" | "mid_market" | "premium" | "enterprise";

export interface OnboardingProfile {
  authMethod?: SchoolAuthMethod;
  band?: EnrolmentBand;
  /**
   * RETIRED (7 Sep) - acceptance is a typed record now, see `acceptDpa`. These
   * two remain on the type ONLY so a school onboarded before the change can
   * still be read back without the parse dropping fields it does not know.
   * Nothing writes them.
   */
  dpaVersion?: string;
  dpaAcceptedAt?: string;
  /** Whether the wizard ran to the end, so a resumed session knows. */
  completedAt?: string;
}

export interface School {
  id: string;
  name: string;
  /** The join code manual schools hand out. Null for SSO schools. */
  code: string | null;
  slug: string | null;
  profile: Record<string, unknown>;
  academicConfig: Record<string, unknown>;
  retentionPolicy: string;
  retentionDays: number;
}

/** Read our provisional block back off a school record. */
export function readOnboarding(school: School): OnboardingProfile {
  const raw = school.profile?.[ONBOARDING_PROFILE_KEY];
  return raw && typeof raw === "object" ? (raw as OnboardingProfile) : {};
}

/**
 * The board summary, written from the school's own data.
 *
 * `source` is a CONST `"live_school_data"` in the contract, which is the whole
 * point: the Overview used to lead with D04's sample paragraph under a note
 * admitting the figures were not this school's. There is now a real one.
 */
export interface SchoolNarrative {
  headline: string;
  summary: string;
  highlights: string[];
  generatedAt: string;
  source?: string;
}

/**
 * Roster counts, typed at last - this was an untyped `{[k: string]: number}`
 * bag until 7 Sep.
 *
 * ACTIVE AND INVITED ARE SEPARATE POPULATIONS and must not be summed for a seat
 * count; backend was explicit about that. Every field is optional in the
 * contract, so a missing count reads as unknown rather than as zero.
 */
export interface SchoolRosterCounts {
  activeStudents?: number;
  invitedStudents?: number;
  teachers?: number;
  sencoAdmins?: number;
  otherAdmins?: number;
  classes?: number;
}

export interface SchoolOverview {
  schoolId: string;
  counts: SchoolRosterCounts;
}

export interface DpaAcceptance {
  id: string;
  schoolId: string;
  version: string;
  acceptedByUserId: string;
  acceptedByName: string;
  acceptedAt: string;
}

/** What `POST /schools/register` answers with. */
export interface SchoolRegistration {
  schoolId: string;
  adminId: string;
  /** The code everyone signs in with until an identity provider is connected. */
  schoolCode: string;
}

/* -------------------------------------------------------------- SETTINGS */

/**
 * Data retention, and these are the API's own three values - the pattern on
 * `SchoolPatch.retentionPolicy` is
 * `^(contract|contract_plus_3_years|contract_plus_7_years)$`.
 *
 * D12 offers "12 months" as an option. There is no enum value for it, so it
 * is not offered. Raised with backend rather than mapped onto something close.
 */
export type RetentionPolicy =
  | "contract"
  | "contract_plus_3_years"
  | "contract_plus_7_years";

/**
 * The contact details D12 edits.
 *
 * Only `name` has a column of its own. Email, phone and location go into
 * `profile` alongside the onboarding block - the same provisional-contract
 * caveat applies, and for the same reason.
 */
export interface SchoolContact {
  contactEmail?: string;
  contactPhone?: string;
  location?: string;
}

export const CONTACT_PROFILE_KEY = "contact" as const;

export function readContact(school: School): SchoolContact {
  const raw = school.profile?.[CONTACT_PROFILE_KEY];
  return raw && typeof raw === "object" ? (raw as SchoolContact) : {};
}

/** One term in the school year (D12b). */
export interface SchoolTerm {
  id: string;
  name: string;
  start: string;
  end: string;
  /**
   * The optional half-term break, as the spec's own pair.
   *
   * WAS `halfTermBreak?: boolean`, which nothing wrote and nothing read - a
   * flag saying a break exists, with no way to say when, on the screen whose
   * whole job is to say when. SCRUM-99's data line is
   * `terms:[{name,start,end,half_term_start?,half_term_end?}]`.
   *
   * CAMEL CASE BECAUSE THIS FIELD IS OURS. The deployed `AcademicConfig`
   * types `termStartDates` and nothing else, with `additionalProperties: true`
   * and a description saying so outright: "Only the field the backend actually
   * reads is named. Anything else a school has stored is passed through
   * untouched." Every other key on this interface is a client invention stored
   * in that blob, and they are camelCase; these two match them.
   */
  halfTermStart?: string;
  halfTermEnd?: string;
}

/**
 * The academic shape of a school year, and the per-school year-group labels
 * SCRUM-99 owns.
 *
 * HALF TYPED NOW, AND THE TYPED HALF IS THE ONE THAT BILLS. Backend gave
 * `academicConfig` a schema on 15 Sep: `termStartDates`, up to three ISO
 * dates, which per-term billing invoices from. A malformed date is a 422
 * instead of being silently swallowed - a school that mistyped one used to be
 * invoiced on dates it never chose.
 *
 * The schema keeps `additionalProperties: true`, so the fields below still
 * pass through untouched and remain OURS - a provisional contract, the third
 * in this codebase after the onboarding block and the school contact. That is
 * fine for labels and less fine for anything money or dates depend on, which
 * is exactly the half that has now been lifted out.
 *
 * `yearGroupLabels` is the one the rest of the product waited on:
 * `lib/constants/yearGroups.ts` reads it from here.
 */
export interface AcademicConfig {
  /**
   * Term starts, earliest first, at most three - the backend's own field, and
   * the only one here it validates. ISO dates (`2026-09-08`), not date-times.
   */
  termStartDates?: string[];
  yearStart?: string;
  yearEnd?: string;
  terms?: SchoolTerm[];
  /** Partial: only the levels a school has actually renamed. */
  yearGroupLabels?: Record<string, string>;
  /** Which preset the labels came from, so the UI can say "custom". */
  taxonomyPreset?: string;
}

/**
 * Term starts, or an empty list.
 *
 * Guarded rather than trusted: `additionalProperties: true` means anything can
 * be in this object, and a school configured before the field existed has no
 * `termStartDates` at all. A non-array, or entries that are not strings, read
 * as none rather than throwing on a screen that is only showing dates.
 */
export function termStartDates(config: AcademicConfig): string[] {
  const raw = config.termStartDates;
  if (!Array.isArray(raw)) return [];
  return raw.filter((d): d is string => typeof d === "string" && d.length > 0);
}

export function readAcademic(school: School): AcademicConfig {
  const raw = school.academicConfig;
  return raw && typeof raw === "object" ? (raw as AcademicConfig) : {};
}

export const schoolApi = {
  /**
   * The school's DPA acceptance - a compliance record, and now a typed one.
   *
   * It used to be written into `profile.onboarding` as `{dpaVersion,
   * dpaAcceptedAt}`: an untyped blob on a school row, with no admin id, that
   * nothing could read back. D12 and D22 both display which version a school
   * agreed to, so that record mattered more than anything else the wizard
   * stored and was the worst-kept of the three.
   */
  dpaAcceptance: () =>
    api.get<DpaAcceptance>("/api/v1/school/dpa-acceptance"),
  acceptDpa: (version: string) =>
    api.post<DpaAcceptance>("/api/v1/school/dpa-acceptance", { version }),
  narrative: () => api.get<SchoolNarrative>("/api/v1/school/narrative"),
  overview: () => api.get<SchoolOverview>("/api/v1/school/overview"),
  /**
   * Create the school and its founding admin. PUBLIC - this is the one call in
   * the admin surface made before any session exists.
   *
   * IT RETURNS A BODY, and this was typed `void`. `SchoolRegistrationResponse`
   * carries `{schoolId, adminId, schoolCode}`, all required - three facts the
   * onboarding wizard was throwing away, including the join code the school
   * signs in with.
   *
   * A SECOND DOCBLOCK USED TO SIT ABOVE THIS ONE SAYING THE OPPOSITE - "the
   * schema declares a 201 with NO PROPERTIES" - and the two were adjacent,
   * which is how long a corrected note can sit beside the thing it corrected
   * without anyone deleting the original. Its one surviving claim is kept
   * here:
   *
   * TODO(api): still no SESSION on the 201. SCRUM-39 expects one and the
   * wizard needs it to write the later steps, so it signs in with the
   * credentials just submitted - which works, but is a second round trip a
   * returned session would remove. See `SignUpStep`, which tells the two
   * round trips apart.
   */
  register: (payload: {
    schoolName: string;
    adminName: string;
    email: string;
    password: string;
  }) =>
    api.post<SchoolRegistration>("/api/v1/schools/register", payload),

  get: () => api.get<School>("/api/v1/school"),

  update: (payload: {
    name?: string | null;
    profile?: Record<string, unknown> | null;
    academicConfig?: Record<string, unknown> | null;
    retentionPolicy?: string | null;
  }) => api.patch<School>("/api/v1/school", payload),

  /**
   * Merge a patch into the onboarding block without clobbering the rest of
   * `profile`. Read-modify-write, because the endpoint replaces `profile`
   * wholesale rather than merging it.
   */
  saveOnboarding: async (patch: OnboardingProfile) => {
    const school = await schoolApi.get();
    const next = { ...readOnboarding(school), ...patch };
    return schoolApi.update({
      profile: { ...school.profile, [ONBOARDING_PROFILE_KEY]: next },
    });
  },


  /** Merge into `profile.contact` without clobbering the rest of `profile`. */
  saveContact: async (patch: SchoolContact) => {
    const school = await schoolApi.get();
    const next = { ...readContact(school), ...patch };
    return schoolApi.update({
      profile: { ...school.profile, [CONTACT_PROFILE_KEY]: next },
    });
  },

  /** Merge into `academicConfig`, which we own wholesale. */
  saveAcademic: async (patch: AcademicConfig) => {
    const school = await schoolApi.get();
    return schoolApi.update({
      academicConfig: { ...readAcademic(school), ...patch },
    });
  },

  /** Where the provider consent screen lives, for the SSO handover. */
  ssoStart: (schoolSlug: string, provider: string) =>
    api.get<{ authorizationUrl: string; schoolEntryUrl: string }>(
      `/api/v1/schools/${schoolSlug}/sso/${provider}/start`,
    ),
};
