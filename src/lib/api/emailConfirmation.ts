import { api } from "./client";

/**
 * Confirming an administrator's email address (SCRUM-151).
 *
 * THE OPERATIONS DO NOT SHARE AN AUDIENCE:
 *
 *   POST  /verify        PUBLIC       the token IS the credential
 *   GET   /              HTTPBearer   a signed-in admin reading their own state
 *   POST  /resend        EITHER       a session, or the token in the body
 *   PATCH /admin/email   HTTPBearer   correcting a mistyped address
 *
 * **TWO ROWS OF THAT TABLE WERE WRONG WHEN THIS FILE FIRST WROTE IT, 23 Sep.**
 *
 * `/verify` was DOCUMENTED as requiring a bearer and never did - the handler
 * takes no principal and has always been callable signed-out. It had inherited
 * the global security scheme, so the document declared the route closed to
 * exactly the people who must be able to call it. Backend corrected it to
 * `security: []` on 24 Sep. **A declared security block is a claim like any
 * other and can be wrong**; where a route's audience and its declaration
 * disagree, the audience is the fact.
 *
 * `/resend` now takes EITHER credential, and the reasoning is ours back at us,
 * sharper - backend's note on `ResendRequest`: *"the new link goes to the
 * address on the account, never to whoever presented the token. So holding an
 * old link buys nothing except sending mail to its rightful owner, which is
 * what the button is for."*
 *
 * So the expired-link screen CAN offer a resend, and does.
 */

/**
 * `EmailConfirmationState.status`, and all five members.
 *
 * The contract's own description: *"Three outcomes rather than one error,
 * because the console draws three different screens: a link that has run out,
 * a link already used, and a link that never existed."* Those three are
 * `expired`, `already_confirmed` and `invalid`, and collapsing them into one
 * "something went wrong" is the thing the enum exists to prevent.
 */
export type EmailConfirmationStatus =
  | "confirmed"
  | "pending"
  | "expired"
  | "already_confirmed"
  | "invalid";

export interface EmailConfirmationState {
  status: EmailConfirmationStatus;
  /** Nullable: an invalid token identifies nobody, so there is no address. */
  email: string | null;
  expiresAt: string | null;
  /**
   * REQUIRED, and the server's own wording for what happened.
   *
   * Rendered as the body rather than dropped. The five headings are ours
   * because they are structure, but the explanation varies with facts only
   * the server holds - which address, which link, how it failed - and
   * composing our own from a five-member enum would either say less than the
   * server knows or invent the difference.
   */
  message: string;
}

/**
 * `retryAfterSeconds` out of a 429 body, or null if it is not that shape.
 *
 * 429 `confirmation_recently_sent` needs DRAWING, not just catching: one email
 * every two minutes per account, and the budget is shared however it was asked
 * for - a signed-out resend and an in-console resend spend the same one. A
 * screen that says only "that failed" sends somebody pressing the button again
 * into the same wall.
 *
 * Null is a real answer and the copy has to survive it. "Try again in a
 * moment" is honest without a number; "try again in null seconds" is not.
 */
export function retryAfterSeconds(detail: unknown): number | null {
  if (!detail || typeof detail !== "object") return null;
  const inner = (detail as { detail?: unknown }).detail;
  const from = inner && typeof inner === "object" ? inner : detail;
  const n = (from as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export const emailConfirmationApi = {
  /**
   * PUBLIC. The token in the path is the only credential, so this is the one
   * call the confirm route makes.
   */
  verify: (token: string) =>
    api.post<EmailConfirmationState>("/api/v1/admin/email-confirmation/verify", {
      token,
    }),

  /** Signed-in admin, reading where their own address stands. */
  read: () =>
    api.get<EmailConfirmationState>("/api/v1/admin/email-confirmation"),

  /**
   * Another link - for a signed-in admin, OR for somebody holding a dead one.
   *
   * The token is optional: the console sends no body and its session answers.
   * The link screen sends the token it was opened with, whatever state that
   * token is in - expired, superseded, already used. Every one of those is a
   * person with a reason to want another email, and a 401 there would be the
   * dead end this endpoint was widened to remove.
   */
  resend: (token?: string) =>
    api.post<EmailConfirmationState>(
      "/api/v1/admin/email-confirmation/resend",
      token ? { token } : undefined,
    ),

  /**
   * Correct a mistyped address. PATCH /api/v1/admin/email
   *
   * **THIS EXISTED ALL ALONG AND THIS FILE SAID IT DID NOT.** Three screens
   * were built with the control absent, under comments asserting that nothing
   * in the deployed document writes an administrator's address, *"not on this
   * flow, not in Settings, not anywhere."* It was deployed the whole time.
   *
   * The SEARCH was the error. We grepped paths for `confirm|activate|verify` -
   * the words in OUR question - and `/api/v1/admin/email` matches none of
   * them. Third time this exact shape has cost something here, after
   * `certificateExpiresAt` and a design frame we declared absent while it sat
   * in the repo. **Search for the capability, never for the name you would
   * have given it.**
   *
   * ONLY BEFORE CONFIRMATION, and backend's description says why: *"Changing a
   * confirmed address is changing who owns the highest-permission account in a
   * school, and that is not a field edit - it is a decision with its own
   * ticket."* A confirmed address answers 409.
   *
   * On success it supersedes every outstanding link, issues a fresh one, sends
   * it, and returns the new state - so a caller re-renders from the response
   * rather than guessing what changed.
   */
  changeEmail: (email: string) =>
    api.patch<EmailConfirmationState>("/api/v1/admin/email", { email }),
};
