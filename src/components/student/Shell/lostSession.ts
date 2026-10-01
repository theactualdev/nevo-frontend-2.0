/**
 * Where a child goes when the page loaded on a role cookie whose session was
 * gone (`arrivedWithoutSession`), or null to stay put.
 *
 * The route guard let the request through on the cookie, so the server has
 * already sent the signed-out walkthrough by the time anything can tell. The
 * PIN door is where the proxy would have sent a child with no cookie, and
 * `?next=` brings them back to the screen they were opening.
 *
 * Onboarding stays: it is the flow that CREATES a session, so having none is
 * its ordinary state.
 *
 * Pure, so it can be tested without driving a navigation in jsdom.
 */
export function doorAfterLostSession(pathname: string): string | null {
  if (pathname.startsWith("/student/onboarding")) return null;
  return `/auth/login?next=${encodeURIComponent(pathname)}`;
}
