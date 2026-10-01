/**
 * The reading accommodation's TYPOGRAPHIC half, for the checks (D30, 1 Oct).
 *
 * Design split the accommodation in two. Typographic support - size, spacing,
 * contrast - changes how words are presented, not what they say, so it applies
 * everywhere. It had reached only the text segment, so a child with reading
 * support got an accessible lesson and then an inaccessible question: measured
 * on their reading rather than their comprehension, which makes the check
 * measure the wrong thing.
 *
 * The values are 37c's, as `TextSegment` already renders them.
 *
 * LANGUAGE SUPPORT IS NOT HERE. Design rules that question wording is Nevo's
 * and takes simplification too - but nothing on the wire marks which words a
 * person wrote and which Nevo generated, and no simplified wording of a
 * question exists to switch to. Asked of backend; until then the checks get
 * the typographic half only.
 */

/**
 * Body text: 18px, line-height 2.0, +0.02em. Colour is left to the caller.
 * The `sm:` size is restated so it out-ranks a caller's own `sm:text-[17px]`
 * in `cn`, which would otherwise shrink the text back on a tablet.
 */
export const READING_BODY =
  "text-[18px] sm:text-[18px] leading-[2] tracking-[0.02em]";

/** 37c softens body text to 95% where its colour carries no meaning. */
export const READING_INK = "text-nevo-near-black/95";

/**
 * A heading keeps its size - it is already above the 18px body - and takes
 * 37c's heading letter-spacing, +0.01em.
 */
export const READING_HEADING = "tracking-[0.01em]";
