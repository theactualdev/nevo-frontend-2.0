import { api } from "./client";
import type { ConsentStatus } from "./consents";
import type { ConceptOutcome } from "./lessons";

/**
 * What a teacher can read about one student.
 *
 * Four endpoints, because the contract splits them: identity and open-flag
 * count, the learner profile, per-concept mastery, and recommendations.
 *
 * ZERO-TAG APPLIES HERE, and it is now a RULING, not a pending question
 * (Olayinka, 30 Aug 2026): `workingMemoryCapacity` and `attentionSpan` are
 * never rendered on any teacher-visible surface. A number against a child's
 * working memory is a diagnostic-shaped measurement, which is exactly what
 * the D22 compliance screen promises Nevo does not hold. The accommodations
 * read carries everything actionable in those numbers, in the product's own
 * register.
 *
 * BACKEND HONOURED THE RULING (31 Aug 2026): `/api/intelligence/profile/{id}`
 * is now `{studentId, status, observedEventCount}` and returns neither field
 * on any teacher-scoped read. They are gone from `LearnerProfile` below - a
 * type that declares fields the API never sends is a standing invitation to
 * render them.
 *
 * `mastery/student` NOW CARRIES `conceptName` (31 Aug 2026), so the
 * `/api/concepts` round trip that resolved ids to names is gone. It was
 * best-effort and silently swallowed its own failure, which meant a teacher
 * could be shown a raw UUID as the name of the concept their student was
 * struggling with.
 *
 * CONVERSATION EVIDENCE IS RULED AGGREGATE-ONLY (Olayinka, 30 Aug 2026).
 * `/api/conversation-evidence/student/{id}` returns per-question rows -
 * which page a child was on each time they asked Nevo for help. A teacher-
 * visible log of help-seeking chills exactly the students who most need a
 * safe place to ask, so the per-question rows are never shown. What MAY ship,
 * once design draws it: the pattern only - interaction count and category mix
 * over the period - and nothing at all below 3 interactions, so a single
 * question is never traceable. Untyped here until that element exists.
 */

export interface StudentIdentity {
  id: string;
  firstName: string | null;
  lastName: string | null;
  ageBand: string | null;
}

export interface StudentProfileResponse {
  student: StudentIdentity;
  /** Free-form in the spec; not read. */
  profile: Record<string, unknown> | null;
  openFlagCount: number;
}

export interface LearnerProfile {
  studentId: string;
  /** `observed` once Nevo has watched enough to adapt. */
  status: string;
  observedEventCount: number | null;
}

export interface ConceptMasteryRow {
  studentId: string;
  conceptId: string;
  /** Shipped 31 Aug. Before it, this read had ids only. */
  /** Nullable in the contract: a concept the engine has no name for. */
  conceptName: string | null;
  /** 0-1. The frame's bars are percentages. */
  masteryProbabilityConcept: number;
  masteryProbabilityReading: number;
  attentionWeights: Record<string, unknown>;
  practiceCount: number;
  lastResponseCorrect: boolean | null;
  lastFailureAttribution: string;
  seedingSource: string;
}

export interface Recommendation {
  id: string;
  studentId: string;
  /** Already written in plain language by the backend. */
  recommendationText: string;
  generatedAt: string;
}

export interface StudentAdaptation {
  id: string;
  studentId: string;
  lessonId: string;
  lessonTitle: string;
  timestamp: string;
  eventType: string;
  /** What prompted it. */
  trigger: string;
  /** What Nevo did, in the product's own plain register. */
  adaptation: string;
  /** True when the adaptation was considered and withheld. */
  suppressed: boolean;
}

/** What Nevo is currently offering this student, and on what evidence. */
export type AccommodationType = "reading" | "attention" | "numerical";

export interface AccommodationSignal {
  accommodation: AccommodationType;
  frontendSignal: string;
  evidence: string[];
  lessonCount: number;
}

export interface Accommodations {
  studentId: string;
  activeAccommodations: AccommodationType[];
  frontendSignals: string[];
  signals: AccommodationSignal[];
  source: string;
  /**
   * The Zero-Tag assertion: whether any of this was written down as a label
   * about the child. It should always be false, and the compliance screen
   * makes the same claim school-wide, so it is not rendered per student -
   * but it is typed, because a `true` here would matter enormously.
   */
  persistedAsLabel: boolean;
}

