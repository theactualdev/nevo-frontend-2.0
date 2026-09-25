/**
 * Student PIN length - the length a child CREATES.
 *
 * FOUR, settled by design on 21 Sep (the 28c redraw) and buildable since
 * 25 Sep, when the last two PIN fields on the wire were relaxed. Every PIN
 * field on the deployed spec - `PinLoginRequest`, `PinUpdateRequest`,
 * `PinChoice`, `JoinRequest`, `UnifiedLoginRequest` - is now 4-8 digits. Until
 * then the unlock door was `^\d{6}$`, and a four-digit PIN could be created and
 * never used; that is why this read 6 for a month after the ruling.
 *
 * THIS IS NOT THE LENGTH A CHILD MAY SIGN IN WITH. Every PIN issued before
 * today is six digits, and an administrator's reset still issues six. So the
 * doors that CHECK a PIN accept anything from `STUDENT_PIN_MIN` to
 * `STUDENT_PIN_MAX`, and only the doors that SET one use this. Using this
 * number at a sign-in door is how the seeded demo account was locked out on
 * 31 Aug: the screens were fixed at 4, the account had 6, and the first four
 * digits were submitted on the fourth keystroke with the last two discarded.
 */
export const STUDENT_PIN_LENGTH = 4;

/** What the backend will actually accept, at every door. */
export const STUDENT_PIN_MIN = 4;
export const STUDENT_PIN_MAX = 8;

/**
 * The length to assume for a remembered child whose device never recorded one.
 *
 * Not a guess: until 25 Sep every PIN these screens created was six digits,
 * every door refused any other length, and an administrator's reset still
 * issues six. So a device that remembers a child but not their PIN's length
 * remembers a six-digit PIN. See `RememberedProfile.pinLength`.
 */
export const LEGACY_PIN_LENGTH = 6;
