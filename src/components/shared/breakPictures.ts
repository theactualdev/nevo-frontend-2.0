/**
 * THE FOUR BREAK PICTURES, SHIPPED AT THE SIZE THEY ARE DRAWN (backlog 20;
 * Olayinka's go, 10 Nov, as a reliability item).
 *
 * They were 1024 to 1536 px PNGs of 466 to 759 KB, sent through the image
 * optimizer. Without `sizes`, `next/image` asks it for 1x and 2x of the
 * `width` given, rounded up to its device sizes: 1920 and 3840 wide for the
 * micro break's 1254. So a child on a school tablet waited on a transform
 * of the whole file, cold the first time (23 Oct: an optimizer request took
 * 21 s and failed).
 *
 * Now each is the same picture - same art, crop and colours - resized and
 * re-encoded as WebP (quality 90, alpha kept), 14 to 20 KB. Each is sized
 * to twice the largest it is ever drawn: the `sm:` size in `BreakScreen`,
 * times 1.2 for the largest text size's zoom (`.nevo-text-zoom`), times 2
 * for a high-density screen. That is 600x600 micro, 480x720 movement,
 * 304x456 consolidation and 816x544 full.
 *
 * Served AS THEY ARE (`unoptimized`): already the right size and format,
 * so the optimizer would only add a cold transform and use the hosting
 * plan's image allowance. A picture that will not load is still asked for
 * again and then becomes the quiet tile (`BreakArt`, #1019).
 *
 * A NEW PICTURE, OR A LARGER PLACE TO DRAW ONE, re-sizes from the full-size
 * original by the same rule. The originals are the PNGs this replaced, in
 * git history (`public/illustrations/break-*.png` at 98a61e5f); no other copy
 * is in the design outputs. `width` and `height` are the files' own, so the
 * space kept for each while it loads has its exact shape.
 */
export const BREAK_PICTURES = {
  micro: {
    src: "/illustrations/break-micro.webp",
    width: 600,
    height: 600,
    unoptimized: true,
  },
  movement: {
    src: "/illustrations/break-movement.webp",
    width: 480,
    height: 720,
    unoptimized: true,
  },
  consolidation: {
    src: "/illustrations/break-consolidation.webp",
    width: 304,
    height: 456,
    unoptimized: true,
  },
  full: {
    src: "/illustrations/break-full.webp",
    width: 816,
    height: 544,
    unoptimized: true,
  },
} as const;