export interface LessonProgress {
  lessonId: string;
  title: string;
  /** `in_progress` | `completed` | `exited`, per LessonCompletionStatus. */
  status: string;
  /**
   * Indices into the lesson. Whether they are 0- or 1-based is not stated in
   * the spec and cannot be told apart from one demo school's data, so they
   * are typed and not rendered - "section 0" in front of a teacher is worse
   * than no position at all.
   */
  modulePosition: number;
  segmentPosition: number;
  updatedAt: string;
}

export interface StudentProgress {
  studentId: string;
  subject: string | null;
  masteryAverage: number | null;
  concepts: {
    conceptId: string;
    name: string;
    subject: string;
    understanding: number;
    reading: number;
    practiceCount: number;
  }[];
  lessons: LessonProgress[];
  /**
   * Backend-authored, student-facing prose (3 Sep). Both are REQUIRED in the
   * contract, so there is always something to render.
   *
   * Written by the backend from recorded lesson, practice and mastery
   * aggregates in deliberately non-diagnostic language - it is meant to be
   * shown to the child, not summarised or re-worded here. Render it as given.
   */
  reflection: string;
  highlights: string[];
  /**
   * A short note, written short rather than cut down (backend B29, 1 Oct) -
   * the line the Progress card draws under a subject. A plain string in the
   * contract, not nullable but not required, defaulting to "": empty or
   * absent means there is no note. Scoped like `reflection`, so a card reads
   * its subject's own from the narrowed route.
   */
  note?: string;
  /**
   * The Progress card's topic counts (backend B53, 5 Oct). A topic is done
   * when understanding passes the engine's own threshold - the engine's, not
   * ours. The total is topics this child HAS MET, not the curriculum. Not
   * required, defaulting to 0 and "": 0 total is "not said", and an empty
   * `currentTopic` is no topic. Scoped like `note`.
   */
  topicsDone?: number;
  topicsTotal?: number;
  currentTopic?: string;
}

/** One row of the student's own recent lesson activity. */
export interface DashboardProgressRow {
  lessonId: string;
  /** LessonCompletionStatus: in_progress | completed | exited. */
  status: string;
  /** ZERO-based cursor (backend B51) - see `lib/lessons/segmentPlace`. */
  segmentPosition: number;
  updatedAt: string;
  /**
   * The lesson's own title and subject (backend B52, 5 Oct), so a lesson the
   * child started from the library can sit on Home with no assignment behind
   * it. `title` defaults to "" and `subject` is nullable: blank is no title.
   */
  title?: string;
  subject?: string | null;
  /**
   * Every segment in the lesson (B51), so the row carries its own fraction.
   * Defaults to 0, which no playable lesson has: 0 is "not said".
   */
  segmentCount?: number;
  /**
   * Where the after-lesson check was left and until when it can be picked up
   * (B82, 8 Oct), as on the progress write's answer (B49) - see
   * `lib/lessons/checkResume`. Absent or null is no check to pick up.
   */
  checkPosition?: number | null;
  checkResumableUntil?: string | null;
  /**
   * The check-in's outcome (B84, 8 Oct), as the completion write brings it
   * back (B26) - see `lib/lessons/checkOutcome`, which reads it only off a
   * completed row. Not required: absent and empty both draw nothing.
   */
  masteredConcepts?: ConceptOutcome[];
  revisitConcepts?: ConceptOutcome[];
  resultNote?: string;
}

/**
 * The admin roster's view of a student (D7 / D7b). Enrolment fact only - this
 * shape must never grow a score, a mastery figure or an adaptation.
 *
 * CONSENT IS NOW CARRIED (backend, 7 Sep). Until it landed the route returned
 * no consent field of any kind - so the column, the count clause and the row
 * action were all absent rather than guessed at. `status` was never a stand-in:
 * an active account is a different fact from a parent having agreed.
 *
 * THIS USED TO SAY D7 EXISTS TO ANSWER "WHICH STUDENTS CANNOT YET BEGIN
 * LESSONS". It does not, and that framing seeded eight false sentences across
 * the admin console before it was caught. SCRUM-80 (7 Sep) ruled that the
 * school warrants consent through the DSA, so `not_sent` and `pending` are the
 * school's administrative task and the learner proceeds; only `withdrawn`
 * stops processing. D7 answers which students the school has a RECORDED
 * CONSENT for - see `withoutRecordedConsent`, and `processingWithdrawn` in
 * `lib/api/consents.ts` for the one question this client may act on.
 */

