/**
 * Where an old consent email's link should land.
 *
 * Consent emails sent before backend's 21 Sep template fix (94abd52) point at
 * `/consent/parent?token=…`. That page never existed, and fixing the template
 * did nothing for emails already sitting in parents' inboxes - those links are
 * permanent. The parent page is `/parent/<token>`: THE TOKEN MOVES FROM THE
 * QUERY INTO THE PATH, which is the exact shape that broke SCRUM-154 twice.
 *
 * Null when there is no usable token, and the caller shows not-found rather
 * than guessing: a parent page with no token cannot identify a parent/child
 * pair, and sending them anywhere else would only hide that the link is bad.
 *
 * Encoded because it becomes a path segment. `searchParams` has already
 * decoded it once, so a token carrying `/`, `?` or `%` would otherwise change
 * which route it reaches. For the URL-safe tokens backend issues today this is
 * a no-op.
 */
export function parentPathFromLegacyConsentLink(
  token: string | string[] | undefined,
): string | null {
  // A repeated `?token=a&token=b` arrives as an array; the first is the link.
  const raw = Array.isArray(token) ? token[0] : token;
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return `/parent/${encodeURIComponent(trimmed)}`;
}
