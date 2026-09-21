/**
 * Student PIN length.
 *
 * THE CONTRACT IS A RANGE, NOT A NUMBER. `POST /api/v1/auth/login/pin` and
 * `POST /api/v1/auth/pin` both declare `pin` as `^\d{4,8}$` - anything from
 * four to eight digits is a valid PIN as far as the backend is concerned.
 *
 * The screens cannot honour a range, because they auto-submit the moment the
 * boxes fill and a range gives them no way to know when a child is done. So
 * they commit to ONE length, and this is it.
 *
 * That commitment has teeth: a student whose account was issued a PIN of a
 * different length cannot sign in at all, and - because the login screen
 * cannot tell a rejected PIN from a rejected identifier - they are told their
 * PIN is wrong rather than that we sent the wrong number of digits. That is
 * exactly what happened with the seeded demo account: the screens were fixed
 * at 4, the account was issued 6, and the first four digits were submitted on
 * the fourth keystroke with digits five and six discarded.
 *
 * Set to 6 on 31 Aug 2026 to match the accounts the backend is currently
 * issuing. Design frame 00 draws four boxes and says "try 1234", so design and
 * the backend disagree and one of them has to move - raised with Olayinka for
 * the 9pm call. Whichever way that lands, it is this constant that changes,
 * and all three PIN screens follow it.
 *
 * SETTLED ON 21 SEP: FOUR. The 28c redraw stands and the design question is
 * closed. It is not to be reopened here or anywhere else.
 *
 * THIS CONSTANT STILL READS 6, AND CHANGING IT IS A BACKEND CHANGE.
 * That is a contract fact, not a reopening of the decision. Every PIN field on
 * the deployed spec carries `pattern: ^\d{6}$` - `PinLoginRequest`,
 * `PinUpdateRequest`, `JoinRequest` and `UnifiedLoginRequest`, checked 21 Sep.
 * A four-digit PIN is refused with a 422 before the server ever judges it, and
 * `classifyLoginFailure` maps everything that is not 401/403 to "ours" - so a
 * child would be told "we couldn't check that just now" and could not sign in
 * on any door at all, on a device that remembers them or one that does not.
 *
 * So the order is: backend relaxes the pattern to four, then this becomes `4`
 * and all three PIN screens follow it, because they all read this and nothing
 * else. One line, once the wire allows it.
 */
export const STUDENT_PIN_LENGTH = 6;

/** What the backend will actually accept, for validation before we send. */
export const STUDENT_PIN_MIN = 4;
export const STUDENT_PIN_MAX = 8;
