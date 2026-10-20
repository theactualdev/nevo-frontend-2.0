import { api } from "./client";

/**
 * `/api/intelligence/scaffolds/*` - how much support a child is getting on one
 * concept, and how that changes.
 *
 * **THE DIVISION OF LABOUR IS ALREADY RIGHT IN THE SCHEMA, which is the only
 * reason this is safe to wire.** The server decides the intensity from the
 * answers it marks, and these reads say where it stands. Nothing here computes
 * a level, a threshold or a streak. Rule 3.
 *
 * READS ONLY. `POST /scaffolds/attempt` is not called: since Teslim's 19 Oct
 * contract (d461b60) it refuses a student write without persisted server
 * evidence (422 `server_marked_attempt_required`), and the lesson's own
 * answers already move support.
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

  /** Past decisions, newest first. `conceptId` narrows server-side. */
  history: (studentId: string, params?: { conceptId?: string; limit?: number }) =>
    api.get<ScaffoldLogEntry[]>(
      `/api/intelligence/scaffolds/history/${encodeURIComponent(studentId)}`,
      { params },
    ),
};