/** The four states SCRUM-40 needs. `withdrawn` is now readable, not just causable. */
/**
 * The consent lifecycle, defined ONCE in `consents.ts` and aliased here.
 *
 * This was briefly declared twice - as `ConsentState` here with the right four
 * values, and as `ConsentStatus` in `consents.ts` with only two - by two people
 * fixing the same gap on the same afternoon. An enum with two definitions
 * drifts, and the half that was wrong made `status === "withdrawn"` a type
 * error, so the name stays for its callers and the values come from one place.
 */
export type ConsentState = ConsentStatus;

/**
 * Who agreed, when, and through what. Every field but `status` is nullable,
 * because a consent that was never requested has no actor and no timestamp.
 */
export interface StudentConsent {
  status: ConsentState;
  actorId: string | null;
  actorName: string | null;
  timestamp: string | null;
  channel: string | null;
}

export interface AdminStudentRow {
  id: string;
  /** Always present - the backend composes its own fallback. */
  name: string;
  /** The student's sign-in name. Belongs on the detail page; do not drop it. */
  loginIdentifier: string | null;
  /** "active" | "deactivated" in practice; the schema does not narrow it. */
  status: string;
  ageBand: string | null;
  /**
   * REQUIRED AND NON-NULL, confirmed against the deployed spec on 16 Sep.
   *
   * This was `consent?: StudentConsent | null`, on the belief that an older
   * read might omit it - and a whole branch of compliance copy hung off that:
   * a row without a record was reported as "unknown", distinct from "not
   * sent". `StudentSummaryResponse` now lists `consent` in its `required` set
   * and refs the object directly with no null member, and backend confirmed
   * the behaviour: a student with no record comes back `status: "not_sent"`,
   * never a missing object.
   *
   * So "we were not told" is no longer a state this screen can be in, and the
   * copy describing it has gone rather than sitting there unreachable.
   *
   * NOTE the invitation row's `consentStatus` is a DIFFERENT field on a
   * different schema, and it is still optional and nullable - see
   * `Invitation.consentStatus`. Do not generalise this change onto it.
   */
  consent: StudentConsent;
}

export interface AdminStudentDetail {
  id: string;
  firstName: string | null;
  lastName: string | null;
  loginIdentifier: string | null;
  email: string | null;
  status: string;
  ageBand: string | null;
  classIds: string[];
  firstUse: boolean;
  /** Required and non-null - see the note on `AdminStudentRow.consent`. */
  consent: StudentConsent;
}

/**
 * A guardian attached to a student.
 *
 * `accountCreated` says an account exists, not that consent was given. It was
 * never a consent signal and is still not one - the real four-state record now
 * arrives as `consent` on the student reads above.
 */
export interface ParentLink {
  id: string;
  schoolId: string;
  studentId: string;
  parentId: string | null;
  parentName: string;
  parentContact: string;
  contactMethod: string;
  accountCreated: boolean;
}


/**
 * ONE ROW IN A CHILD'S SESSION HISTORY (17 Sep).
 *
 * The detail read has existed since 15 Sep and was unreachable for two days,
 * because nothing handed a teacher a `sessionId`: the recent-lesson rows carry
 * a lessonId, `latestSessionAt` is a timestamp, and the activity-feed id has no
 * stated relation to a session. This list is the addressing that was missing.
 *
 * It carries enough to render the row WITHOUT opening it, deliberately. Note
 * `sitting`: backend's point is that a child's second visit to the same lesson
 * means something their first does not, so it is not a detail-only field.
 */
export interface StudentSessionSummary {
  sessionId: string;
  lessonId: string;
  lessonTitle: string;
  occurredAt: string;
  endedAt: string | null;
  completionStatus: string;
  exitPosition: string | null;
  /** Which visit to this lesson this was. 1 is the first. */
  sitting: number;
  signalCount: number;
}

export interface StudentSessionList {
  studentId: string;
  sessions: StudentSessionSummary[];
  total: number;
  limit: number;
  offset: number;
}

