/**
 * AN ONLINE READ NEVER DOWNGRADES A SAVED COPY (Lydia, 5 Nov, test 9: offline
 * keeps working, and the device marks from the package's key).
 *
 * Every online student read has its marking data held back (Teslim's
 * 41c2f83, `without_held_answers`: these four fields, at any depth), while
 * the offline package keeps them. An online open refreshes a saved lesson
 * with that read (`refreshSavedLesson`), so without this a keyless copy
 * replaced the package's, and offline - where a check with no key is not
 * asked - the lesson lost every check.
 *
 * So a refresh puts back what the read left out, from the copy it replaces,
 * and only that:
 *  - ONLY A FIELD THE READ DOES NOT HAVE AT ALL. A read that carries it - the
 *    strip switched off, or an explicit null saying the lesson has none -
 *    is newer, and wins.
 *  - ONLY ONTO THE SAME ITEM, matched by its own id (`id`, `stepId`,
 *    `questionId`), never by position.
 *  - ONLY FOR THE SAME QUESTION. A key belongs to the question it was
 *    written for: one whose prompt or options have changed since the copy
 *    was saved gets none back, and offline it is then not asked, rather than
 *    marked against an answer written for different words.
 */

/** What the server holds back from an online student read (lesson_contracts.py). */
export const HELD_ANSWER_FIELDS = [
  "answerKey",
  "acceptedAnswers",
  "answer",
  "explanation",
] as const;

/**
 * Package-only, top level: one version of each question's key (9b). An
 * online read never carries it, so a refresh keeps the copy's.
 */
const PACKAGE_ONLY = ["markingKeyVersions"] as const;

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** An item's own id, whichever of the three the payload names it by. */
function identity(item: unknown): string | null {
  if (!isObject(item)) return null;
  for (const key of ["id", "stepId", "questionId"]) {
    const v = item[key];
    if (typeof v === "string" && v !== "") return `${key}:${v}`;
  }
  return null;
}

/**
 * The same question, as far as the words a child answers are concerned: its
 * prompt, its options, and what kind of answer it takes. An item with no
 * prompt is no question, and gets nothing back.
 */
function sameQuestion(fresh: Json, kept: Json): boolean {
  if (typeof fresh.prompt !== "string" || fresh.prompt !== kept.prompt) {
    return false;
  }
  for (const key of ["options", "answerType", "input", "expectedInput"]) {
    if (JSON.stringify(fresh[key]) !== JSON.stringify(kept[key])) return false;
  }
  return true;
}

function restore(fresh: unknown, kept: unknown): unknown {
  if (Array.isArray(fresh)) {
    if (!Array.isArray(kept)) return fresh;
    const byId = new Map<string, unknown>();
    for (const item of kept) {
      const id = identity(item);
      if (id) byId.set(id, item);
    }
    return fresh.map((item) => {
      const id = identity(item);
      return id && byId.has(id) ? restore(item, byId.get(id)) : item;
    });
  }
  if (!isObject(fresh) || !isObject(kept)) return fresh;
  const out: Json = {};
  for (const [key, value] of Object.entries(fresh)) {
    out[key] = restore(value, kept[key]);
  }
  if (sameQuestion(fresh, kept)) {
    for (const key of HELD_ANSWER_FIELDS) {
      if (!(key in fresh) && key in kept) out[key] = kept[key];
    }
  }
  return out;
}

/**
 * `fresh` - the online read - with the marking data it left out put back
 * from `kept`, the saved copy it is about to replace. See above for what is
 * put back, and when.
 */
export function keepingKeys<T extends object>(fresh: T, kept: object): T {
  const out = restore(fresh, kept) as Json;
  const from = kept as Json;
  for (const key of PACKAGE_ONLY) {
    if (!(key in out) && key in from) out[key] = from[key];
  }
  return out as T;
}
