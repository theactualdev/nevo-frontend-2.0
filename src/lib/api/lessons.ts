import { api, ApiError, apiErrorCode } from "./client";
import type {
  CheckpointScalar,
  ComprehensionCheckpoint,
} from "./checkpoints";
import type { SessionDelivery } from "./intelligence";
import type { SegmentVariants } from "./variants";
import type { LessonMedia } from "./media";

/**
 * Parsed lesson content - the library and one lesson's segments.
 *
 * camelCase, which is the convention across the whole content/messaging
 * surface; the auth routes (`users/me`, `auth/login`) are the snake_case
 * holdouts. Enum values below are the spec's own, not our invention.
 *
 * `status` is a PARSE status, not an assignment status. A lesson that is
 * `completed` has been read and segmented; whether it has been given to a
 * class is a different question that this endpoint does not answer - see the
 * note in `useLessonLibrary`.
 */

export type LessonSourceType =
  "pdf" | "word" | "powerpoint" | "google_drive" | "onedrive" | "text";

export type LessonParseStatus =
  "pending" | "processing" | "completed" | "completed_with_review" | "failed";

export type LessonContentType =
  | "explanatory_text"
  | "visual_diagram"
  | "worked_example"
  | "practice_question"
  | "definition"
  | "summary"
  | "calculation";

export type ContentModality = "visual" | "audio" | "text" | "interactive";

export interface LessonSummary {
  id: string;
  title: string;
  sourceType: LessonSourceType;
  status: LessonParseStatus;
  segmentCount: number;
  /** Segments the parser wants a human to confirm. */
  reviewSegmentCount: number;
  /**
   * Shipped 31 Aug. NOT in the schema's `required` list, so it can arrive
   * absent - and absent is not zero. Anything reading it must tell those
   * apart before making a claim about whether a lesson is assigned.
   */
  assignmentCount?: number;
  /** Shipped 31 Aug. Free text; only the staged upload routes can set one. */
  subject?: string | null;
  /**
   * The lesson's "what you'll do" line. Shipped 1 Oct (backend 70b14a4), with
   * existing lessons backfilled. Nullable and not required, so null and absent
   * both mean there is none, and the preview renders no line rather than one
   * we wrote.
   */
  description?: string | null;
  /**
   * Shipped 1 Sep, pre-summed so a list view need not load segments.
   * Estimated from word count at a school reading pace and floored per content
   * type, so a real lesson is never 0 - which makes 0 (its schema default) and
   * absent both mean "no estimate", and neither may be rendered as "0 min".
   * Present it as approximate: it is a planning figure, not a measurement.
   */
  estimatedMinutes?: number;
  /**
   * WHY THE PARSE FAILED, ON THE LESSON ITSELF. Added 25 Sep.
   *
   * The reason has always lived on the parse RUN, and the library list carries
   * no run id - so "This lesson couldn't be processed." could not say why
   * without a request per failed card, which is a workaround rather than a
   * design. Backend denormalised it onto the lesson at the moment the run
   * fails.
   *
   * PROSE, PROMISED - never the driver's own text, which is the distinction
   * that cost this console a rendered asyncpg exception. Null unless `status`
   * is `failed`.
   */
  failureReason?: string | null;
  /** Twelve hex characters, for a teacher to quote. Null unless it failed. */
  incidentId?: string | null;
  /**
   * SECTIONS STILL WAITING FOR A TEACHER - the number that reaches zero.
   *
   * `reviewSegmentCount` is what was EVER flagged and never falls, which
   * backend confirmed on 25 Sep is by design: correct history, useless on a
   * card. The first real end-to-end run ended on a lesson approved in full and
   * sent to seven children that still said "Needs review" in the library.
   * This is the same figure the assignment 409 reports.
   *
   * Optional: `default: 0` in the contract, but absent on an older deployment
   * is "we were not told", and reading it as zero would drop the badge from a
   * lesson that genuinely needs one.
   */
  unapprovedSegmentCount?: number;
  createdAt: string;
  /** Who uploaded it - on the response since the library listed by school. */
  createdById?: string | null;
  createdByName?: string | null;
}

/**
 * A class this lesson actually went to.
 *
 * WHAT THIS REPLACES. Finding the classes for one lesson meant listing EVERY
 * assignment the teacher can see and filtering client-side - and it still only
 * yielded ids, so the screen could count classes and not name them. Backend
 * added this on 25 Sep: one query, only classes with somebody assigned.
 *
 * `studentCount` is distinct children rather than assignment rows, so a child
 * assigned twice is one child.
 */
export interface LessonClass {
  id: string;
  name: string;
  yearGroup?: string | null;
  studentCount?: number;
}

/**
 * One segment as the DETAIL routes return it.
 *
 * The five variants were typed on 3 Sep, but only on `content.ts`'s parse
 * response - whose sole consumer is the teacher's upload wizard. This type is
 * what the PLAYER reads (`lessonsApi.detail` -> `fromContent`), and it declared
 * none of them, so the bytes arrived on the wire and were erased before the
 * adapter could see them. Both detail schemas carry all five
 * (`nevo__api__frontend_unblockers__LessonSegmentResponse` and
 * `nevo__api__response_models__LessonSegmentResponse`), so this extends
 * `SegmentVariants` rather than restating it.
 */
