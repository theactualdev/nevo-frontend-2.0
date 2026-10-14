/**
 * A review session's address, and where it goes back to when it ends.
 *
 * BACK RETURNS TO WHERE YOU CAME FROM (Olayinka, 12 Oct, product-wide). On 14
 * Oct he ruled how that applies to the student console: design's IA (frame
 * 31) wins for ordinary lessons, which keep their destinations, and ONLY the
 * review session follows the rule, because no frame names where it ends. It
 * is opened from one place, the due-review link on Subject Detail, so that
 * link says which subject it was opened from and the review's ways out go
 * back there rather than Home.
 *
 * The parameter arrives in a URL, so it is read as untrusted: only Subject
 * Detail's own address is honoured - one segment under `/student/progress/`,
 * no scheme, no `//`, no dot segment - and anything else is ignored, so it can
 * never turn the end of a review into a way off Nevo.
 */

/** Subject Detail's address, less the subject. */
const SUBJECT_DETAIL = "/student/progress/";

/**
 * One subject, as `subjectSlug` writes it: `encodeURIComponent` leaves only
 * these characters bare. No `/`, `\`, `?`, `#` or whitespace can get through.
 */
const SUBJECT_SEGMENT = /^[A-Za-z0-9\-_.!~*'()%]+$/;

/**
 * The address a `?back=` names, when it is Subject Detail's own - or null for
 * no parameter, or one that names anywhere else.
 */
export function readReviewBack(
  back: string | string[] | undefined | null,
): string | null {
  if (typeof back !== "string" || !back.startsWith(SUBJECT_DETAIL)) return null;
  const segment = back.slice(SUBJECT_DETAIL.length);
  if (!SUBJECT_SEGMENT.test(segment)) return null;
  // A URL resolves `%2e%2e` as `..`, so the dot segments are refused decoded.
  let subject: string;
  try {
    subject = decodeURIComponent(segment);
  } catch {
    return null;
  }
  return subject === "." || subject === ".." ? null : back;
}

/**
 * The review session for one concept, carrying the concept - without which
 * the scheduler is never told what the review was for - and, when it is Subject
 * Detail's own address, where it was opened from.
 */
export function reviewSessionHref(
  lessonId: string,
  conceptId: string,
  back?: string | null,
): string {
  const href = `/student/lessons/${lessonId}/review-session?concept=${encodeURIComponent(conceptId)}`;
  const from = readReviewBack(back);
  return from ? `${href}&back=${encodeURIComponent(from)}` : href;
}
