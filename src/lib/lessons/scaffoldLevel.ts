import { SCAFFOLD_LEVELS, type ScaffoldLevel } from "@/lib/constants/scaffold";

/**
 * `ScaffoldIntensity` (the scaffolds engine) -> the indicator's four circles.
 *
 * **FOUR TO FOUR, AND IT IS THE FIRST SOURCE THAT FITS.** 37a draws four
 * states; the adaptation plan's `ScaffoldingLevel` carries three
 * (`light | standard | strong`), so `minimal` - one filled dot, the child who
 * is flying - has been structurally unreachable on every lesson since the
 * indicator shipped. `adaptation.ts` maps what it can and is not wrong to; it
 * simply had no fourth value to map from.
 *
 * The order is the only thing that could be got wrong here, and both sequences
 * run the same way - most support to least - so `independent` is the minimal
 * end and `full_support` the full one.
 */
const LEVEL_FOR_INTENSITY: Record<string, ScaffoldLevel> = {
  full_support: SCAFFOLD_LEVELS.FULL,
  partial_support: SCAFFOLD_LEVELS.MODERATE,
  hints_only: SCAFFOLD_LEVELS.LIGHT,
  independent: SCAFFOLD_LEVELS.MINIMAL,
};

/**
 * The indicator level for an engine intensity, or **null when there is none**.
 *
 * Null rather than a default, and that is rule 5 rather than caution. A value
 * we do not recognise, or a read that never answered, is not evidence that a
 * child needs any particular amount of help - and the indicator is a statement
 * about them. The caller leaves what is on screen alone; it does not fill the
 * gap with a guess in either direction.
 */
export function levelForIntensity(
  intensity: string | null | undefined,
): ScaffoldLevel | null {
  if (!intensity) return null;
  return LEVEL_FOR_INTENSITY[intensity] ?? null;
}
