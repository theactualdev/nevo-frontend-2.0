/**
 * Global scaffold indicator levels (37a, Intelligence Layer). Four small
 * circles on every lesson player showing how much support the system is
 * quietly giving - full when the learner is finding it hard, minimal when
 * they are flying. A signal the system generates from behaviour, never a
 * difficulty the student picks: no numbers, no percentages, no learner "type".
 */
export const SCAFFOLD_LEVELS = {
  FULL: "full",
  MODERATE: "moderate",
  LIGHT: "light",
  MINIMAL: "minimal",
  /**
   * The engine's `none` (ScaffoldingLevel, 1 Oct): no support is being given,
   * and it SAID so. The indicator shows with no circle filled - frontend §4
   * fills "0 to 4". Not the same as having no level at all, which is the
   * nothing-state and draws no indicator (rule 5).
   */
  NONE: "none",
  /** Indicator hidden entirely. */
  OFF: "off",
} as const;

export type ScaffoldLevel =
  (typeof SCAFFOLD_LEVELS)[keyof typeof SCAFFOLD_LEVELS];

/** Dots filled per level (of 4). */
export const SCAFFOLD_FILLED: Record<ScaffoldLevel, number> = {
  [SCAFFOLD_LEVELS.FULL]: 4,
  [SCAFFOLD_LEVELS.MODERATE]: 3,
  [SCAFFOLD_LEVELS.LIGHT]: 2,
  [SCAFFOLD_LEVELS.MINIMAL]: 1,
  [SCAFFOLD_LEVELS.NONE]: 0,
  [SCAFFOLD_LEVELS.OFF]: 0,
};
