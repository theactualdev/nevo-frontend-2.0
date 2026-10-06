import { DENSITY, MODALITY, type Density, type Modality } from "@/lib/constants";
import type { LessonSegment } from "@/lib/types";

/**
 * `depthShown` on `time_on_segment` (B45): which version of a segment's text
 * was actually on screen. Backend validates it to these three values, because
 * it is read back as evidence about what a child saw.
 */
export type DepthShown = "standard" | "simplified" | "expanded";

/**
 * The version `TextSegment` renders, worked out by the same rule it uses: a
 * density shows its own body where the segment has one, and the standard body
 * where it has not. A Simplify the segment cannot deliver is the standard
 * text on screen, so that is what this says.
 *
 * SLOWER IS STANDARD. Design, 17 Sep: "Slower is about how much arrives at
 * once, which is segmentation and pacing rather than wording." It regroups
 * the words the segment already has, so the wording a child read is the
 * standard one.
 *
 * ANY OTHER MODALITY IS STANDARD TOO. A picture, a recording or an activity
 * has one version only, so nothing simplified or expanded was on screen -
 * which is the fact this field exists to carry (D23), not an absence of one.
 */
export function depthShown(
  segment: LessonSegment,
  modality: Modality,
  density: Density | null,
): DepthShown {
  const body = modality === MODALITY.TEXT ? segment.text?.body : undefined;
  if (!body) return "standard";
  if (density === DENSITY.SIMPLIFY && body.simplify !== undefined)
    return "simplified";
  if (density === DENSITY.EXPAND && body.expand !== undefined)
    return "expanded";
  return "standard";
}
