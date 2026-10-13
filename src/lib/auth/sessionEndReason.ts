/**
 * Why a session ended, as something a screen can render.
 *
 * Backend documents five codes on the 401 of every secured operation:
 * `session_expired`, `session_revoked`, `session_replaced`, `account_paused`
 * and `invalid_session`. Until now NONE of them survived the hop: `client.ts`
 * read the 401, cleared the session and sent every console to one door that
 * says "sessions expire after a period of inactivity", which is false for four
 * of the five.
 *
 * FIVE CODES, FOUR SCREENS - design, 16 Sep:
 *
 *  - `session_expired` and `invalid_session` SHARE the ordinary screen.
 *    "Invalid" means a malformed or unknown token, which is either our bug or
 *    someone tampering. Design: neither is something to put in front of a
 *    teacher, it "reads as alarming and tells them nothing they can act on".
 *  - `session_revoked` as drawn (`student/28a Session Ended - Revoked`). The
 *    frame is the ordinary screen with the inactivity line DELETED - a session
 *    an administrator ended did not time out, and saying it did is a small lie
 *    that sends someone looking for a setting to change.
 *  - `session_replaced` gets its own screen. Design: "the one state where the
 *    honest wording matters, because if it was not them they need to know."
 *  - `account_paused` IS NOT A SESSION STATE AND MUST NOT LOOK LIKE ONE. It is
 *    an account state the person cannot resolve themselves, so it mirrors the
 *    learner's `Account On Pause` frame one level up: a teacher is pointed at
 *    the school administrator exactly as a learner is pointed at their teacher.
 *    NO retry button, because retrying does nothing.
 *  - `account_closed` (B58, backend's 5 Oct answer; not yet in the deployed
 *    spec) is a sixth code and a second account state: a removed account,
 *    which no school can turn back on. The child's
 *    door says closed rather than on pause (D53). The STAFF screen has no
 *    closed state drawn, so it keeps the ordinary copy it showed this code
 *    before the code had a name - raised, not invented here.
 *
 * A pure module, separate from the screen, because the mapping is the half that
 * can be wrong and a component that reaches Next's router cannot be rendered in
 * this test harness. Same reasoning as `loginFailure.ts`, which does this for
 * the sign-in doors.
 *
 * THE WORDS ARE THE STAFF SCREEN'S ONLY. There was a `learner` set as well,
 * adapting these down a register, and nothing ever rendered it: board 28 drew
 * the child's own screens, and `SessionEndScreen` carries their words. The
 * mapping above is shared; the copy below is the console's.
 */

export type SessionEndReason =
  | "expired"
  | "revoked"
  | "replaced"
  | "paused"
  | "closed";

export interface SessionEndCopy {
  heading: string;
  body: string;
  /** The small print under the button. Null when the state has none. */
  note: string | null;
  /**
   * False only for `paused`. Every other state is resolved by signing in
   * again; a paused account is not, and offering the button would invite the
   * one action that cannot work.
   */
  offersSignIn: boolean;
}

/**
 * The wire code to a screen. Unknown and absent both fall to `expired`.
 *
 * Deliberately the honest default rather than a guess: "your session ended,
 * sign in again" is true of every 401 that reaches this point, whatever the
 * reason, whereas guessing `paused` or `replaced` tells someone something
 * specific and possibly false about their own account. The set is treated as
 * open because it has already grown once.
 */
export function sessionEndReason(code: string | null | undefined): SessionEndReason {
  switch (code) {
    case "session_revoked":
      return "revoked";
    case "session_replaced":
      return "replaced";
    case "account_paused":
      return "paused";
    case "account_closed":
      return "closed";
    // `session_expired`, `invalid_session`, anything unrecognised, and nothing.
    default:
      return "expired";
  }
}

/** What the staff screen says for each reason. */
export function sessionEndCopy(reason: SessionEndReason): SessionEndCopy {
  switch (reason) {
    case "revoked":
      return {
        heading: "Your session has ended.",
        // The frame's own second line, and shorter than the expired one on
        // purpose: there is no "where you left off" to return to.
        body: "Sign in again to continue.",
        // No inactivity line. This session was ended deliberately.
        note: null,
        offersSignIn: true,
      };

    case "replaced":
      return {
        heading: "You signed in on another device.",
        body: "Signing in somewhere else ends the session here. Sign in again to carry on using Nevo on this device.",
        // The whole reason this state is drawn separately. If it was not them,
        // this is the only place they will be told.
        note: "If that wasn’t you, change your password and tell your school administrator.",
        offersSignIn: true,
      };

    case "paused":
      return {
        // The learner frame's own words, one level up: a teacher is pointed at
        // the school administrator as a learner is pointed at their teacher.
        // An account state, not a session one, so it does not say "your
        // session has ended".
        heading: "Your Nevo account is on pause.",
        body: "If you have questions, talk to your school administrator.",
        note: null,
        offersSignIn: false,
      };

    // NOT DRAWN for staff. What this code showed before it had a name, so the
    // staff screens do not change under a learner ruling.
    case "closed":
    case "expired":
    default:
      return {
        heading: "Your session has ended.",
        body: "Sign in again to continue where you left off.",
        note: "Sessions expire after a period of inactivity for your security.",
        offersSignIn: true,
      };
  }
}
