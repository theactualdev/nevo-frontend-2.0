/**
 * Which routes are the immersive player rather than a screen around it: the
 * bare lesson route, and `/review-session`, which reuses the player wholesale.
 *
 * Extracted from `StudentShell` on 21 Sep so the lesson layout can apply the
 * same test: the shell renders these bare, and the layout's `LessonAskNevo`
 * may show only on these. `/review` and `/summary` live under the same route
 * segment and are deliberately NOT the player. They keep the shell's chrome,
 * and with it the shell's own Ask Nevo launcher - IA 31 puts Ask Nevo on the
 * Lesson Summary screen - so the layout draws no second one there.
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
