import { describe, expect, it } from "vitest";
import { segmentPlace } from "./segmentPlace";

/**
 * Backend B51, 5 Oct, word for word: `segmentPosition` is a zero-based
 * cursor, `segmentCount` is every segment in the lesson, the fraction is the
 * one over the other, and "a child at position 2 of a 10-segment lesson is on
 * segment 3 of 10". Anything the row cannot vouch for draws nothing.
 */
describe("where a child is in a lesson", () => {
  it("is the position over the count, said as the segment they are on", () => {
    expect(segmentPlace({ segmentPosition: 2, segmentCount: 10 })).toEqual({
      fraction: 0.2,
      words: "Section 3 of 10",
    });
  });

  it("starts at none of the way, on segment 1", () => {
    expect(segmentPlace({ segmentPosition: 0, segmentCount: 4 })).toEqual({
      fraction: 0,
      words: "Section 1 of 4",
    });
  });

  it("is on the last segment short of the whole way", () => {
    expect(segmentPlace({ segmentPosition: 3, segmentCount: 4 })).toEqual({
      fraction: 0.75,
      words: "Section 4 of 4",
    });
  });

  /*
   * Lydia, 9 Nov, restated 10 Nov: "the spoken and written labels must match
   * whatever is actually counted". The cards write "9 sections", so they say
   * "section" too - never the player's "segment" beside a card that says
   * "sections".
   */
  it("says the place in the cards' own word, section", () => {
    const place = segmentPlace({ segmentPosition: 2, segmentCount: 9 });
    expect(place?.words).toBe("Section 3 of 9");
    expect(place?.words).not.toMatch(/segment/i);
  });

  it("is nothing when the row gives no count, or the schema's 0", () => {
    expect(segmentPlace({ segmentPosition: 2 })).toBeNull();
    expect(segmentPlace({ segmentPosition: 2, segmentCount: 0 })).toBeNull();
    expect(segmentPlace(undefined)).toBeNull();
  });

  it("is nothing when the row contradicts itself, never a clamped arc", () => {
    expect(segmentPlace({ segmentPosition: 4, segmentCount: 4 })).toBeNull();
    expect(segmentPlace({ segmentPosition: -1, segmentCount: 4 })).toBeNull();
    expect(segmentPlace({ segmentPosition: 1.5, segmentCount: 4 })).toBeNull();
  });
});