/**
 * Why the parser flagged a segment for a human look.
 *
 * A CLOSED enum, and the contract says why it is one: "Enumerated so the
 * console can render its own copy per reason instead of printing the raw token
 * with underscores swapped for spaces." So the copy lives in the console - see
 * `REVIEW_REASON_COPY` in the variant review screen - and this type is what
 * keeps a new backend reason from being rendered as `audio_generation_failed`.
 *
 * Was `string[]`, which typechecked against anything and would have let exactly
 * that happen.
 */
/**
 * All 16 values the deployed enum carries, re-polled 6 Oct (the sixteenth,
 * `calculation_variant_missing_manipulative`, read as "a reason this console
 * doesn't recognise yet" until then). Was 15 on 16 Sep. This listed 6 for
 * long enough that NINE live reasons rendered as "a reason this console doesn't
 * recognise yet" - and eight of the nine are calculation reasons, on exactly the
 * variant the review screen does not draw a tab for yet (SCRUM-136). A teacher
 * whose worked steps came through broken was told twice that Nevo had nothing
 * to say about it.
 *
 * Keep this in step with the spec. The `Record<SegmentReviewReason, string>` in
 * the variant review screen is what makes that a compile error rather than a
 * silent fallback: adding a value here without copy fails `tsc`.
 */
export type SegmentReviewReason =
  | "deterministic_parse_used"
  | "fewer_than_two_modalities"
  // Teslim, 14 Oct: a section that should carry an activity and came back
  // without a complete one. Its interactive version is dropped.
  | "interactive_activity_missing"
  | "audio_generation_failed"
  | "calculation_audio_generation_failed"
  | "visual_generation_failed"
  | "visual_variant_image_generation_failed"
  | "calculation_variant_malformed"
  | "calculation_variant_missing_answer"
  | "calculation_variant_too_few_steps"
  | "calculation_step_missing_prompt"
  | "calculation_step_unknown_input_type"
  | "calculation_step_missing_answer"
  | "calculation_step_missing_options"
  | "calculation_variant_missing_manipulative"
  | "calculation_segment_has_no_interactive_delivery"
  | "model_flagged_for_review";

/**
 * "A stable, ordered reading boundary generated from approved lesson text."
 * The offsets are into the segment's `body`.
 */
