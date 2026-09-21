/**
 * Which routes are the immersive player rather than a screen around it.
 *
 * Extracted from `StudentShell` on 21 Sep so the lesson layout can apply the
 * same test. `/review` and `/summary` live under the same route segment and are
 * deliberately NOT the player: they have chrome, and Ask Nevo does not belong
 * on them.
 *
 * One definition rather than two, because a second copy of this regex is how
 * the two places end up disagreeing about what a lesson is.
 */
export function isLessonRoute(pathname: string): boolean {
  return (
    /^\/student\/lessons\/[^/]+\/?$/.test(pathname) ||
    /^\/student\/lessons\/[^/]+\/review-session\/?$/.test(pathname)
  );
}
