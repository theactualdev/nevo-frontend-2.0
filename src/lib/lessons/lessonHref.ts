/**
 * A lesson link that remembers which assignment it came from.
 *
 * Read back by the player (`?assignment=`, on the server) and sent on every
 * progress write. Omitted when there is no assignment, rather than sent empty:
 * a library lesson is not set work, and saying otherwise files a child's own
 * reading under a teacher's name.
 *
 * Lived inside Home until Today's cards started opening the preview sheet
 * instead of linking straight in. Then the sheet's Start became the link, and
 * two copies of "how a lesson is opened" is how one of them forgets the
 * assignment.
 */
export function lessonHref(lessonId: string, assignmentId?: string): string {
  const base = `/student/lessons/${lessonId}`;
  return assignmentId
    ? `${base}?assignment=${encodeURIComponent(assignmentId)}`
    : base;
}
