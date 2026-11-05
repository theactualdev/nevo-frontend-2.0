import { ApiError, apiErrorCode } from "@/lib/api/client";
import {
  RESERVED_TEACHER_STATE_CHANGED,
  TEACHER_ASSIGNMENT_CONFLICT,
  TEACHER_EMAIL_IN_USE,
} from "@/lib/api/invites";

/**
 * What a reissue says, in Lydia's words (31 Oct, Q11a; 2 Nov, 14), wherever
 * it happens - a revoked row in the list, or the New invite form pointing at
 * the revoked invitation.
 */

/** "reissued is what happened" (2 Nov). */
export function reissuedLine(to: string): string {
  return `Invitation reissued to ${to}`;
}

/**
 * The server's refusal, in words - or null when it wasn't a refusal (an
 * outage or a 5xx), which keeps the caller's own try-again line. A refusal
 * never says "try again": the same reissue is refused the same way.
 */
export function reissueRefusal(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  switch (apiErrorCode(err.detail)) {
    case RESERVED_TEACHER_STATE_CHANGED:
      return "This invitation cannot be reissued, because the account it was reserved for has changed.";
    case TEACHER_EMAIL_IN_USE:
      return "This email address is now used by another account, so the invitation cannot be reissued.";
    case TEACHER_ASSIGNMENT_CONFLICT:
      return "The classes on this invitation are now assigned to someone else, so it cannot be reissued.";
    default:
      return "This invitation cannot be reissued.";
  }
}
