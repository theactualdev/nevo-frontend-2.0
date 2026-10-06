import { consentsApi } from "@/lib/api/consents";
import type { StudentEntryState } from "@/lib/api/studentEntry";
import { doorForRole } from "./consoleDoor";

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
 * and 05 Entry's lookup (`entryRoute`, below) - and four copies of a consent
 * rule is three too many for something that decides whether a child can start.
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

/**
 * Where 05 Entry sends a child once the lookup has matched them.
 *
 * - `waiting`: 00d, with nothing measured, because consent is not given. The
 *   child is not told why.
 * - `age-check`: the school and the parent disagree about the child's date of
 *   birth (backend, B64). They cannot start and can do nothing about it, so
 *   they are told Nevo is checking something with their school and to come
 *   back in a day or two - never what, and never asked to sort it out.
 * - `sign-in`: 00c, because they already have a PIN (B64). A first run would
 *   try to make them a second account.
 * - `first-run`: the transition into 08 Profiling Intro, the baseline, the
 *   learning notice and 15 PIN Creation.
 *
 * **ONLY `given` LETS A CHILD START.** `pending` and `withdrawn` hold, and so
 * would any value the contract adds later: a consent state this client does
 * not know is not a yes. Checked FIRST, so a held child meets 00d whichever of
 * the other three they would have reached - the 23 Sep rule, one screen per
 * state whatever the door.
 *
 * THE AGE CHECK COMES SECOND because "a day or two" is backend's word about
 * the age check alone. A child whose consent is outstanding as well has been
 * promised nothing of the kind, so they get 00d.
 *
 * NOT DRAWN, AND AGAINST AN EARLIER RULING. Design ruled on 23 Sep that a
 * disputed date of birth is 00d, "same screen, same words"
 * (`docs/RULINGS_23_SEP.md` §2c). Backend's B64 gives it words of its own and
 * no frame draws them, so they sit on 00d's layout and are asked of design.
 *
 * A CLEARED CHILD LOOKS NEW. `accountReady` is false for a child whose PIN an
 * adult cleared (SCRUM-216) as well as for a new one - neither has a PIN, and
 * nothing else on the lookup tells them apart. So both take `first-run`, and
 * a cleared child sits the baseline again before 15. Which of the two has
 * arrived is asked of backend rather than guessed.
 */
export type EntryRoute = "waiting" | "age-check" | "sign-in" | "first-run";

export function entryRoute(
  state: Pick<
    StudentEntryState,
    "consentState" | "accountReady" | "ageCheckPending"
  >,
): EntryRoute {
  if (state.consentState !== "given") return "waiting";
  if (state.ageCheckPending === true) return "age-check";
  return state.accountReady ? "sign-in" : "first-run";
}

/** The Observed Interaction Sequence - where an SSO child's first use starts. */
const SSO_FIRST_USE_ROUTE = "/student/onboarding/sequence";

/**
 * Where the SSO callback lands someone, before consent is resolved on top.
 *
 * `SsoCallbackResponse.destination` IS NOT A ROUTE. It is an enum -
 * `observed_interaction` for a child's first use, `home_dashboard` otherwise -
 * and the callback handed it straight to `studentDestination`, which passes
 * anything not under `/student` through untouched. So a successful SSO
 * sign-in would have `router.replace`d to "home_dashboard", a relative path
 * that 404s, and the consent check was never asked. Latent only because
 * nothing can start an SSO flow yet.
 *
 * The enum is about a CHILD's first use, so it decides only a child's route.
 * A teacher or an administrator who comes back through this callback goes to
 * their own console's home, the same doors `consoleDoor` names. A role no door
 * serves gets null, and the callback says it could not sign them in rather
 * than storing a session nothing can use.
 *
 * An unrecognised value lands a child on Home: the dashboard is true of every
 * returning child, whereas guessing "first use" would run the baseline again.
 */
export function ssoLanding(
  role: string | null | undefined,
  destination: string | null | undefined,
): string | null {
  switch (doorForRole(role)) {
    case "student":
      return destination === "observed_interaction"
        ? SSO_FIRST_USE_ROUTE
        : DEFAULT_DESTINATION;
    case "teacher":
      return "/teacher/dashboard";
    case "admin":
      return "/admin";
    default:
      return null;
  }
}
