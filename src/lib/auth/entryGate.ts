import { reportClientError } from "@/lib/api/clientErrors";
import { consentsApi } from "@/lib/api/consents";
import type { StudentEntryState } from "@/lib/api/studentEntry";
import { UNCHECKED_ROUTE, WAITING_ROUTE, WITHDRAWN_ROUTE } from "./consentHold";
import { doorForRole } from "./consoleDoor";
import { withNext } from "./nextPath";

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
 * `docs/RULINGS_23_SEP.md` §2b. A WITHDRAWN child inside the app is the server's
 * to stop, with a 403 on the thing they tried - see `withdrawnDoor` (B7).
 *
 * ## Why `blocked` and not `granted`
 *
 * `blocked` is the server's own answer to "may this child proceed?".
 * `granted` is false in three of the four consent states (`not_sent`,
 * `pending`, `withdrawn`), so reading it would be the frontend deciding a
 * policy out of a field that does not state one. The engine decides; we render.
 */

/**
 * The holds - see `consentHold`, where they live so the API client and the
 * sign-in moments can share them: 00d, 00e (D117), and the unchecked hold
 * (D69).
 */
export { UNCHECKED_ROUTE, WAITING_ROUTE, WITHDRAWN_ROUTE };

const DEFAULT_DESTINATION = "/student/dashboard";

/**
 * The destination for a child who has just signed in: where they were going,
 * or a hold.
 *
 * - Blocked by the server: 00d, or 00e when the consent that blocks them was
 *   withdrawn (D117) - there and gone, so 00d's "It will be soon" would be a
 *   lie.
 * - THE READ FAILED: the unchecked hold, carrying where they were going.
 *
 * **A CHECK THAT CANNOT COMPLETE MUST NOT LEAVE THE DOOR OPEN** (D69, design,
 * 4 and 6 Oct, raised as a defect): "If the consent lookup or the account
 * creation fails, the child does not proceed. Today they do." This used to
 * read the opposite way - "a failed read is not a missing consent" - and let
 * a child whose consent nobody could read straight in. It now holds them on
 * frame 28's own failed-read states, with a way to try again; see
 * `EntryCheckFailed`. A network problem, a failed lookup and a missing
 * consent each keep a state of their own: offline, "Something went wrong",
 * and 00d/00e.
 *
 * The failure is reported (B36) before the child is told "We're on it", so
 * that is true. A report that cannot leave - offline - is dropped, and the
 * child is shown the offline state, which promises nothing.
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
    if (!gate.blocked) return destination;
    return gate.status === "withdrawn" ? WITHDRAWN_ROUTE : WAITING_ROUTE;
  } catch (cause) {
    reportClientError(cause, "student");
    return withNext(UNCHECKED_ROUTE, destination);
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
 * - `withdrawn`: 00e (D117) - consent was given and is gone, so 00d's "soon"
 *   would be a lie. Not told why either.
 * - `age-check`: the school and the parent disagree about the child's date of
 *   birth (backend, B64). They cannot start and can do nothing about it, so
 *   they are told Nevo is sorting something out with their school (D121) -
 *   never what, and never asked to sort it out.
 * - `sign-in`: 00c, because they already have a PIN (B64). A first run would
 *   try to make them a second account.
 * - `first-run`: the transition into 08 Profiling Intro, the baseline, the
 *   learning notice and 15 PIN Creation.
 *
 * **ONLY `given` LETS A CHILD START.** `pending` and `withdrawn` hold, and so
 * would any value the contract adds later: a consent state this client does
 * not know is not a yes. Checked FIRST, so a held child meets 00d or 00e
 * whichever of the other three they would have reached - the 23 Sep rule, one
 * screen per state whatever the door. `withdrawn` is 00e, the same screen the
 * sign-in doors and a refused request send them to.
 *
 * THE AGE CHECK COMES SECOND: it is a hold about the child's record, and a
 * child whose consent is outstanding or gone is held for that first.
 *
 * DRAWN SINCE 6 OCT (D121): the Entry frame's "On hold" state, "Nevo is
 * sorting something out with your school", replacing backend's "come back in
 * a day or two", which promised a timeframe nobody controls. See
 * `WaitingOnConsent`.
 *
 * A CLEARED CHILD LOOKS NEW. `accountReady` is false for a child whose PIN an
 * adult cleared (SCRUM-216) as well as for a new one - neither has a PIN, and
 * nothing else on the lookup tells them apart. So both take `first-run`, and
 * a cleared child sits the baseline again before 15. Which of the two has
 * arrived is asked of backend rather than guessed.
 */
export type EntryRoute =
  "waiting" | "withdrawn" | "age-check" | "sign-in" | "first-run";

export function entryRoute(
  state: Pick<
    StudentEntryState,
    "consentState" | "accountReady" | "ageCheckPending"
  >,
): EntryRoute {
  if (state.consentState === "withdrawn") return "withdrawn";
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
