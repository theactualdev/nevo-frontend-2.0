import type { DensityLevel } from "@/lib/types";

/**
 * The engine's `DensityLevel` on screen - as the only two things design lets
 * it be. D25, 1 Oct: "Density renders as spacing and how many elements sit in
 * view at once, never as a label or chip. The child is never told a density
 * was applied."
 *
 * So it is the gap between a segment's blocks - heading, body, steps,
 * callouts, picture, diagram, player - and nothing else. A low density opens
 * the gaps, so fewer of those blocks share the screen; a high one closes them,
 * so more do. Medium is the segment as it has always been drawn.
 *
 * NOT TYPE, AND NOT WORDS. Size, line height and contrast are the reading
 * accommodation's, and which words are shown is the child's own Simplify,
 * Expand and Slower - a density that reached either would be a second path
 * to something that already has one.
 *
 * The two gaps are this file's choice, not a frame's: no frame draws a
 * density. They sit either side of the 16-22px the segments use today and
 * are listed with design to confirm.
 *
 * Literal class strings, so Tailwind finds them. Applied to the element that
 * wraps the segment's `<article>`.
 */
const SPACING: Record<DensityLevel, string> = {
  low: "[&_article>*+*]:mt-8",
  medium: "",
  high: "[&_article>*+*]:mt-3",
};

/** The spacing for a level, or nothing when the engine gave none. */
export function densitySpacing(level: DensityLevel | null | undefined): string {
  return level ? SPACING[level] : "";
}
