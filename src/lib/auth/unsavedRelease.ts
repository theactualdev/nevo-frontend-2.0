/**
 * Stand the "Leave site?" prompt down, because the console itself is leaving.
 *
 * SCRUM-246, part 2: when the session expires there is "no dialog". The
 * console navigates to the session-ended screen on the teacher's behalf, and
 * `useUnsavedGuard`'s `beforeunload` prompt fired over it - a dialog they
 * cannot act on, about a decision already made. The work is kept on the
 * device instead (`lib/drafts/keptDraft`), so there is nothing left to warn
 * about. Set once, by the auth-failure handler, just before it navigates.
 */
let released = false;

export function releaseUnsavedGuards(): void {
  released = true;
}

export function unsavedGuardsReleased(): boolean {
  return released;
}
