import { api } from "./client";

/**
 * The two school-wide admin reads behind the Overview: the NDPA compliance
 * position, and the adaptation log that sits behind "what has Nevo changed".
 *
 * Between them they are the only endpoints that hand an admin real school-level
 * numbers - `mastery/school/{id}` returns concept aggregates keyed by uuids
 * nothing resolves to a name, so it cannot be rendered.
 */

/**
 * One thing the scan turned up, as a locator into the store.
 *
 * The spec's shape exactly: four required strings, no severity and no
 * category, so findings cannot be ranked or graded - the screen may only
 * count them.
 *
 * CAUTION: `term` is the matched text. On a scan for diagnostic labels that
 * is likely to BE a diagnostic label, which is the one category of string
 * this product may never put on screen. Nothing renders a finding's contents
 * today, and nothing should start without design ruling on `term` first.
 */
/**
 * A finding, with the two fields counsel forbade REMOVED AT THE BOUNDARY.
 *
 * Counsel cleared this screen on 14 Sep with four rules. Two of them are
 * subtractive: never show the flagged `term`, and never show the `recordId`,
 * which ties a finding to an identifiable child. The wire carries both - all
 * four fields are required on `ComplianceFindingResponse` - so they are
 * stripped in `stripFinding` below rather than merely left unrendered.
 *
 * WHY STRIP RATHER THAN DECLINE TO RENDER. A field that is in React state is
 * one `{JSON.stringify(finding)}` away from a screen, one debug log away from
 * a console, and one props-spread away from an attribute. The rule is easier
 * to keep if the data is not there. This type is what the rest of the console
 * is allowed to know a finding is.
 */
export interface ComplianceFinding {
  /** Which table the scan matched in. A database locator, not a category. */
  table: string;
  /** Which column. Also a locator - see the note on category in the view. */
  field: string;
}

export interface ComplianceAudit {
  schoolId: string;
  /** The only reliably reachable school NAME for an admin. */
  schoolName: string;
  generatedAt: string;
  studentsProfiled: number;
  adaptationEventsLogged: number;
  /** The NDPA claim the compliance card is built on: this should be 0. */
  diagnosticLabelsStored: number;
  compliant: boolean;
  findings: ComplianceFinding[];
}

export interface AdaptationEventRow {
  id: string;
  studentId: string;
  studentFirstName: string;
  lessonId: string;
  lessonTitle: string;
  timestamp: string;
  trigger: string;
  adaptation: string;
  eventType: string;
  /**
   * What the lesson was either side of the change (D21's expanded row), as
   * the server words it - null when it has no pair for that kind of event.
   * Words, never engine values: a format ("Text", "Audio") for a change of
   * format on that lesson, or "Original" / "Simplified", "Core" / "Expanded",
   * "Standard pace" / "Slower pace", "Lesson flow" / "Break suggested"
   * (`adaptation_before_after`, backend `intelligence/adaptation_log.py`).
   */
  before?: string | null;
  after?: string | null;
}

export interface AdaptationLog {
  events: AdaptationEventRow[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * The eight kinds of adaptation the log reports, as the contract enumerates
 * them (15 Sep). Until then `eventType` came back on every row as a bare
 * string with no enum, so there was nothing to populate a filter from and the
 * screen carried a TODO saying so.
 *
 * They are the ENGINE'S vocabulary, not a reader's - `simplify_trigger` is not
 * a sentence to put in front of an administrator. The screen maps them to
 * plain language; this type just names what may arrive.
 */
export type AdaptationEventType =
  | "simplify_trigger"
  | "expand_trigger"
  | "slower_trigger"
  | "break_suggested"
  | "modality_suggestion_shown"
  | "modality_suggestion_accepted"
  | "modality_switch_outcome"
  | "modality_manual_switch";

export interface AdaptationLogQuery {
  classId?: string;
  studentId?: string;
  lessonId?: string;
  /**
   * Repeat the parameter to pass more than one; omit it for all of them. The
   * client sends an ARRAY and `buildUrl` repeats the key, which is what the
   * endpoint documents.
   */
  eventType?: AdaptationEventType[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

/** The wire shape, which carries two fields this console must not hold. */
interface ComplianceFindingWire extends ComplianceFinding {
  recordId?: string;
  term?: string;
}

/**
 * Drop `term` and `recordId` before the audit reaches anything that renders.
 *
 * Deliberately rebuilt field by field rather than destructured-and-rested: a
 * rest spread would silently carry any NEW identifying field the backend adds
 * later, and this is the one screen where that must not happen by default.
 */
function stripFindings(audit: ComplianceAudit): ComplianceAudit {
  const wire = audit.findings as ComplianceFindingWire[] | undefined;
  return {
    ...audit,
    findings: (Array.isArray(wire) ? wire : []).map((f) => ({
      table: f.table,
      field: f.field,
    })),
  };
}

export const schoolIntelligenceApi = {
  /** GET /api/admin/compliance-audit */
  complianceAudit: () =>
    api.get<ComplianceAudit>("/api/admin/compliance-audit").then(stripFindings),

  /** POST /api/admin/compliance-audit/scan - re-runs the verification. */
  runComplianceScan: () =>
    api
      .post<ComplianceAudit>("/api/admin/compliance-audit/scan")
      .then(stripFindings),

  /** GET /api/admin/adaptation-log */
  adaptationLog: (query: AdaptationLogQuery = {}) =>
    api.get<AdaptationLog>("/api/admin/adaptation-log", {
      params: {
        classId: query.classId,
        studentId: query.studentId,
        lessonId: query.lessonId,
        eventType: query.eventType,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        limit: query.limit,
        offset: query.offset,
      },
    }),
};