/** One section of a session, as the engine described it. */
export interface StudentSessionSection {
  title: string;
  note: string;
  /** The engine's own flag. Never derived here from a duration. */
  tookTime: boolean;
}

export interface StudentSessionDetail {
  sessionId: string;
  lessonId: string;
  lessonTitle: string;
  occurredAt: string;
  sittings: number;
  narrative: string;
  sections: StudentSessionSection[];
}


/**
 * `POST /api/v1/students`. Name, class and admission number are required.
 *
 * The admission number is the school's own Student ID, required since 1 Oct;
 * a duplicate within the school is a named 409, `admission_number_in_use`.
 * There is no `email`: SCRUM-202 took it off enrolment - children have none,
 * and asking was why schools were inventing them.
 */
export interface StudentEnroll {
  firstName: string;
  lastName: string;
  classId: string;
  admissionNumber: string;
  ageBand?: string | null;
  /** ISO date. Optional; the server refuses a date in the future. */
  dateOfBirth?: string | null;
  /**
   * The guardian's email, restored to enrolment in SCRUM-189. It RECORDS the
   * guardian - a parent link with an empty name, the parent giving their own
   * at consent - and SENDS NOTHING. The request is a second call,
   * `consentsApi.addGuardian`, which finds this same link (both paths fold
   * the address the same way) and fills in the name.
   */
  parentEmail?: string | null;
}

/** What enrolment returns: the new id, and the name the child signs in with. */
export interface StudentEnrollment {
  id: string;
  loginIdentifier: string;
}

