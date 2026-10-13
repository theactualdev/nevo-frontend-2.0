import { api } from "./client";

/**
 * `/api/intelligence/scaffolds/*` - how much support a child is getting on one
 * concept, and how that changes.
 *
 * **THE DIVISION OF LABOUR IS ALREADY RIGHT IN THE SCHEMA, which is the only
 * reason this is safe to wire.** We post what happened - was it right, how long
 * it took, how many hints were open - and the server answers with the next
 * intensity and whether it moved. Nothing here computes a level, a threshold or
 * a streak. Rule 3.
 *
 * **MOST OF WHAT COMES BACK MUST NEVER REACH A SCREEN.**
 * `consecutiveCorrect`, `responseTimeImprovementStreak` and `reducedHintStreak`
 * are engine parameters, exactly as `stability` and `retrievability` are, and
 * the Zero-Tag ruling keeps them off every surface - including accessible
 * names, which is where the scaffold indicator leaked one before.
 * `changeReason` is the engine's reasoning, and frame 38 is explicit that a
 * learner is never shown any of it. They are typed because the contract sends
 * them and shown to nobody.
 */

/**
 * Four values, and it is the FIRST source that can express all four states
 * design drew.
 *
 * 37a draws four circles: Full scaffold, Moderate, Light, Minimal. The
 * adaptation plan's `ScaffoldingLevel` has only THREE (`light | standard |
 * strong`), so `minimal` - one filled dot, the child who is flying - has been
 * structurally unreachable on every lesson since the indicator shipped. Not a
 * bug in the mapping; there was no value to map from.
 */
export type ScaffoldIntensity =
  | "full_support"
  | "partial_support"
  | "hints_only"
  | "independent";

/** Whether the attempt went well. Two values, and `struggled` is not "wrong". */
export type ScaffoldOutcome = "correct" | "struggled";

/** `GET /scaffolds/state/{student_id}/{concept_id}`. */
export interface ScaffoldState {
  studentId: string;
  conceptId: string;
  currentIntensity: ScaffoldIntensity;
  /** Engine parameter. Typed, never rendered. */
  consecutiveCorrect: number;
  /** Engine parameter. Typed, never rendered. */
  responseTimeImprovementStreak: number;
  /** Engine parameter. Typed, never rendered. */
  reducedHintStreak: number;
  lastResponseTimeMs: number | null;
  lastHintCount: number | null;
}

/** Body of `POST /scaffolds/attempt`. */
export interface ScaffoldAttempt {
  studentId: string;
  conceptId: string;
  /**
   * The checkpoint id - `AssessmentQuestion.id`, which the question carried
   * all along (see its note). Never a position in an array, which moves when
   * content is re-authored, and never `correctId`, which is the answer.
   */
  problemId: string;
  /** Lets the server find the question it marks against. */
  lessonId?: string | null;
  segmentId?: string | null;
  /**
   * The child's own pick (B27), at most 400 characters. The server marks it
   * where the attempt names a lesson segment whose calculation it holds.
   */
  answer?: string | null;
  /**
   * The device's verdict. Optional since B27, and the contract still takes it
   * where the server cannot mark the answer itself - see `scaffoldAttemptFor`
   * for why the after-lesson check is one of those places.
   */
  responseCorrect?: boolean | null;
  scaffoldIntensity?: ScaffoldIntensity | null;
  responseTimeMs?: number | null;
  expectedResponseTimeMs?: number | null;
  hintCount?: number;
}

/** 200 of `POST /scaffolds/attempt`. */
export interface ScaffoldDecision {
  state: ScaffoldState;
  previousIntensity: ScaffoldIntensity;
  nextIntensity: ScaffoldIntensity;
  outcome: ScaffoldOutcome;
  /**
   * Whether support moved. **It must not announce itself** - 37a: *"the circles
   * just update, the label never animates"*, and an adaptation transition is
   * felt rather than seen.
   */
  levelChanged: boolean;
  /** The engine's reasoning. NEVER RENDERED. Frame 38. */
  changeReason: string | null;
  /**
   * The server's own words to the child about the change.
   *
   * **REQUIRED ON THE WIRE AND IT HAS NO HOME ON ANY FRAME.** 37a draws the
   * indicator as four dots plus the fixed word "Support" - the state names
   * ("Full scaffold", "Moderate", "Light", "Minimal") are annotations on the
   * design sheet, not copy, and nothing in the frame says anything about a
   * level in words. Rendering this would be inventing a surface, which is the
   * `highlights` situation and was ruled "do not build a surface for it".
   * Typed so it is not erased; raised to design 23 Sep.
   */
  studentMessage: string;
}

/** One past decision. `GET /scaffolds/history/{student_id}`. */
export interface ScaffoldLogEntry {
  studentId: string;
  conceptId: string;
  problemId: string;
  scaffoldIntensity: ScaffoldIntensity;
  outcome: ScaffoldOutcome;
  responseTimeMs: number | null;
  expectedResponseTimeMs: number | null;
  hintCount: number;
  nextScaffoldIntensity: ScaffoldIntensity;
  levelChanged: boolean;
  changeReason: string | null;
}

export const scaffoldsApi = {
  /** Where support stands for one child on one concept. */
  state: (studentId: string, conceptId: string) =>
    api.get<ScaffoldState>(
      `/api/intelligence/scaffolds/state/${encodeURIComponent(studentId)}/${encodeURIComponent(conceptId)}`,
    ),

  /**
   * Report one attempt and receive the decision. Called once per question of
   * the after-lesson check, keyed on the checkpoint's own id - see
   * `ScaffoldAttempt.problemId` and `lib/lessons/scaffoldAttempt`.
   */
  attempt: (body: ScaffoldAttempt) =>
    api.post<ScaffoldDecision>("/api/intelligence/scaffolds/attempt", body),

  /** Past decisions, newest first. `conceptId` narrows server-side. */
  history: (studentId: string, params?: { conceptId?: string; limit?: number }) =>
    api.get<ScaffoldLogEntry[]>(
      `/api/intelligence/scaffolds/history/${encodeURIComponent(studentId)}`,
      { params },
    ),
};
