import { api } from "./client";

/**
 * Confirming an administrator's email address (SCRUM-151).
 *
 * THE THREE OPERATIONS DO NOT SHARE AN AUDIENCE, and the deployed security
 * blocks say so plainly:
 *
 *   POST /verify    public          the token IS the credential
 *   GET  /          HTTPBearer      a signed-in admin reading their own state
 *   POST /resend    HTTPBearer      a signed-in admin asking for another link
 *
 * That split decides the whole screen. Somebody opening a confirmation link
 * is BY DEFINITION not signed in, so the expired-link screen **cannot offer a
 * resend button** - the only endpoint that could send one needs a session the
 * reader does not have. It points them at sign-in instead, which is where a
 * resend can actually happen. A button that 401s on the screen you reach by
 * failing is worse than no button.
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

  /** Signed-in admin, asking for another link. Not reachable from the link screen. */
  resend: () =>
    api.post<EmailConfirmationState>("/api/v1/admin/email-confirmation/resend"),
};