export const studentsApi = {
  /**
   * Enrol one student directly. POST /api/v1/students
   *
   * D24b's "Add a student". Called by nothing until 25 Sep: "Enrol a student"
   * on the roster linked to the invitation flow instead, which is a different
   * mechanism (the child accepts a link) from this one (the school adds them).
   *
   * **IT HAS NO BILLING SIDE EFFECT, AND THE SCREEN MUST NOT IMPLY ONE.** It
   * creates the student, enrols them in the class, and commits - no invoice,
   * no charge, no record that a chargeable addition happened. Backend added a
   * test asserting the handler contains no billing, so that changes only
   * deliberately. An addition reaches a school as a bigger NEXT invoice,
   * because the invoice run prices the term off whoever is active when it
   * runs. See `onboardingApi.quoteAddition`.
   *
   * `dateOfBirth` is optional and refused if it is in the future. The column
   * existed for the two-point age check and this body simply never accepted
   * it. Optional because a school office mid-term may not have it to hand,
   * and refusing an enrolment over a missing date would keep a child out of
   * lessons.
   *
   * NO PARENT EMAIL, deliberately - backend asked for it to be held. The
   * parent record needs a name as well, and creating one while the consent
   * flow is frozen would mean holding a parent's address and never sending
   * the request it exists for.
   */
  enroll: (body: StudentEnroll) =>
    api.post<StudentEnrollment>("/api/v1/students", body),

  /**
   * The school roster. Deactivated students are excluded by default and
   * reachable by filter, which is what `includeInactive` does. `classId`
   * narrows to one class - the same filter D7's "All classes" pill drives.
   */
  list: (options: { classId?: string; includeInactive?: boolean } = {}) =>
    api.get<AdminStudentRow[]>("/api/v1/students", {
      params: {
        classId: options.classId,
        includeInactive: options.includeInactive ? true : undefined,
      },
    }),

  /** One student, admin-scoped. GET /api/v1/students/{student_id} */
  get: (studentId: string) =>
    api.get<AdminStudentDetail>(`/api/v1/students/${studentId}`),

  /** Guardians on the record. */
  parentLinks: (studentId: string) =>
    api.get<ParentLink[]>(`/api/v1/students/${studentId}/parent-links`),

  /**
   * Move a student to another class. A move never resets anything - no
   * progress, no profile, no history - and the sheet says so before it
   * commits.
   *
   * TODO(api): D7c offers "Move now" or a scheduled date at the start of next
   * term. The endpoint takes a class id and nothing else, so only "now" is
   * built rather than pretending a date was honoured.
   */
  moveToClass: (studentId: string, classId: string) =>
    api.patch<{ studentId: string; classId: string }>(
      `/api/v1/students/${studentId}/class`,
      { classId },
    ),

  /**
   * Clear a child's PIN so they choose a new one themselves. SCRUM-216.
   * POST /api/v1/students/{student_id}/pin/clear
   *
   * A CLEAR, NOT A RESET. It never accepts, returns or generates a PIN, so
   * there is no path by which an adult learns or chooses one. The old PIN
   * stops working, the child's sessions end, and the child sets the next one
   * through the student entry - a door open only while the PIN is cleared.
   *
   * THE CHILD'S TEACHERS CALL IT, from the class roster (C05). Admin's
   * console dropped its own control on 6 Oct for exactly that reason: the
   * person who can recognise the child is the one who should answer for them.
   * Scoped server-side to a class this teacher takes.
   */
  clearPin: (studentId: string) =>
    api.post<PinCleared>(`/api/v1/students/${studentId}/pin/clear`),

  /** Step one of two. Reversible, keeps everything, frees the seat. */
  deactivate: (studentId: string) =>
    api.post<void>(`/api/v1/students/${studentId}/deactivate`),

  /** Undo a deactivation - they pick up exactly where they left off. */
  restore: (studentId: string) =>
    api.post<void>(`/api/v1/students/${studentId}/restore`),

  /**
   * Step two of two, and the only permanent deletion in the admin set. Only
   * reachable once a student is already deactivated, and gated on their name
   * typed exactly. Severity comes from friction, not from colour.
   */
  erase: (studentId: string) => api.del<void>(`/api/v1/students/${studentId}`),
  /**
   * The signed-in student's own landing data: who they are, what has been
   * assigned to them (each with its lesson summary nested), and their recent
   * lesson activity. GET /api/v1/students/me/dashboard
   */
  myDashboard: () =>
    api.get<{
      student: StudentIdentity;
      assignments: import("./assignments").Assignment[];
      recentProgress: DashboardProgressRow[];
    }>("/api/v1/students/me/dashboard"),

  profile: (studentId: string) =>
    api.get<StudentProfileResponse>(`/api/v1/students/${studentId}/profile`),

  learnerProfile: (studentId: string) =>
    api.get<LearnerProfile>(`/api/intelligence/profile/${studentId}`),

  mastery: (studentId: string) =>
    api.get<ConceptMasteryRow[]>(`/api/mastery/student/${studentId}`),

  recommendations: (studentId: string) =>
    api.get<Recommendation[]>(`/api/intelligence/recommendations/${studentId}`),

  /** What Nevo quietly adjusted, and why (C16c). */
  adaptations: (studentId: string, limit = 8) =>
    api.get<StudentAdaptation[]>(`/api/adaptations/student/${studentId}`, {
      params: { limit },
    }),

  /** Lessons this student has worked through, newest activity first. */
  /** A child's sessions, newest first. The addressing the detail read needed. */
  sessions: (studentId: string, options?: { limit?: number; offset?: number }) =>
    api.get<StudentSessionList>(`/api/v1/students/${studentId}/sessions`, {
      params: {
        ...(options?.limit ? { limit: options.limit } : {}),
        ...(options?.offset ? { offset: options.offset } : {}),
      },
    }),

  /** One session, section by section, in the engine's words. */
  session: (studentId: string, sessionId: string) =>
    api.get<StudentSessionDetail>(
      `/api/v1/students/${studentId}/sessions/${sessionId}`,
    ),

  progress: (studentId: string) =>
    api.get<StudentProgress>(`/api/students/${studentId}/progress`),

  /**
   * The same shape narrowed to one subject. Worth its own call despite the
   * whole-student read above: `reflection` here is written about THIS
   * subject, where the unnarrowed one is written about all of them.
   *
   * `subject` is the backend's own string for it, exactly as returned on each
   * concept row. The contract documents no slug, so what it gave us is what
   * goes back.
   */
  subjectProgress: (studentId: string, subject: string) =>
    api.get<StudentProgress>(
      `/api/students/${studentId}/progress/${encodeURIComponent(subject)}`,
    ),

  /** Active accommodations and the evidence behind them. */
  accommodations: (studentId: string) =>
    api.get<Accommodations>(`/api/intelligence/accommodations/${studentId}`),

};

/** One misconception several students in a class share (C09). */
/**
 * What comes back from clearing a child's PIN (SCRUM-216). No PIN in it, by
 * design: nobody but the child ever sets one, and nobody is told the old one.
 */
