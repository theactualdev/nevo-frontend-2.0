/**
 * The player's address for a lesson, carrying the assignment it was opened
 * from.
 *
 * The player reads `?assignment=` and nothing else: it is what every progress
 * write files the child's work under, and what the teacher's note is fetched
 * by. Home built the link with it; the Lessons tab's preview, "You're In" and
 * the warm-up hand-off built it bare - so the same set work, opened from three
 * of the four doors, recorded progress against no assignment and never showed
 * the teacher's note.
 *
 * Omitted when there is no assignment, rather than sent empty: a library
 * lesson is not set work, and saying otherwise files a child's own reading
 * under a teacher's name.
 */
export function lessonHref(
  lessonId: string,
  assignmentId?: string | null,
): string {
  const base = `/student/lessons/${lessonId}`;
  return assignmentId
    ? `${base}?assignment=${encodeURIComponent(assignmentId)}`
    : base;
}
