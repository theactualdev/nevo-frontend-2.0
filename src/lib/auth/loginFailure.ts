import { ApiError, apiErrorCode } from "@/lib/api/client";

/**
 * What a failed PIN unlock actually means, as something a screen can render.
 *
 * A 401 STOPPED BEING ONE THING. Every 401 used to render "That PIN didn't
 * match." For a wrong PIN that is true. For the two other things a 401 now
 * means, it is a lie that blames the child:
 *
 *  - `account_paused` - the PIN was RIGHT and the account is not open. A child
 *    whose parent withdrew consent typed their correct PIN and was told they
 *    had mistyped. They try again, and again, and then ask an adult why they
 *    are locked out of their own account.
 *  - `too_many_attempts` - rate limited. "Try again" is the one instruction
 *    that makes it worse.
 *
 * Backend names which in the 401's own documented description on
 * `POST /api/v1/auth/login/pin`: "authentication_failed when the credential is
 * wrong, account_paused when it is right but the account is not open,
 * too_many_attempts when rate limited".
 *
 * A pure function, and separate from the screen, because the screen cannot be
 * rendered in this test harness - importing the page pulls enough of Next to
 * kill the jsdom worker outright. Classification is the half that can be wrong,
 * so it lives where it can be tested.
 */
/**
 * `wrong_door` is the one member `classifyLoginFailure` never returns.
 *
 * The other four describe a request the server refused. This one describes a
 * request the server ACCEPTED, which the door then refuses: the credentials
 * are correct and the account simply belongs to a different console. It is set
 * at the call site, after a successful login, and it is a sign-in failure for
 * the person in front of the screen even though nothing failed on the wire.
 *
 * Keeping it in this union rather than as a separate flag is what makes the
 * doors' `Record<LoginFailure, ...>` maps do the work: a screen that handles
 * failures cannot forget to handle this one, because the compiler will not let
 * the map be built without it.
 */
export type LoginFailure =
  | "credentials"
  | "ours"
  | "paused"
  | "throttled"
  | "wrong_door";

export function classifyLoginFailure(cause: unknown): LoginFailure {
  const status = cause instanceof ApiError ? cause.status : 0;

  // A 422 means we sent a shape the server rejects - a 6-digit PIN truncated to
  // 4 is the live example - and anything else is the network or the server.
  // Neither is about the child.
  if (status !== 401 && status !== 403) return "ours";

  const code = cause instanceof ApiError ? apiErrorCode(cause.detail) : null;
  if (code === "account_paused") return "paused";
  if (code === "too_many_attempts") return "throttled";

  /*
   * Anything else, INCLUDING a code we do not recognise, is the honest default
   * for a 401: the server rejected these credentials and did not tell us more.
   *
   * The set is deliberately treated as open. The session-validation codes
   * (`session_expired`, `session_revoked`, `session_replaced`) are not in the
   * document at all, so the ones that ARE documented cannot be assumed to be
   * all of them. Guessing here means telling a child the wrong thing about
   * their own account, and "paused" is the worst thing to guess wrong.
   */
  return "credentials";
}

/**
 * The child's doors read one code more than the staff ones: `account_closed`.
 *
 * Backend's 5 Oct answer gives a removed account its own 401 (B58), apart from
 * `account_paused` - not yet named in the deployed spec, whose login 401 lists
 * only the other three - and design ruled that a removed child reads that
 * their account is closed, not that it is on pause (D53). Through
 * `classifyLoginFailure` that code is unrecognised, so a removed child who
 * typed the right PIN was told it did not match - the blame-the-child shape
 * this module exists to stop.
 *
 * A SEPARATE UNION, so the staff doors' `Record<LoginFailure, ...>` maps are
 * not made to carry a state no staff frame draws. Staff keep reading this code
 * as they did before it had a name.
 */
export type LearnerLoginFailure = LoginFailure | "closed";

export function classifyLearnerLoginFailure(
  cause: unknown,
): LearnerLoginFailure {
  if (
    cause instanceof ApiError &&
    (cause.status === 401 || cause.status === 403) &&
    apiErrorCode(cause.detail) === "account_closed"
  ) {
    return "closed";
  }
  return classifyLoginFailure(cause);
}
