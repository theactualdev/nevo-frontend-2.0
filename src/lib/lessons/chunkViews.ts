/**
 * What a reading chunk crossing the screen means, for `reading_chunk_viewed`
 * (SCRUM-234, B87).
 *
 * The catalogue's trigger: "A stable reading chunk entered view or was
 * passed. A later entered event after passed is a reread." So this reports
 * the two crossings and nothing else. A reread is the SERVER's reading of an
 * `entered` after a `passed`, and no count of them is kept or shown here.
 *
 * Pure, so the rule is tested without a browser's IntersectionObserver.
 */

export type ChunkAction = "entered" | "passed";

/** Where a chunk stands: on screen, off it below, or read past. */
export type ChunkState = "in" | "out" | "passed";

/** Where one observation found it. */
export type ChunkSighting = "in" | "above" | "below";

/**
 * The chunk's next state, and the event its move is, if any.
 *
 * - Coming on screen from anywhere is `entered`, including back down onto a
 *   chunk already passed - that pair is the reread the server counts.
 * - Leaving off the TOP after being on screen is `passed`: the child read on
 *   past it.
 * - Leaving off the BOTTOM is nothing. The child scrolled back up; they did
 *   not pass it.
 * - Never having been on screen is nothing either way. A chunk flung past
 *   between two frames was not read, and saying it was passed would be.
 */
export function chunkCrossing(
  was: ChunkState | undefined,
  seen: ChunkSighting,
): { state: ChunkState; action?: ChunkAction } {
  if (seen === "in")
    return was === "in" ? { state: "in" } : { state: "in", action: "entered" };
  if (was !== "in") return { state: was ?? "out" };
  return seen === "above"
    ? { state: "passed", action: "passed" }
    : { state: "out" };
}

/**
 * Which side of the screen an observation found a chunk on.
 *
 * MEASURED AGAINST THE MIDDLE OF THE ROOT, NOT ITS TOP EDGE. What scrolls is
 * usually the page but can be the lesson column (see the player's
 * `columnReach`), and a chunk clipped off the top of the column can still sit
 * below the top of the viewport. Off screen, a chunk is wholly above what is
 * visible or wholly below it, so its bottom edge is above the middle exactly
 * when it went off the top - whichever one scrolled.
 */
export function sightingOf(
  entry: Pick<
    IntersectionObserverEntry,
    "isIntersecting" | "boundingClientRect" | "rootBounds"
  >,
  viewportHeight: number,
): ChunkSighting {
  if (entry.isIntersecting) return "in";
  const top = entry.rootBounds?.top ?? 0;
  const height = entry.rootBounds?.height ?? viewportHeight;
  return entry.boundingClientRect.bottom <= top + height / 2
    ? "above"
    : "below";
}
