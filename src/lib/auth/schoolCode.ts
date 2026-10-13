/**
 * The school code a child types on 05 Entry, as design ruled it (D6) and
 * backend reissued it (SCRUM-201, 30 Sep).
 *
 * FOUR CHARACTERS, NO PREFIX, and drawn from every letter and digit except 0,
 * O, 1 and I - the four a child reads off a whiteboard wrongly. Every older
 * code was regenerated, so the any-length field and its "Check my code" button
 * both went: the fourth character is the end of the code.
 *
 * The contract still bounds `schoolCode` at 2-50 characters. Four is the
 * ruling and the data, and the field draws four cells; nothing here is
 * stricter than what the server would accept.
 */

/** How many cells the code field draws. */
export const SCHOOL_CODE_LENGTH = 4;

/** Anything that cannot appear in a school code: 0, O, 1, I, and non-alphanumerics. */
const NOT_IN_A_SCHOOL_CODE = /[^A-HJ-NP-Z2-9]/g;

/**
 * Upper-cased and filtered to the code's own alphabet, in order.
 *
 * A child who types a lowercase letter gets the capital; a child who types a
 * 0 or an O gets nothing, rather than a character the school's code cannot
 * contain. Returns every valid character, so a pasted or autofilled code can
 * be spread across the cells.
 */
export function schoolCodeChars(raw: string): string {
  return raw.toUpperCase().replace(NOT_IN_A_SCHOOL_CODE, "");
}

/**
 * Write typed characters into the cells, starting at `at`.
 *
 * One character fills one cell. Several - a paste, or a hardware keyboard's
 * autofill - run on into the cells after it and stop at the last. Returns the
 * new cells and the index of the last cell written, or null when nothing
 * typed belonged in a school code, so the caller leaves focus where it is.
 */
export function placeSchoolCode(
  cells: readonly string[],
  at: number,
  raw: string,
): { cells: string[]; last: number | null } {
  const chars = schoolCodeChars(raw);
  const next = cells.slice();
  let last: number | null = null;
  for (const ch of chars) {
    const i: number = last === null ? at : last + 1;
    if (i >= SCHOOL_CODE_LENGTH) break;
    next[i] = ch;
    last = i;
  }
  return { cells: next, last };
}