export interface ReadingChunk {
  id: string;
  sequenceOrder: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

/**
 * `ReadingGroup` - a run of `readingChunks` the server groups for this
 * child's delivery, from the session's frozen `engineConfig` (Teslim's 19 Oct
 * learning-science handoff: "Online/offline segments can carry readingGroups
 * over immutable readingChunks").
 *
 * TYPED, NOT READ. How a group is drawn - whether a reading "part" is a chunk
 * or a group, and whether `pauseAfter` places a pause - is a question for
 * design, so nothing consumes it yet. `wordCount` is the server's sizing,
 * never shown.
 */
export interface ReadingGroup {
  id: string;
  /** `ReadingChunk.id`s, in order. */
  chunkIds: string[];
  wordCount: number;
  /** Defaults to false. */
  pauseAfter?: boolean;
}

export interface LessonSegment extends SegmentVariants {
  id: string;
  /** Shipped 1 Sep. 0 or absent means no estimate - see `LessonSummary`. */
  estimatedMinutes?: number;
  segmentKey: string;
  contentType: LessonContentType;
  sequenceOrder: number;
  title: string | null;
  body: string;
  /**
   * Where the server breaks `body` for reading (SCRUM-234/236, B87). Absent
   * or empty is one body, which is a normal state.
   */
  readingChunks?: ReadingChunk[];
  /** Groups of those chunks for this child's delivery - see `ReadingGroup`. Not read. */
  readingGroups?: ReadingGroup[];
  availableModalities: ContentModality[];
  /**
   * SCRUM-272 (Teslim's handoff §5, 21 Oct): the formats this section can
   * actually be sent in - "derived from actual payloads, not just the
   * declared modality list": a picture with a current safety stamp and a URL,
   * audio with a recording - in the authored opening order. What the format
   * group offers. Absent on a payload from before it (and on a mock), which
   * falls back to `availableModalities` with no recommendation.
   */
  availableFormats?: ContentModality[];
  /**
   * The format the engine recommends for this section in the child's latest
   * sitting, or null for none. The format group's quiet marker reads this and
   * nothing else; the player never derives one.
   */
  recommendedFormat?: ContentModality | null;
  /**
   * What this section is delivered in, in the child's in-progress sitting on
   * this lesson (K4, Lydia 21 Oct) - its own format, and the sitting's depth
   * and Slower as they take effect here (741685e) - or null for no choice.
   * What a reload opens in, before its first frame. See `SegmentChoice`.
   */
  deliveryPreference?: SegmentChoice | null;
  /**
   * The chosen format where there is one - and NOT READ, because where there
   * is none the server fills it with the section's first available format
   * (`LessonSegmentResponse`'s validator), so it cannot tell a child's choice
   * from the default. `deliveryPreference.modality` can.
   */
  primaryModality?: ContentModality | null;
  /**
   * Typed as of 3 Sep. `answerKey` is NULLABLE for lessons parsed before the
   * contract existed - see `api/checkpoints.ts`, which is the only thing that
   * should mark one.
   */
  comprehensionCheckpoints: ComprehensionCheckpoint[];
  needsReview: boolean;
  reviewReasons: SegmentReviewReason[];
  /**
   * Whether a teacher has approved this segment for students (17 Sep).
   *
   * C07b: "the teacher reviews each segment's variants and approves them for
   * the class. Approval is manual and deliberate: the teacher stays in control
   * of what reaches students." Backend built the transport once design settled
   * it, and ASSIGNMENT IS GATED ON IT - a lesson with an unapproved segment is
   * refused at both assignment doors.
   *
   * The 104 segments that predate the gate are backfilled `approved` with NO
   * approver recorded, because nobody did approve them. `approvedAt` may
   * therefore be null on an approved segment, and naming a teacher who had not
   * approved it would be a false record on a screen that shows the name.
   */
  approved: boolean;
  approvedAt: string | null;
}

/**
 * A depth the child chose for a section (K4): its standard text, or one of
 * its two rewrites. `simplified` and `expanded` are the `depthVariants` keys.
 */
export type ChoiceDepth = "original" | "simplified" | "expanded";

/**
 * `SegmentChoice` - what ONE section of ONE sitting is delivered in, as the
 * child chose it (SCRUM-272 / K4, Teslim's handoff §5, 21 Oct; 741685e,
 * 22 Oct). "No preference is written as a permanent learner-profile label" -
 * it is never a modality on a child (rule 1). Null on a field is no choice
 * there.
 *
 * TWO SCOPES SINCE 741685e (Lydia, 22 Oct: "depth holds for the lesson,
 * format is per section"). `modality` is this section's own. `depth` and
 * `slower` are the SITTING's (`LessonChoice`), shown here as they take
 * effect on this section: `depth` reads `original` on a section with no
 * approved rewrite at the sitting's depth, while the sitting keeps it.
 */
export interface SegmentChoice {
  modality?: ContentModality | null;
  depth?: ChoiceDepth | null;
  slower?: boolean | null;
  /** The server's, never ours. */
  updatedAt?: string | null;
}

/**
 * `LessonChoice` - the sitting's depth and Slower (741685e, 22 Oct): one
 * value each for the whole sitting, whichever section it was picked on.
 * `deliveryState.lessonPreferences` on `POST /session`, and on every
 * preference write's answer. Null or absent is no choice; `original` and
 * `false` are the standard text chosen.
 */
export interface LessonChoice {
  depth?: ChoiceDepth | null;
  slower?: boolean | null;
  /** The server's, never ours. */
  updatedAt?: string | null;
}

/**
 * `SegmentFormatChoice` - one section's own entry in the sitting's
 * `segmentChoices` (741685e): its format and nothing else. Depth and Slower
 * are the sitting's - `LessonChoice`.
 */
export interface SegmentFormatChoice {
  modality?: ContentModality | null;
  updatedAt?: string | null;
}

/**
 * `SegmentChoiceWrite` - the body of `PUT .../segments/{id}/preferences`.
 * PARTIAL: "omitted fields are preserved and null clears that particular
 * override". So a write carries only what changed. `modality` is held for
 * the addressed section; `depth` and `slower` for the whole sitting.
 */
export interface SegmentChoiceWrite {
  modality?: ContentModality | null;
  depth?: ChoiceDepth | null;
  slower?: boolean | null;
}

/**
 * What a stored choice comes back as: the section's effective choice, the
 * sitting's depth and Slower, and the section's formats now. TYPED, NOT
 * READ: what was written is the child's own pick, already on screen.
 */
export interface SegmentChoiceResponse extends SegmentChoice {
  lessonPreferences?: LessonChoice;
  availableFormats: string[];
  recommendedFormat?: string | null;
}

/**
 * What one approval returns. Carries the lesson-level counts so the screen
 * knows whether that was the last segment without a second read.
 */
export interface SegmentApproval {
  lessonId: string;
  segmentId: string;
  /** Nullable in the contract, like the segment's own fields above. */
  approvedAt: string | null;
  approvedBy: string | null;
  approvedSegmentCount: number;
  segmentCount: number;
  lessonApproved: boolean;
}


/**
 * HOW WELL A KEY POINT IS GROUNDED IN THE TEXT IT CAME FROM.
 *
 * Not the model's own estimate, and the contract is emphatic about why:
 * it was never asked for one, and a number a model volunteers about its own
 * output is not evidence. This is MEASURED - the share of the key point's
 * words that appear in the segment it was drawn from - so a `low` card is
 * demonstrably absent from the source rather than a mood.
 *
 * Which is why the card's marker keys off `outstanding`, not off this: the
 * server decides what needs a teacher, and this only explains why.
 */
export type KeyPointConfidence = "high" | "medium" | "low";

/**
 * Where a key point stands in a teacher's review.
 *
 * **Only `unsure` blocks assignment**, and that is the whole of SCRUM-153's
 * scope ruling: a teacher never has to click through points Nevo could
 * ground, or the review becomes a tax on the common case.
 */
export type KeyPointReviewState =
  | "settled"
  | "unsure"
  | "accepted"
  | "amended"
  | "removed";

/** One key point, and everything LR-02's expanded card needs. */
export interface KeyPoint {
  id: string;
  segmentId: string;
  /** Nullable: a parse can produce an untitled section. */
  segmentTitle: string | null;
  position: number;
  /** What is in force - the amendment where there is one, else the parse. */
  text: string;
  /** What Nevo read. Kept BESIDE an amendment, never replaced by it. */
  extractedText: string;
  /** The teacher's own wording, when they have given one. */
  amendedText: string | null;
  /** The document's own words, which the key point was drawn from. */
  sourceText: string;
  confidence: KeyPointConfidence;
  reviewState: KeyPointReviewState;
  /** This one is still holding the lesson back. */
  outstanding: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

/**
 * The lesson's review state - LR-04's count and LR-07's gate in one read.
 *
 * `outstandingCount` SITS BESIDE `keyPointCount` IN A KEY-POINT PAYLOAD, so
 * it is read here as outstanding KEY POINTS. Backend's ruling is that a
 * lesson is also held by a flagged segment nobody approved, and that half is
 * not in this response at all - `readyToAssign` is what accounts for both.
 * If the two ever disagree on screen, this is the assumption to check first.
 */
export interface LessonReview {
  lessonId: string;
  title: string;
  outstandingCount: number;
  keyPointCount: number;
  /**
   * The SERVER's answer to "can this go to a class", never ours.
   *
   * Backend asked for this by name: "enable Assign on `readyToAssign`, not
   * by counting the list yourself. Client and server disagreeing about
   * ready is how this started."
   */
  readyToAssign: boolean;
  keyPoints: KeyPoint[];
  /*
   * C07K, THE LESSON-WIDE REVIEW (Lydia and Teslim, 19 Oct). Everything below
   * is on Teslim's `codex/lesson-review-redesign` branch and not yet in
   * production, so each is optional: a read without them is the old contract,
   * and nothing below may be inferred from its absence.
   */
  /** What the one press signs. Sent back unchanged; the server refuses a stale one. */
  keyPointsContentHash?: string;
  rewritesContentHash?: string;
  /** The latest sign-off of each kind, `current: false` once the material changed. */
  keyPointApproval?: ReviewSignoff | null;
  rewriteApproval?: ReviewSignoff | null;
  /** Sections the parser drew no key point from and nobody has decided about. */
  missingKeyPointSegmentIds?: string[];
  rewriteCount?: number;
  pendingRewriteCount?: number;
  /**
   * Both current sign-offs are in (a lesson with no rewrites needs only the
   * first). NOT the assignment gate - `readyToAssign` keeps its old meaning.
   */
  reviewComplete?: boolean;
  /**
   * The lesson's generated pictures and narration, section by section (Teslim
   * 10c6bf8). WHAT `approveAllKeyPoints` ALSO SIGNS: every item here at
   * `awaiting_review` is in the key-point snapshot and is approved with it. So
   * the review never offers that press while one is still unseen - step 1
   * approves them first, where they are shown.
   */
  media?: LessonMedia | null;
}

/**
 * One professional's sign-off over a whole step of the review.
 *
 * The name is the one the school recorded for them, stored with the approval
 * rather than looked up later, so it says who decided even after they leave.
 */
export interface ReviewSignoff {
  id: string;
  kind: "key_points" | "rewrites";
  approvedBy: string | null;
  approvedByName: string;
  approvedAt: string;
  contentHash: string;
  /** False once anything it signed has changed since. */
  current: boolean;
}

/** A section with no key point: the teacher writes one, or says it has none. */
export type MissingKeyPointWrite =
  | { action: "add"; text: string }
  | { action: "omit" };
export interface LessonDetailResponse extends LessonSummary {
  /**
   * EVERY CLASS THIS LESSON WENT TO, and the reason the screen stopped showing
   * one of them as though it were all of them.
   *
   * Design, 24 Sep: *"show all of them. A lesson assigned to three classes that
   * displays one is telling a teacher something untrue. A list rather than
   * tabs, because a teacher needs to see at a glance where a lesson went."*
   *
   * Optional, so an older deployment reads as "we were not told" rather than
   * "it went nowhere" - which is a claim, and the wrong one.
   */
  classes?: LessonClass[];
  confirmationSummary: string | null;
  segments: LessonSegment[];
  /**
   * The end of the lesson, added by backend on 14 Sep and on BOTH detail reads.
   *
   * `recap` is a short closing paragraph written FOR THE CHILD - distinct from
   * `confirmationSummary`, which is the parser talking to a teacher about its
   * own confidence and must never be shown to a learner.
   *
   * `assessment` is literally `ComprehensionCheckpoint[]`, the same type a
   * segment's inline checks use, so the same adapter draws both.
   *
   * OPTIONAL, deliberately: neither appears in the `required` list of either
   * detail schema, and neither declares a default. Typing them as required
   * would encode a guarantee the document does not make, and invite
   * `res.assessment.length` at the call site - which throws against any
   * deployment older than yesterday.
   */
  recap?: string | null;
  assessment?: ComprehensionCheckpoint[];
  /**
   * How the parser grouped the segments - ON THIS RESPONSE, as of 18 Sep.
   *
   * It was fetched separately, which cost every lesson open a second request
   * for a field the first response already carried. The docblock on
   * `LessonModule` has said since 31 Aug that both detail routes return the
   * same fields "modules and segment review flags included"; nothing acted on
   * it, so `lessonsApi.modules` kept asking `/api/v1/lessons/{id}` for what
   * `/api/content/lessons/{id}` had already sent.
   *
   * Checked against the deployed spec rather than the docblock: both paths
   * resolve to this same `LessonDetailResponse` schema, and `modules` is in
   * its `required` list.
   *
   * Typed OPTIONAL anyway. Required in today's document is not the same as
   * present in every deployment a school is running, and the cost of being
   * wrong is `res.modules.length` throwing on lesson open. Absent means
   * ungrouped, which is what the separate call's failure already meant.
   */
  modules?: LessonModule[];
}

/**
 * How the parser grouped the segments.
 *
 * The two lesson-detail routes were once NOT interchangeable - the content
 * route carried the review flags and no modules, the v1 route the reverse,
 * and a screen wanting both had to ask twice. Backend closed that on 31 Aug:
 * `/api/content/lessons/{id}` and `/api/v1/lessons/{id}` now return the same
 * fields, modules and segment review flags included. One call is enough.
 */
export interface LessonModule {
  id: string;
  title: string;
  /** Shown after the module; null when the parser wrote none. */
  recap: string | null;
  /** Shown before it. */
  preview: string | null;
  sequenceOrder: number;
  /** Which segments belong to it, by segment id. */
  segmentIds: string[];
}

/**
 * How one class is moving through one lesson - `GET /api/v1/lessons/{id}/class-progress`.
 *
 * Shipped 30 Aug against the frontend blockers list; it is the source C06b's
 * progress rows and its "where the class slowed" note had been waiting on.
 *
 * `classId` is REQUIRED, and a lesson does not know which class is being
 * asked about - so the caller derives it from the lesson's own assignments.
 * A lesson assigned only to individuals has no class to report on.
 */
export interface SegmentProgress {
  segmentId: string;
  segmentKey: string;
  title: string | null;
  sequenceOrder: number;
  assignedStudentCount: number;
  completionCount: number;
  /** 0-1. */
  completionRate: number;
  averageTimeSeconds: number | null;
  slowdownCount: number;
  /** The parser's own words about this segment, when it has any. */
  note: string | null;
}

export interface LessonClassProgress {
  lessonId: string;
  classId: string;
  assignedStudentCount: number;
  segments: SegmentProgress[];
  /** Where the class slowed most, if anywhere. */
  slowestSegmentId: string | null;
  /** C06b's dip note, written server-side. */
  slowdownNote: string | null;
}

/**
 * A play session, from `POST /api/v1/lessons/{id}/session`.
 *
 * `resumed` means the backend matched an existing open session rather than
 * opening a new one - so a child returning to a lesson continues one session
 * instead of accumulating orphans.
 */
export interface LessonSessionResponse {
  sessionId: string;
  resumed: boolean;
  /**
   * Where this lesson's after-lesson check was left, and when it stops being
   * resumable (B82, 8 Oct) - the same pair the progress row carries (B49).
   * Neither is required; absent or null is no check to pick up.
   */
  checkPosition?: number | null;
  checkResumableUntil?: string | null;
  /**
   * The depth this session runs at, and the session a reroute came from
   * (SCRUM-178). A `lower` session reads each segment's simplified version,
   * falling back to its body (backend, 9 Oct) - see `atLowerDepth`. After a
   * reroute this route resumes and returns that same lower-depth session.
   */
  depth?: "standard" | "lower";
  reroutedFromSessionId?: string | null;
  /**
   * What the server froze for this session's delivery (`SessionDeliveryResponse`,
   * 18 Oct): the engine config with the active accommodations applied, as it
   * was at `capturedAt`. The config is TYPED, NOT READ. It answers after the
   * first frame, so applying it would reshape a screen the child already sees
   * (rules 6 and 7); whether the session opens first and this becomes the
   * source is a question to Teslim (20 Oct contract check).
   *
   * Its `segmentChoices` and `lessonPreferences` ARE READ (K4, 21 Oct;
   * 741685e, 22 Oct): the sitting's own word on what the child chose - the
   * format section by section, the depth and Slower for the sitting - which
   * wins over the lesson read's everywhere but the section already on
   * screen - see the player.
   */
  deliveryState?: SessionDelivery | null;
  /**
   * Where the server starts this session, zero-based (defaults to 0). For a
   * fresh lesson it can be past the first segment, chosen by next-work. TYPED,
   * NOT READ: whether a lesson opens part-way is a question to Teslim and
   * design (20 Oct contract check). Always 0 on a review sitting, where the
   * player already opens at the top - see `reviewMode`.
   */
  segmentPosition?: number;
  /**
   * TESLIM'S REVIEW MODE (21 Oct, SCRUM-275 #3): this lesson was completed,
   * and the sitting handed back is the COMPLETED one, reopened "for review,
   * not as a new adaptive sitting". The lesson stays completed whatever is
   * written against it. The player takes it as a finished lesson reopened
   * (D22): no in-lesson adapt asks against it, nothing written that would
   * demote it, no choices held. Defaults to false.
   */
  reviewMode?: boolean;
  /**
   * The completed sitting whose saved attempts a review would show. TYPED,
   * NOT READ: the player replays the lesson for review (D22, D100 "Look
   * again"), and no frame draws a review of the saved answers.
   */
  reviewOfSessionId?: string | null;
  /** When the lesson was completed, on a review sitting. TYPED, NOT READ. */
  completedAt?: string | null;
}

/**
 * `POST /session`'s 409 for a lesson completed whose completed sitting cannot
 * be found. The server will not make the lesson unfinished to answer it ("a
 * missing review sitting never resets a completed lesson"), so there is
 * nothing to open, and asking again finds the same.
 */
export const COMPLETED_SESSION_UNAVAILABLE = "completed_session_unavailable";

/** Whether a refused session open was that 409 - read by shape. */
export function isCompletedSessionUnavailable(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 409 &&
    apiErrorCode(err.detail) === COMPLETED_SESSION_UNAVAILABLE
  );
}

/**
 * `OfflineManifestResponse` - what one offline download holds.
 *
 * `sizeBytes`, `files` and `includesMedia` shipped 1 Oct (B31). None is in the
 * schema's `required` list: `sizeBytes` defaults to 0, which no real archive
 * can be, so 0 and absent both mean "not told" and no size is shown.
 */
export interface OfflineManifest {
  lessonId: string;
  version: number;
  segmentCount: number;
  generatedAt: string;
  packageUrl: string;
  /** Measured from the real archive, by the server. */
  sizeBytes?: number;
  files?: string[];
  /**
   * False today for every lesson: media is referenced by URL, not bundled, so
   * a saved lesson is text only without a connection.
   */
  includesMedia?: boolean;
}

/** `OfflineDownloadResponse`, from `POST /api/v1/lessons/{id}/download`. */
export interface OfflineDownload {
  id: string;
  manifest: OfflineManifest;
}

/** `LessonCompletionStatus` - the values progress rows come back with. */
export const LESSON_STATUS = {
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  EXITED: "exited",
} as const;

export type LessonStatus = (typeof LESSON_STATUS)[keyof typeof LESSON_STATUS];

export interface LessonProgressRequest {
  sessionId: string;
  assignmentId?: string | null;
  modulePosition?: number;
  segmentPosition?: number;
  /**
   * Where a child left the after-lesson check: the index of the next question
   * to ask (B49). Sent on the exit write and nowhere else, so the write that
   * leaves a check is the one that says where. Left out, the stored one is
   * kept (B122, 13 Oct), so a segment write never clears it.
   */
  checkPosition?: number | null;
  status: LessonStatus;
}

/**
 * `ConceptOutcomeResponse` - one concept, and how the check-in went on it
 * (B26). The server marks it from the stored answers; nothing here does.
 *
 * `asked` and `correct` are counts of a child's answers. Typed because the
 * contract sends them, and NEVER RENDERED: the screen names the concept, and a
 * number beside it would be a mark (rule 9).
 */
export interface ConceptOutcome {
  conceptId?: string | null;
  conceptName: string;
  asked: number;
  correct: number;
}

export interface LessonProgressResponse {
  lessonId: string;
  status: string;
  modulePosition: number;
  segmentPosition: number;
  /** Untyped in the spec (`additionalProperties: true`), so it is not read. */
  intelligence: Record<string, unknown>;
  /**
   * What "From the check-in" draws (B26). None is in the schema's `required`
   * list, so absent and empty both mean there is nothing to show - never that
   * nothing landed.
   */
  masteredConcepts?: ConceptOutcome[];
  revisitConcepts?: ConceptOutcome[];
  /** The result's paragraph. `""`, its default, is no paragraph. */
  resultNote?: string;
  /**
   * Where the check was left, and the moment it stops being resumable (B49).
   * `checkResumableUntil` is the end of the day the check started, decided by
   * the server so that two tablets agree on when it has lapsed.
   */
  checkPosition?: number | null;
  checkResumableUntil?: string | null;
  /**
   * How the lesson went, decided by the server from its own marks (B98).
   * The write no longer sends one - `ProgressWrite.resultState` is deprecated
   * and never controlled rerouting - and nothing here works one out.
   */
  resultState?: ResultState | null;
  /**
   * The server sending the child back through the lesson (SCRUM-178): a new
   * session at another depth, and the place to start it from.
   */
  reroute?: LessonReroute | null;
}

/** `resultState`'s four values, on the attempt and the progress row alike. */
export type ResultState =
  | "landed"
  | "partly_landed"
  | "nothing_landed"
  | "not_attempted";

/** `LessonRerouteResponse` (SCRUM-178). */
export interface LessonReroute {
  sessionId: string;
  lessonId: string;
  depth: "standard" | "lower";
  /** Zero-based, like every segment position on the wire. */
  segmentPosition: number;
  reason: "nothing_landed" | "not_attempted";
  /**
   * The new lower session's frozen delivery, on a `nothing_landed` reroute;
   * none on `not_attempted`, which keeps its session. TYPED, NOT READ: whether
   * "Start again" takes it is a question to Teslim (20 Oct contract check).
   */
  deliveryState?: SessionDelivery | null;
}

/**
 * One answer to one lesson question - `LessonQuestionAttemptWrite`, deployed
 * 1 Oct.
 *
 * `answer` is the OPTION'S OWN VALUE (`CheckpointOption.value`), not our
 * stringified option id: the server marks it against the stored answer key,
 * and a `"2"` where the key is `2` is a right answer marked wrong. The client
 * never sends a key or a verdict.
 */
export interface LessonQuestionAttemptWrite {
  sessionId: string;
  /**
   * `ComprehensionCheckpoint.id` - "the server-issued question/problem id".
   * Named `problemId` on the write since 8 Oct (it was `questionId`, which
   * the server now refuses); the stored attempt still reads it back as
   * `questionId`.
   */
  problemId: string;
  segmentId?: string | null;
  /**
   * "calculation" (18 Oct) is a calculation step - `problemId` its `stepId` -
   * or the solved calculation, `problemId` the segment's id; `segmentId` is
   * required for both. See `calculationAttemptFor`.
   */
  source?: "checkpoint" | "assessment" | "calculation";
  answer: CheckpointScalar | CheckpointScalar[];
  /** Ours, for idempotent retries. */
  clientAttemptId?: string | null;
  /**
   * "Observed answer time in milliseconds. Missing or implausibly short
   * timing cannot raise mastery" (18 Oct). A whole number, 0 to an hour,
   * measured with `performance.now()` from the question being put to the
   * pick (rule 4) - and, held offline, the time as measured, never one taken
   * at sync. ABSENT WHEN NOTHING WAS MEASURED: never a stand-in (rule 5).
   * Lydia, 17 Oct: two instant right answers must not count as mastered, and
   * the check measured this and dropped it.
   */
  responseTimeMs?: number | null;
  /**
   * Hints the child had before this answer; the server defaults it to 0.
   * Sent only where the player knows a hint was on screen for the question
   * (B28's `after_hint`), as 1 - "at least one" is all it knows.
   */
  hintCount?: number;
}

/** `LessonQuestionAttemptResponse` - one stored answer, marked server-side. */
export interface LessonQuestionAttempt {
  id: string;
  lessonId: string;
  sessionId: string;
  questionId: string;
  segmentId: string | null;
  source: "checkpoint" | "assessment" | "calculation";
  attemptNumber: number;
  /** The question as it stood when answered, snapshotted beside the answer. */
  question: ComprehensionCheckpoint;
  answer: unknown;
  /** NULL MEANS UNMARKABLE, never wrong - see `api/checkpoints.ts`. */
  correct: boolean | null;
  submittedAt: string;
  /**
   * How the lesson stands, derived by the server from the newest marked
   * attempt per problem (B98, 8 Oct). Required on the contract; optional here
   * because a stored row read back from before 8 Oct carries none.
   */
  resultState?: ResultState;
  /**
   * THE HAND-OFF (B94, SCRUM-241). After three server-marked misses on the
   * same problem the answer comes back with `handoffTo: "socratic_panel"`,
   * the prompts to open it with and whether to move on once they are worked
   * through. The client counts no misses and decides none of it.
   */
  handoffTo?: "socratic_panel" | null;
  guidedPrompts?: SocraticHandoffPrompt[];
  /**
   * Default false on the contract. True whenever there is a hand-off; false
   * means there is none (B128), so the player opens no panel without it.
   */
  advanceAfterHandoff?: boolean;
  /**
   * THE GRACE WINDOW (backend 7d97248, Teslim's answer 6, 22 Oct): the
   * moment the server will hand this question off, once a run of three
   * misses exists and it is not yet time - so the third miss can come back
   * with no `handoffTo` and this instead. Counted from the FIRST miss of the
   * run, by age band (`question_support.guidance_deadline`). The spec: "re-read
   * attempts then if the question is still unresolved" - the server pushes
   * nothing when its clock passes it. A SERVER timestamp: waited for on the
   * server's clock (`msUntilServerTime`), never compared with this device's.
   * Null or absent: no deadline, and nothing is scheduled (rule 5).
   */
  handoffAvailableAt?: string | null;
}

/** `SocraticHandoffPrompt` - one guided question a hand-off opens with. */
export interface SocraticHandoffPrompt {
  id: string;
  prompt: string;
}

export const lessonsApi = {
  /**
   * Store one answer. POST /api/v1/lessons/{id}/attempts (201)
   *
   * The player writes every answer to a quick check and to the after-lesson
   * check here, so a child who leaves a check part way keeps the answers they
   * gave (D36). The body is built by `answerFor`, which sends the option's
   * own value rather than its stringified id. Review answers reads them back
   * through `attempts` below, as a resumed check does (B49). Every committed
   * calculation step, and the solved calculation, are written here too
   * (`calculationAttemptFor`), so the engine sees calculation errors.
   */
  saveAttempt: (lessonId: string, body: LessonQuestionAttemptWrite) =>
    api.post<LessonQuestionAttempt>(
      `/api/v1/lessons/${lessonId}/attempts`,
      body,
    ),

  /**
   * The signed-in child's stored answers for a lesson, optionally one
   * session's. GET /api/v1/lessons/{id}/attempts?sessionId=
   */
  attempts: (lessonId: string, sessionId?: string) =>
    api.get<LessonQuestionAttempt[]>(`/api/v1/lessons/${lessonId}/attempts`, {
      params: sessionId ? { sessionId } : undefined,
    }),

  /** One class's progress through this lesson. */
  classProgress: (lessonId: string, classId: string) =>
    api.get<LessonClassProgress>(`/api/v1/lessons/${lessonId}/class-progress`, {
      params: { classId },
    }),

  /** The parsed lesson library. GET /api/content/lessons */
  /** One page: `limit` up to 200, and `offset` since 12 Oct. */
  list: (options?: { limit?: number; offset?: number }) =>
    api.get<LessonSummary[]>("/api/content/lessons", {
      params:
        options?.limit || options?.offset
          ? {
              ...(options.limit ? { limit: options.limit } : {}),
              ...(options.offset ? { offset: options.offset } : {}),
            }
          : undefined,
    }),

  /**
   * One lesson with its ordered segments AND its review flags. Deliberately
   * the content route, not the v1 alias - see `LessonModule`.
   */
  detail: (lessonId: string) =>
    api.get<LessonDetailResponse>(`/api/content/lessons/${lessonId}`),

  /**
   * Ask for a lesson's offline package. POST /api/v1/lessons/{id}/download
   * Takes no body; the manifest carries the archive's size. See
   * `lib/offline/lessonPackage`.
   */
  download: (lessonId: string) =>
    api.post<OfflineDownload>(`/api/v1/lessons/${lessonId}/download`),

  /**
   * What a lesson would cost to keep, WITHOUT keeping it (backend B61, 5 Oct).
   * GET /api/v1/lessons/{id}/offline-manifest is a read and records nothing,
   * unlike `download`. The server builds the archive to measure it, so ask
   * only for lessons about to be shown.
   */
  offlineManifest: (lessonId: string) =>
    api.get<OfflineManifest>(`/api/v1/lessons/${lessonId}/offline-manifest`),

  /**
   * The package itself, as bytes: an `application/zip` holding `lesson.json`
   * and `manifest.json`. GET /api/v1/lessons/{id}/offline-package
   */
  offlinePackage: (lessonId: string) =>
    api.blob(`/api/v1/lessons/${lessonId}/offline-package`),

  /**
   * Approve one segment for students. Per SEGMENT, matching how the screen
   * walks the lesson, and per LESSON rather than per class - backend's ruling:
   * approve once and assign anywhere.
   */
  approveSegment: (lessonId: string, segmentId: string) =>
    api.post<SegmentApproval>(
      `/api/v1/lessons/${lessonId}/segments/${segmentId}/approve`,
    ),


  /**
   * Everything the needs-review state renders, in one read (SCRUM-153).
   *
   * One request rather than one per card: the screen shows the cards and
   * the remaining count together, and a teacher opening a card should not
   * cost a request to find out what Nevo read.
   */
  review: (lessonId: string) =>
    api.get<LessonReview>(`/api/v1/lessons/${lessonId}/review`),

  /**
   * The three things a teacher can do to a key point.
   *
   * EACH RETURNS THE WHOLE REVIEW AGAIN, which is the reason none of them
   * needs a follow-up read: LR-04's count and LR-05's flip to ready come
   * back with the action that caused them. A client that recomputed either
   * from the list it already had would be the disagreement this ticket
   * exists to end.
   */
  acceptKeyPoint: (lessonId: string, keyPointId: string) =>
    api.post<LessonReview>(
      `/api/v1/lessons/${lessonId}/key-points/${keyPointId}/accept`,
    ),

  /** Replace the wording. `extractedText` survives it - see `KeyPoint`. */
  amendKeyPoint: (lessonId: string, keyPointId: string, text: string) =>
    api.patch<LessonReview>(
      `/api/v1/lessons/${lessonId}/key-points/${keyPointId}`,
      { text },
    ),

  removeKeyPoint: (lessonId: string, keyPointId: string) =>
    api.del<LessonReview>(
      `/api/v1/lessons/${lessonId}/key-points/${keyPointId}`,
    ),

  /*
   * C07K'S FOUR WRITES (Teslim's `codex/lesson-review-redesign`, f1ba340).
   *
   * Each returns the whole review, like the three above. The two approvals
   * send back the hash the last read carried: the server signs exactly the
   * material the teacher was shown, and answers 409 `review_content_changed`
   * if it moved underneath them. `acceptKeyPoint` and `approveSegment` are
   * deprecated by these - nothing in the redesigned review calls them.
   */
  approveAllKeyPoints: (lessonId: string, expectedContentHash: string) =>
    api.post<LessonReview>(
      `/api/v1/lessons/${lessonId}/key-points/approve-all`,
      { expectedContentHash },
    ),

  approveAllRewrites: (lessonId: string, expectedContentHash: string) =>
    api.post<LessonReview>(
      `/api/v1/lessons/${lessonId}/rewrites/approve-all`,
      { expectedContentHash },
    ),

  /** Only where the parser found none; an extracted point is amended instead. */
  resolveMissingKeyPoint: (
    lessonId: string,
    segmentId: string,
    write: MissingKeyPointWrite,
  ) =>
    api.put<LessonReview>(
      `/api/v1/lessons/${lessonId}/segments/${segmentId}/key-point`,
      write,
    ),

  /**
   * New wording for the simpler or the longer version. It stays pending, and
   * out of every child's lesson, until the rewrites are approved again; the
   * original is kept as `originalBody`. The response is the review, so the
   * new body is read back from the lesson detail.
   */
  editRewrite: (
    lessonId: string,
    segmentId: string,
    variant: "simplified" | "expanded",
    body: string,
  ) =>
    api.patch<LessonReview>(
      `/api/v1/lessons/${lessonId}/segments/${segmentId}/rewrites/${variant}`,
      { body },
    ),
  /**
   * Open (or re-open) a play session. POST /api/v1/lessons/{id}/session
   * Takes no body.
   */
  startSession: (lessonId: string) =>
    api.post<LessonSessionResponse>(`/api/v1/lessons/${lessonId}/session`, {}),

  /**
   * Record where the student has got to. PUT /api/v1/lessons/{id}/progress
   *
   * `sessionId` is required, so progress cannot be written before a session
   * exists - which is why `useLessonProgress` opens one before it reports
   * anything.
   */
  saveProgress: (lessonId: string, body: LessonProgressRequest) =>
    api.put<LessonProgressResponse>(
      `/api/v1/lessons/${lessonId}/progress`,
      body,
    ),

  /**
   * Hold the child's choice for one section of this sitting on the server
   * (K4, Lydia 21 Oct: "held server-side rather than in browser storage").
   * PUT /api/v1/lessons/{id}/sessions/{session}/segments/{segment}/preferences
   *
   * `sessionId` is the BACKEND's sitting (`POST /session`), and `segmentId`
   * the segment's own id. Partial - send what changed. 409 `format_unavailable`
   * or `depth_unavailable` refuses a choice the section does not have, and
   * `lesson_session_ended` a sitting that has closed. A stored format choice
   * puts `modality_manual_switch` on the signal stream server-side, so the
   * client sends none of its own.
   */
  saveSegmentChoice: (
    lessonId: string,
    sessionId: string,
    segmentId: string,
    body: SegmentChoiceWrite,
  ) =>
    api.put<SegmentChoiceResponse>(
      `/api/v1/lessons/${lessonId}/sessions/${sessionId}/segments/${segmentId}/preferences`,
      body,
    ),
};