export interface PinCleared {
  studentId: string;
  clearedAt: string;
  /** Always true: the child chooses the next PIN, at their next sign-in. */
  childSetsNext?: boolean;
  pinLength?: number;
}

export interface ClassMisconception {
  conceptId: string;
  /** Nullable in the contract: a concept the engine has no name for. */
  conceptName: string | null;
  /** A short name for the shape of the error. */
  pattern: string;
  studentCount: number;
  description: string;
}

/** Class-level mastery per concept. Carries `conceptName`, unlike the
 *  per-student read - see the note at the top of this file. */
export interface ClassMasteryRow {
  conceptId: string;
  /** Nullable in the contract: a concept the engine has no name for. */
  conceptName: string | null;
  studentCount: number;
  masteryProbabilityConcept: number;
  masteryProbabilityReading: number;
}

/**
 * Ask Nevo help-seeking, aggregate only.
 *
 * `privacy` is the SERVER's gate, not ours: `withheld_below_minimum` means it
 * has decided there is too little here to say anything, and nothing may be
 * rendered in that case - not a zero, not a "no data yet". `categories` is a
 * name -> count map; there are no per-question rows in this response and there
 * must never be. See the ruling at the top of this file.
 */
export interface ConversationEvidence {
  studentId: string;
  periodDays: number;
  interactionCount: number;
  categories: Record<string, number>;
  helpfulResponseRate: number | null;
  privacy: "aggregate_only" | "withheld_below_minimum";
  minimumInteractions?: number;
}

export const conversationEvidenceApi = {
  forStudent: (studentId: string) =>
    api.get<ConversationEvidence>(
      `/api/conversation-evidence/student/${studentId}`,
    ),
};

/**
 * Which of three things the weekly class view is saying.
 *
 * THE ENGINE OWNS THIS NOW, and the enum's own description in the contract
 * says why, in the words of the defect it closes: the console was deciding
 * it from the length of three arrays, which put a threshold in the client
 * and could not tell a settled week from a new class - so a class having a
 * good week was told insights were still being gathered.
 *
 * `summary` is the schema's default and is what an omitted field means.
 * It is optional on the response, so a server that says nothing is saying
 * `summary`, never `unknown`.
 */
export type ClassInsightState = "summary" | "settled" | "gathering";

/**
 * C09's written summary and C14 A2's looking-ahead line, for one class.
 *
 * `weeklySummary` and `lookingAhead` are REQUIRED and non-nullable, so the
 * engine cannot express an empty week by absence - which is what design's
 * 16 Sep ruling asked for and the contract could not support. `state` is
 * how it says so instead: the prose always arrives, and the state says how
 * to read it.
 */
export interface ClassInsightsNarrative {
  classId: string;
  className: string;
  weeklySummary: string;
  lookingAhead: string;
  generatedAt: string;
  /** Optional on the wire; absent means `summary`, per the schema. */
  state?: ClassInsightState;
}

export const classInsightsApi = {
  /**
   * Shared misconceptions - the ones enough children share to be worth naming.
   *
   * `minimumStudents` IS NOT SENT, and that is the fix rather than an omission.
   * It is the small-cell privacy floor: how many children must share a
   * misconception before a teacher is told about it. Rule 3 - the engine owns
   * the cutoffs - makes that the server's number, and the spec gives it a
   * default for exactly this reason (min 3, default 3, max 50).
   *
   * This sent 2 first, which 422'd on every request, so the section never
   * rendered. Then it pinned 3, which works today and would silently override
   * the day backend raises the default to protect smaller classes - the one
   * change here that has to reach every screen without a client release.
   * Omitted, the server's default is the only number in play.
   */
  misconceptions: (classId: string) =>
    api.get<ClassMisconception[]>(`/api/misconceptions/class/${classId}`),

  mastery: (classId: string) =>
    api.get<ClassMasteryRow[]>(`/api/mastery/class/${classId}`),

  /**
   * The written week: C09's summary and C14 A2's looking-ahead line.
   *
   * Deployed since 15 Sep and called by nothing until today. Both screens
   * that draw this prose drew it from fixtures, so a signed-in teacher read
   * a summary of a class that was not theirs, or nothing at all.
   */
  narrative: (classId: string) =>
    api.get<ClassInsightsNarrative>(`/api/v1/classes/${classId}/insights`),
};
