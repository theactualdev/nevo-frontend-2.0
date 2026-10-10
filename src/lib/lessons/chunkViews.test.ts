import { describe, expect, it } from "vitest";
import { chunkCrossing, sightingOf, type ChunkState } from "./chunkViews";

/**
 * `reading_chunk_viewed` (SCRUM-234): "A stable reading chunk entered view or
 * was passed. A later entered event after passed is a reread."
 *
 * The rule these pin is that the client reports the two crossings and reads
 * nothing into them. A reread is the server's to count from the pair, so
 * there is no count here to get wrong - but a `passed` sent for a chunk the
 * child scrolled back up from, or never saw, would be a reread the server
 * counts that never happened.
 */

/** Feeds a run of sightings through, returning the actions it produced. */
function run(...seen: ("in" | "above" | "below")[]): string[] {
  let state: ChunkState | undefined;
  const actions: string[] = [];
  for (const s of seen) {
    const next = chunkCrossing(state, s);
    state = next.state;
    if (next.action) actions.push(next.action);
  }
  return actions;
}

describe("what a chunk crossing the screen is", () => {
  it("is entered when it comes on screen, once", () => {
    expect(run("in", "in")).toEqual(["entered"]);
  });

  it("is passed when it goes off the top after being read", () => {
    expect(run("in", "above")).toEqual(["entered", "passed"]);
  });

  it("is nothing when it goes off the bottom: the child scrolled back up", () => {
    expect(run("in", "below")).toEqual(["entered"]);
  });

  it("is entered again on the way back down, which the server reads as a reread", () => {
    expect(run("in", "above", "in")).toEqual(["entered", "passed", "entered"]);
  });

  it("is never passed when it was never on screen", () => {
    // Below the fold at first, then flung past between two frames.
    expect(run("below", "above")).toEqual([]);
  });

  it("is passed once however many times it is seen above", () => {
    expect(run("in", "above", "above")).toEqual(["entered", "passed"]);
  });
});

describe("which side a chunk went off", () => {
  const rect = (top: number, bottom: number) => ({ top, bottom }) as DOMRect;
  const root = { top: 0, height: 800 } as DOMRect;

  it("is on screen whenever it intersects", () => {
    expect(
      sightingOf(
        { isIntersecting: true, boundingClientRect: rect(-50, 50), rootBounds: root },
        800,
      ),
    ).toBe("in");
  });

  it("is above when the page carried it off the top", () => {
    expect(
      sightingOf(
        { isIntersecting: false, boundingClientRect: rect(-300, -20), rootBounds: root },
        800,
      ),
    ).toBe("above");
  });

  it("is below when it sits under the fold", () => {
    expect(
      sightingOf(
        { isIntersecting: false, boundingClientRect: rect(820, 1000), rootBounds: root },
        800,
      ),
    ).toBe("below");
  });

  it("is above when the column clipped it off its top, still inside the viewport", () => {
    // The column starts under the top bar, so a chunk scrolled out of it can
    // sit at 20-90px: below the viewport's top edge, above what is visible.
    expect(
      sightingOf(
        { isIntersecting: false, boundingClientRect: rect(20, 90), rootBounds: root },
        800,
      ),
    ).toBe("above");
  });

  it("measures against the viewport when the observer gives no root", () => {
    expect(
      sightingOf(
        { isIntersecting: false, boundingClientRect: rect(700, 760), rootBounds: null },
        600,
      ),
    ).toBe("below");
  });
});
