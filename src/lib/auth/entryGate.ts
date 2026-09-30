import { consentsApi } from "@/lib/api/consents";

/**
 * Where a child goes the moment they get through a door.
 *
 * **DESIGN RULED THIS ON 23 SEP, and the ruling is about the CHILD rather than
 * the route:** *"The gate is on the child's consent state, not on the route
 * they arrived by. Every entry path resolves consent before anything mounts,
 * and PIN sign-in is an entry path. A child in the same state meets the same
 * screen whichever door they use."*
 *
 * So this exists to be the ONE answer all the doors share. There are four -
 * the returning sign-in form, the remembered-device unlock, the SSO callback
 * and the entry link - and four copies of a consent rule is three too many for
 * something that decides whether a child can start.
 *
 * ## What this is NOT
 *
 * **It is not a guard, and it deliberately does not run on every mount.**
 * Design ruled ENTRY. Whether a child already inside the app is stopped from
 * opening a lesson is a different question, still unruled, and it is the one
 * `consent-gate`'s `blocked`, `admin/D25` PC-03 and the 7 Sep SCRUM-80 ruling
 * disagree about. Running this on every mount would answer it by accident. See
 * `docs/RULINGS_23_SEP.md` §2b.
 *
 * ## Why `blocked` and not `granted`
 *
 * `blocked` is the server's own answer to "may this child proceed?".
 * `granted` is false in three of the four consent states (`not_sent`,
 * `pending`, `withdrawn`), so reading it would be the frontend deciding a
 * policy out of a field that does not state one. The engine decides; we render.
 */

/**
 * 00d. Says nothing about consent, and the URL must not either - a child who
 * reads their own address bar learns nothing here, which is the same reason
 * the screen itself does not say why.
 */
export const WAITING_ROUTE = "/student/waiting";

const DEFAULT_DESTINATION = "/student/dashboard";

/**
 * The destination for a child who has just signed in, held at 00d if the
 * server says they may not proceed.
 *
 * **A FAILED READ IS NOT A MISSING CONSENT**, and that is the same ruling
 * `useConsentGate` made for withdrawal and `StudentEntry` made for the link. A
 * dropped network, a backend having a bad minute and a child on 3G are
 * indistinguishable from "not consented" - holding on any of them turns an
 * outage into a wall a child cannot pass and cannot be told about, at the exact
 * moment they have just proved who they are.
 */
export async function studentDestination(
  preferred?: string | null,
): Promise<string> {
  const destination = preferred || DEFAULT_DESTINATION;

  /*
   * Only a child's own door. `consent-gate` is `students/me`, and a teacher or
   * an admin arriving through the shared SSO callback has no student consent
   * to read - asking would be a call that can only fail.
   */
  if (!destination.startsWith("/student")) return destination;

  try {
    const gate = await consentsApi.myConsentGate();
    return gate.blocked ? WAITING_ROUTE : destination;
  } catch {
    return destination;
  }
}

/**
 * The last step out of onboarding: into the first lesson, through the gate.
 *
 * THE FIFTH DOOR. "You're In" pushed the first lesson directly, so a child who
 * joined by link, class code or school code was the one child never checked -
 * and a child the server holds walked straight into a lesson. Named so the
 * sequence cannot quietly go back to pushing the lesson itself.
 */
export async function enterFirstLesson(
  firstLesson: string,
  go: (to: string) => void,
): Promise<void> {
  go(await studentDestination(firstLesson));
}
