import type { QuickCheck } from "@/lib/types/lesson";

/**
 * Comprehension checkpoints - the questions a lesson can ask mid-flow.
 *
 * Typed against the deployed `ComprehensionCheckpoint` schema (3 Sep). It had
 * been `unknown[]` here because the spec carried no shape for it; it does now.
 *
 * The backend's own handoff note is the thing to hold onto: some lessons were
 * parsed before this contract and have no recoverable answer key, and rather
 * than invent one the backend returns `answerKey: null`. A null key means WE
 * CANNOT MARK THIS, and the distance between "cannot mark" and "wrong" is the
 * whole point - a child told they are wrong against nothing is the defect this
 * file exists to prevent.
 */

export type CheckpointAnswerType =
  | "single_choice"
  | "multiple_choice"
  | "text"
  | "numeric"
  | "boolean";

/** A scalar an answer can be. `answerKey` is one of these, a list, or null. */
export type CheckpointScalar = string | number | boolean;

export interface CheckpointOption {
  value: CheckpointScalar;
  label: string;
}

export interface ComprehensionCheckpoint {
  id: string;
  /** Nullable - a checkpoint need not resolve to a concept. */
  conceptId: string | null;
  conceptName: string | null;
  prompt: string;
  answerType: CheckpointAnswerType;
  options: CheckpointOption[];
  /** NULL MEANS UNMARKABLE, never "no answer matched". */
  answerKey: CheckpointScalar | CheckpointScalar[] | null;
  explanation: string | null;
  /**
   * A string in the contract, defaulting to "after_segment" - NOT the integer
   * the handoff PDF's example showed. Where the checkpoint sits, not an index.
   */
  position: string;
  /**
   * How the question is put to the child, decided SERVER-SIDE (B16, 1 Oct).
   * Defaults to "text". The client never picks this: a preferred modality
   * held against a child is the thing rule 1 forbids, so it is read and
   * obeyed, never derived. Optional here because content stored before it
   * existed does not carry it.
   */
  format?: "text" | "spoken";
  /** The spoken prompt's recording. Only meaningful when `format` is spoken. */
  promptAudioUrl?: string | null;
}

/**
 * The outcome of marking. Three states, not two: a checkpoint we cannot mark
 * is its own answer, and callers are forced to handle it because "unmarkable"
 * is not assignable to a boolean.
 */
export type MarkResult = "correct" | "incorrect" | "unmarkable";

/** Compare loosely enough to survive "2/4" vs 2/4, strictly enough to be right. */
function sameScalar(a: CheckpointScalar, b: CheckpointScalar): boolean {
  if (typeof a === "boolean" || typeof b === "boolean") {
    const norm = (v: CheckpointScalar) =>
      typeof v === "boolean" ? v : String(v).trim().toLowerCase() === "true";
    return norm(a) === norm(b);
  }
  if (typeof a === "number" || typeof b === "number") {
    const na = Number(a);
    const nb = Number(b);
    // Both must actually be numbers; NaN === NaN is false and should be.
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/**
 * Mark a response against a checkpoint.
 *
 * Returns "unmarkable" - never "incorrect" - when the checkpoint carries no
 * answer key. Legacy content reaches here, and the honest thing to tell a
 * child is nothing at all rather than that they were wrong.
 *
 * `multiple_choice` compares as a SET: order does not matter, but every
 * expected value must be present and nothing extra. A partial selection is
 * incorrect rather than correct-so-far.
 */
export function markCheckpoint(
  checkpoint: Pick<ComprehensionCheckpoint, "answerKey" | "answerType">,
  response: CheckpointScalar | CheckpointScalar[] | null | undefined,
): MarkResult {
  const key = checkpoint.answerKey;
  if (key === null || key === undefined) return "unmarkable";
  if (response === null || response === undefined) return "incorrect";

  const keyList = Array.isArray(key) ? key : [key];
  const given = Array.isArray(response) ? response : [response];

  if (checkpoint.answerType === "multiple_choice" || Array.isArray(key)) {
    if (given.length !== keyList.length) return "incorrect";
    const unmatched = [...keyList];
    for (const g of given) {
      const at = unmatched.findIndex((k) => sameScalar(k, g));
      if (at === -1) return "incorrect";
      unmatched.splice(at, 1);
    }
    return unmatched.length === 0 ? "correct" : "incorrect";
  }

  if (given.length !== 1) return "incorrect";
  return sameScalar(keyList[0], given[0]) ? "correct" : "incorrect";
}

/** Can this checkpoint be marked at all? */
export function isMarkable(checkpoint: ComprehensionCheckpoint): boolean {
  return checkpoint.answerKey !== null && checkpoint.answerKey !== undefined;
}

/**
 * Adapt a live checkpoint to the `QuickCheck` the lesson player already draws.
 *
 * Returns null - meaning "do not show this" - for anything that cannot honestly
 * drive that surface:
 *
 *   - no answer key, because the player GATES on a quick check and a child
 *     could never satisfy one we cannot mark. An unmarkable checkpoint must
 *     not become a locked door.
 *   - no options, or an answer key that is not among them, because the sheet
 *     is single-select and would otherwise present a question with no right
 *     answer to pick.
 *   - `multiple_choice`, which the sheet cannot express - it takes one tap.
 *
 * The notes are OURS. The contract carries an `explanation`, which is used for
 * the correct note when present; the recovery note stays the product's own
 * always-continuous wording rather than a parse's phrasing.
 *
 * THE RECOVERY NOTE IS THE LESSON CHECK FRAME'S, as far as a field carries it.
 * The frame reads "Not quite - oxygen is what plants give out. Let's look
 * again. Your progress is saved." No field explains a wrong option, and
 * nothing here knows whether a progress write landed, so both of those stay
 * out rather than being written for it. It said "We'll come back to it",
 * which is the after-lesson check's line and a promise nothing here keeps.
 *
 * EACH OPTION KEEPS ITS OWN VALUE beside the stringified id. The id is what
 * the sheet compares taps by; the value is what `POST /attempts` must send,
 * because the server marks the answer against the key and a `"2"` where the
 * key is `2` is a right answer marked wrong.
 *
 * A SPOKEN CHECK CARRIES ITS RECORDING (B16). Only when the server said
 * spoken AND sent a recording: spoken with no URL has nothing to play, and the
 * printed question - which every check keeps - is then the whole of it.
 */
export function toQuickCheck(
  checkpoint: ComprehensionCheckpoint,
): QuickCheck | null {
  if (!isMarkable(checkpoint)) return null;
  if (checkpoint.answerType === "multiple_choice") return null;
  if (Array.isArray(checkpoint.answerKey)) return null;
  if (checkpoint.options.length < 2) return null;

  const key = checkpoint.answerKey as CheckpointScalar;
  const correct = checkpoint.options.find((o) => sameScalar(o.value, key));
  if (!correct) return null;

  const promptAudio =
    checkpoint.format === "spoken" ? checkpoint.promptAudioUrl?.trim() : null;

  return {
    id: checkpoint.id,
    question: checkpoint.prompt,
    options: checkpoint.options.map((o) => ({
      id: String(o.value),
      label: o.label,
      value: o.value,
    })),
    correctId: String(correct.value),
    correctNote:
      checkpoint.explanation?.trim() ||
      "That's it - you've got this one.",
    recoveryNote: "Not quite. Let's look again.",
    ...(promptAudio ? { promptAudio } : {}),
  };
}
