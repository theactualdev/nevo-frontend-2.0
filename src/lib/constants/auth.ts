/**
 * Student PIN length - at every door, the ones that set a PIN and the ones
 * that check one.
 *
 * FOUR, settled by design on 21 Sep (the 28c redraw), and the only length
 * since 6 Oct: "Four digits, four boxes. SCRUM-179 settles it and the
 * six-digit reference is stale wherever it appears" (D58). Every field that
 * sets a PIN on the deployed spec - `PinChoice`, `StudentPinSetup`,
 * `PinUpdateRequest` (and its `currentPin`), `JoinRequest` - is exactly four.
 *
 * THE SIGN-IN DOORS USED TO TAKE FOUR TO EIGHT (`STUDENT_PIN_MAX`), and drew
 * six boxes for a child a device remembered from before 25 Sep. Five, seven
 * and eight were only ever a 422: `PinLoginRequest` is `^(?:\d{4}|\d{6})$`.
 * Its six is the legacy length design calls stale. A child still on six can
 * no longer type it here; how such a child moves to four (`pinLength`,
 * `pinChangeRequired`) is backend's to answer, and not built here (D58).
 */
export const STUDENT_PIN_LENGTH = 4;
