/**
 * How long a confirmation stays in the console's shared message bar.
 *
 * Long enough to read a short line twice, per design's own worked example.
 * Its own module rather than an export of `SystemMessages`: screens' tests mock
 * that component wholesale, and a constant living there vanishes under the
 * mock for anything that imports it - the signed-out door, through
 * `signedOut.ts`, broke two ProfileSettings suites exactly that way.
 */
export const MESSAGE_LEAVES_AFTER_MS = 5000;
