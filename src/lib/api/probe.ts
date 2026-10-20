import { api } from "./client";

/**
 * Onboarding's readiness and Module 4, the domain probe (SCRUM-244).
 *
 * Lydia, 17 Oct: "Onboarding is four modules. Module 4 IS the domain probe
 * ... All four run before any lesson." The server holds which of the four a
 * child has finished and refuses a lesson until all four are in (409
 * `onboarding_required`, see `onboardingGate`). This device never decides
 * that a module is done: it asks.
 */

/**
 * How the server holds one of the four (`OnboardingModule.status`, the three
 * values its schema closes on - `learning_readiness.OnboardingModule`).
 */
export type OnboardingModuleStatus = "pending" | "completed" | "unavailable";

/** One of the four, as the server holds it for this child. */
export interface OnboardingModuleState {
  /** `grid_span`, `pattern_flanker`, `sentence_dot` or `domain_probe`. */
  id: string;
  completed: boolean;
  /**
   * `unavailable` is Module 4 with no question bank in any of the child's
   * subjects (Teslim, 19 Oct: "`domain_probe` returns `completed: true,
   * status: "unavailable"`"). It comes WITH `completed: true` - so the
   * server lets the child on - but nothing was asked and no placement exists,
   * so it is not a module the child sat (`moduleUnavailable`). Outside the
   * schema's `required` list, defaulting to `pending`: absent from a server
   * that predates it.
   */
  status?: OnboardingModuleStatus;
}

/** A subject this child is enrolled in, and whether it has probe items yet. */
export interface OnboardingSubject {
  subjectId: string;
  name: string;
  /**
   * The subject has items to ask. Items are generated from the lessons
   * teachers upload, so a subject nobody has uploaded to has none.
   */
  probeAvailable: boolean;
}

/** `GET /api/v1/students/me/onboarding` (`LearningReadiness`). */
export interface LearningReadiness {
  complete: boolean;
  modules: OnboardingModuleState[];
  subjects: OnboardingSubject[];
  /** The first of the four not yet finished, or null when none is left. */
  nextModule: string | null;
  /**
   * The server's suggested subject for Module 4 (Teslim, 19 Oct: "use
   * probeSubjectId as the server's suggested first subject"): the first of
   * `subjects`, by name, with items. Null when none has any. Outside the
   * schema's `required` list, so absent from a server that predates it.
   */
  probeSubjectId?: string | null;
  /** Always `one_available_subject`: one finished subject completes Module 4. */
  probePolicy?: "one_available_subject";
}

/** One option: the label is what the child reads, the value what is sent. */
export interface ProbeOption {
  value: string;
  label: string;
}

/**
 * One item, as the child sees it. No answer key, by construction.
 *
 * `asked` and `maxQuestions` ride the response and are NOT TYPED HERE, on
 * purpose: a question number over a maximum is a count of a child's test, and
 * nothing a child reads may say how far through a measurement they are
 * (rules 3 and 9). The frame draws the quest map's fourth stop and nothing
 * else, so there is nothing for either to feed.
 */
export interface ProbeQuestion {
  subjectId: string;
  itemId: string;
  question: string;
  options: ProbeOption[];
}

/**
 * The probe has what it needs for this subject.
 *
 * `entryPoint` - the starting mastery estimate it seeded - and `asked` are
 * NOT TYPED HERE, so no screen can render either: the probe's output is the
 * engine's, never the child's (rules 2, 3 and 9). Since d461b60 the server
 * withholds `entryPoint` from a student anyway: it is always null.
 */
export interface ProbeFinished {
  finished: true;
  subjectId: string;
}

/** A subject with no items yet, said cleanly rather than by failing. */
export interface ProbeEmpty {
  finished: true;
  noItems: true;
  subjectId: string;
}

/** What `next` answers. `answer` answers a question or the finish only. */
export type ProbeStep = ProbeQuestion | ProbeFinished | ProbeEmpty;

/** Which of the three a step is, read off the server's own fields. */
export function probeStepKind(
  step: ProbeStep,
): "question" | "finished" | "empty" {
  if ("itemId" in step && typeof step.itemId === "string") return "question";
  if ("noItems" in step && step.noItems === true) return "empty";
  return "finished";
}

/** Whether the server holds this module as done for the child. */
export function moduleCompleted(
  readiness: LearningReadiness,
  id: string,
): boolean {
  return readiness.modules.some((m) => m.id === id && m.completed);
}

/**
 * Whether the server holds this module as unavailable for the child - asked
 * of nobody, with nothing placed - however `completed` reads.
 */
export function moduleUnavailable(
  readiness: LearningReadiness,
  id: string,
): boolean {
  return readiness.modules.some(
    (m) => m.id === id && m.status === "unavailable",
  );
}

/** The server's id for Module 4. */
export const DOMAIN_PROBE = "domain_probe";

/**
 * The four, in order, by the server's ids (`learning_runtime.
 * ONBOARDING_MODULES`) - and so the quest map's segments for a child who will
 * do all four (design, 9 Oct: "A child who will do three sees three
 * segments"). The profiling run presents the first three; Module 4 needs the
 * child's account and runs once it exists (`DomainProbeModule`).
 */
export const ONBOARDING_MODULES = [
  "grid_span",
  "pattern_flanker",
  "sentence_dot",
  DOMAIN_PROBE,
] as const;

const probePath = (subjectId: string, tail: "next" | "answer") =>
  `/api/v1/probe/${encodeURIComponent(subjectId)}/${tail}`;

export const probeApi = {
  /** Which of the four this child has finished, and which subjects can be probed. */
  readiness: () =>
    api.get<LearningReadiness>("/api/v1/students/me/onboarding"),
  /** The next item for this child in this subject, or what the probe concluded. */
  next: (subjectId: string) => api.get<ProbeStep>(probePath(subjectId, "next")),
  /**
   * Record the child's pick and get the next item back. The response never
   * says whether it was right. Only an answer that FINISHES the probe makes
   * the server record `domain_probe` as done.
   */
  answer: (subjectId: string, body: { itemId: string; chosenOption: string }) =>
    api.post<ProbeQuestion | ProbeFinished>(probePath(subjectId, "answer"), body),
};
