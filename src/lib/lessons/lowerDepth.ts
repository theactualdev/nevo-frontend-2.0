import type { Lesson } from "@/lib/types";

/** No segment reads its simpler version: the standard session. */
export const NOTHING_SIMPLIFIED: ReadonlySet<string> = new Set();

/**
 * A LOWER-DEPTH SESSION READS THE SIMPLER VERSION (SCRUM-178; backend, 9 Oct):
 * "The player should use depthVariants.simplified where available, falling
 * back to the normal body where no simplified variant exists." A session is
 * lower when the server says so - the reroute that opened it, or
 * `LessonSessionResponse.depth` - never because of anything counted here.
 *
 * SO THE SIMPLER VERSION BECOMES THE SEGMENT'S OWN TEXT for this session,
 * rather than a Simplify the player turns on. It is the server's instruction
 * for the whole session, not the child's pick and not an engine adjustment:
 * no chip lights for it, and nothing counts it as an adaptation applied. The
 * Simplify reshape goes with it - offering it would re-render the prose
 * already on screen. Expand and Slower stay the child's to ask for, Slower
 * now pacing the simpler words.
 *
 * `simplified` names the segments whose text is now the simpler version, so
 * `time_on_segment` still says which version was on screen (B45).
 */
export function atLowerDepth(lesson: Lesson): {
  lesson: Lesson;
  simplified: ReadonlySet<string>;
} {
  const simplified = new Set<string>();
  const segments = lesson.segments.map((segment) => {
    const text = segment.text;
    const simpler = text?.body.simplify;
    if (!text || simpler === undefined) return segment;
    simplified.add(segment.id);
    const body = { ...text.body, default: simpler };
    delete body.simplify;
    return { ...segment, text: { ...text, body } };
  });
  return simplified.size > 0
    ? { lesson: { ...lesson, segments }, simplified }
    : { lesson, simplified: NOTHING_SIMPLIFIED };
}
