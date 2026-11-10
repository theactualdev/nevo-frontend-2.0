import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BREAK_PICTURES } from "./breakPictures";

/**
 * THE BREAK PICTURES STAY LIGHT, AND KEEP THEIR SHAPE (backlog 20, 10 Nov).
 * They were 466-759 KB each, which a child on a school tablet waited on. A
 * picture swapped back for a heavy one, or re-exported at another crop,
 * fails here rather than on a slow connection.
 */

/** Under the hub's "roughly 100 KB or less" for each. */
const MOST_BYTES = 100 * 1024;

/** The shapes of the art as designed: square, 2:3 portrait, 3:2 landscape. */
const SHAPE = {
  micro: 1,
  movement: 2 / 3,
  consolidation: 2 / 3,
  full: 3 / 2,
} as const;

const fileOf = (src: string) => join(process.cwd(), "public", src);

/** A WebP's own canvas size, from its VP8X header (written with alpha). */
function webpSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
  expect(bytes.toString("ascii", 12, 16)).toBe("VP8X");
  return {
    width: 1 + bytes.readUIntLE(24, 3),
    height: 1 + bytes.readUIntLE(27, 3),
  };
}

describe("the break pictures as shipped", () => {
  it.each(Object.entries(BREAK_PICTURES))(
    "%s is light, the size it says, and the art's own shape",
    (kind, picture) => {
      const file = fileOf(picture.src);

      expect(statSync(file).size).toBeLessThanOrEqual(MOST_BYTES);
      expect(webpSize(readFileSync(file))).toEqual({
        width: picture.width,
        height: picture.height,
      });
      expect(picture.width / picture.height).toBeCloseTo(
        SHAPE[kind as keyof typeof SHAPE],
        2,
      );
      expect(picture.unoptimized).toBe(true);
    },
  );
});
