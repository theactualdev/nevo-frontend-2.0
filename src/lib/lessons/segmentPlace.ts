/**
 * Where a child is in a lesson, as their progress row states it (backend B51,
 * 5 Oct) - for the rings Home and the Lessons tab draw.
 *
 * WHAT THE TWO NUMBERS MEAN, NOW THAT SOMEBODY SAID. `segmentPosition` is a
 * ZERO-based cursor, not an ordinal - deliberately not the counting of a
 * segment's own one-based `sequenceOrder`. `segmentCount` is every segment in
 * the lesson, which is every segment a child plays; `reviewSegmentCount` is a
 * subset of those flagged for a teacher, and is never subtracted. So the
 * fraction is `segmentPosition / segmentCount`, and a child at position 2 of a
 * 10-segment lesson is on "segment 3 of 10". Both readings are backend's, word
 * for word; nothing here is a threshold or a cut-off.
 *
 * Until B51 neither was stated, so the ring and the bar were drawn as a plain
 * status mark (design D21, 1 Oct: "a plain status mark, not a fraction, unless
 * the real fraction is on the wire"). It is on the wire now, on the same row
 * as the position, so nothing is read from a second source.
 *
 * NEVER A PERCENTAGE (rule 9). The fraction is drawn, and only drawn. What a
 * screen reader says is the position in words - "Segment 3 of 10" - the same
 * words the shared `ProgressBar` speaks in the player.
 *
 * NULL IS THE NOTHING-STATE (rule 5): no count, a count of 0 (the schema's
 * default, which no playable lesson has), or a position the count cannot hold.
 * A row that contradicts itself draws the plain mark, never a clamped arc.
 */
export interface SegmentPlace {
  /** `segmentPosition / segmentCount`, 0 to just under 1. Drawn, never printed. */
  fraction: number;
  /** "Segment 3 of 10" - what a screen reader says instead of the fraction. */
  words: string;
}

export function segmentPlace(
  row:
    | { segmentPosition?: number | null; segmentCount?: number | null }
    | null
    | undefined,
): SegmentPlace | null {
  const position = row?.segmentPosition;
  const count = row?.segmentCount;
  if (
    typeof position !== "number" ||
    typeof count !== "number" ||
    !Number.isInteger(position) ||
    !Number.isInteger(count) ||
    count <= 0 ||
    position < 0 ||
    position >= count
  ) {
    return null;
  }
  return {
    fraction: position / count,
    words: `Segment ${position + 1} of ${count}`,
  };
}
