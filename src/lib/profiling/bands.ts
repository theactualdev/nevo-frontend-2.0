/**
 * Age-band resolution for the Baseline Cognitive Profiling module (SCRUM-104).
 * Four tiers drive content, grid sizes and tap-target sizes; the component
 * shells are shared. Band comes from the roster when a signed-in child's
 * dashboard carries one (`bandForRoster`), otherwise from the age the child
 * gives - onboarding Step 1, or the intro screen when that is missing too (see
 * `ProfilingFlow`).
 */

export const AGE_BANDS = {
  /** Primary 1-3. */
  P13: "p13",
  /** Primary 4-6 (primary band in the frames). */
  P46: "p46",
  /** Junior secondary. */
  JSS: "jss",
  /** Senior secondary. */
  SS: "ss",
} as const;

export type AgeBand = (typeof AGE_BANDS)[keyof typeof AGE_BANDS];

/**
 * The band for a stated age, which is what onboarding actually collects.
 *
 * Step 1 asks a child their age and wrote it to the onboarding draft, where
 * nothing ever read it. The band - which decides grid size, span ceiling and
 * whether the dual task runs - came from a FIXTURE year label instead, so a
 * six-year-old and a fifteen-year-old sat the identical Primary 4-6 baseline.
 * Calibrating the calibration run to a mock defeats the point of running it.
 *
 * Boundaries follow the Nigerian levels the year labels encode: P1-3 to about
 * eight, P4-6 to eleven, JSS to fourteen, SS beyond.
 */
export function bandForAge(age: number): AgeBand {
  if (!Number.isFinite(age)) return AGE_BANDS.P46;
  if (age <= 8) return AGE_BANDS.P13;
  if (age <= 11) return AGE_BANDS.P46;
  if (age <= 14) return AGE_BANDS.JSS;
  return AGE_BANDS.SS;
}

/**
 * The band the roster holds for a child, as one of the four here.
 *
 * `ageBand` on the dashboard's `student` was free text until 1 Oct. It is now
 * the spec's closed `AgeBand` (B5): `early_primary`, `upper_primary`,
 * `junior_secondary`, `senior_secondary` - "the closed set the engine already
 * reasons about" - derived server-side from the date of birth on every read.
 * Each names the same school stage as one tier above, so the mapping is one
 * to one: early primary is Primary 1-3, upper primary is Primary 4-6, and the
 * two secondary stages are JSS and SS.
 *
 * Null for anything else, including null itself: a roster row with no date of
 * birth has no band, and the caller asks rather than assumes one.
 */
export function bandForRoster(ageBand: string | null | undefined): AgeBand | null {
  switch (ageBand) {
    case "early_primary":
      return AGE_BANDS.P13;
    case "upper_primary":
      return AGE_BANDS.P46;
    case "junior_secondary":
      return AGE_BANDS.JSS;
    case "senior_secondary":
      return AGE_BANDS.SS;
    default:
      return null;
  }
}

/**
 * Module 1 (Spatial Grid Span) shape per band.
 *
 * EVERY BAND RAN THE PRIMARY 4-6 PROTOTYPE'S NUMBERS: a span of 3 to 5 or 6
 * and a 660ms highlight, for a six-year-old and a sixteen-year-old alike. The
 * Module 1 frame states each band's own, and those are used.
 *
 * Sources, cited per row below:
 *  - "09" is `onboarding-assessment/09 Module 1 - Spatial Grid Span`, the
 *    per-band `params` lines. Design's 6 Oct pass settled P4-6 and SS there
 *    (D72, D73, D74), so 09 now wins over the prototype for every band.
 *  - "11" is `11 Profiling Prototype Playable`, which is the Primary 4-6 band
 *    only (4x4): `seqStart 3`, `seqMax 6` at :173, `lit 660` at :202. Nothing
 *    here comes from it any more.
 */
export interface GridSpanConfig {
  /** Grid is n x n. */
  n: number;
  /** Adaptive span start / ceiling. */
  spanStart: number;
  spanMax: number;
  /**
   * How long each tile stays lit (ms), on every playback of the module.
   *
   * NO BAND SLOWS AFTER A MISS (D74, 6 Oct: "No, for every band"). The
   * prototype added 300ms lit and 120ms gap per miss (11:202), and round 6
   * kept that for P1-3 and JSS while they were asked. Slowing the playback
   * after a miss changes what is being measured, so a child who missed early
   * would have their span taken on an easier task than everyone else's.
   */
  litMs: number;
  /**
   * SS runs the dual task: a true/false check between watch and recall.
   * Not drawn in the Grid Span frame or the prototype - design approved it as
   * built on 30 Sep. Not a deviation; see `GridSpanModule`'s `DUAL_CHECKS`.
   */
  dual: boolean;
  /** First-round instruction (later rounds use the short forms). */
  instruction: string;
}

export function gridSpanConfig(band: AgeBand): GridSpanConfig {
  switch (band) {
    case AGE_BANDS.P13:
      // 09, BP-P13-M1: "3×3 grid · sequence 2 → 5 tiles · 800ms highlight".
      return { n: 3, spanStart: 2, spanMax: 5, litMs: 800, dual: false, instruction: "Watch the tiles light up, then tap them backwards" };
    case AGE_BANDS.JSS:
      // 09, BP-JSS-M1: "5×5 grid · sequence 4 → 9 tiles · 600ms highlight".
      return { n: 5, spanStart: 4, spanMax: 9, litMs: 600, dual: false, instruction: "Memorize the sequence, then tap them in reverse" };
    case AGE_BANDS.SS:
      // 09, BP-SS-M1: "5×5 grid · sequence 4 → 9 tiles · 600ms highlight ·
      // no slowdown after a miss" (D73, D74, 6 Oct). It ran the prototype's
      // 660 while 09 stated no highlight time for SS.
      return { n: 5, spanStart: 4, spanMax: 9, litMs: 600, dual: true, instruction: "Watch the sequence and answer each check, then tap in reverse" };
    default:
      // 09, BP-P46-M1: "4×4 grid · sequence 3 → 7 tiles · 700ms highlight ·
      // no slowdown after a miss" (D72, D74, 6 Oct). Design settled it over
      // the prototype (11:173, :202), whose 3 → 6 at 660 ran until then.
      return { n: 4, spanStart: 3, spanMax: 7, litMs: 700, dual: false, instruction: "Watch the pattern, then tap the tiles in reverse order" };
  }
}

/** The six baseline dimensions (also the daily warm-up rotation). */
export const BASELINE_DIMENSIONS = [
  "wmc",
  "ps",
  "reading",
  "ans",
  "attention",
  "domain",
] as const;

export type BaselineDimension = (typeof BASELINE_DIMENSIONS)[number];
