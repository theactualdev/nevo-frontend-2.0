import { ApiError, apiErrorCode } from "@/lib/api/client";

/**
 * What a refused `PATCH /api/v1/admin/email` means to the person who asked.
 *
 * Shared by the two places an administrator can correct their address before
 * confirming it - the setup wizard's step 2 and the signed-in console's D01b
 * AC-05 banner - because the two 409s mean opposite things and must not share
 * a sentence in either:
 *
 * - `email_already_confirmed`: somebody confirmed in another tab while this
 *   form was open. Not a failure - it is the thing they were waiting for - so
 *   the caller re-reads rather than shows an error.
 * - `email_already_in_use`: a real collision, and the one case where the
 *   person has to choose a different address.
 */
export type ChangeEmailFailure =
  | { confirmedElsewhere: true }
  | { confirmedElsewhere: false; message: string };

export function changeEmailFailure(err: unknown): ChangeEmailFailure {
  const code = err instanceof ApiError ? apiErrorCode(err.detail) : null;
  if (code === "email_already_confirmed") return { confirmedElsewhere: true };
  return {
    confirmedElsewhere: false,
    message:
      code === "email_already_in_use"
        ? "That address is already set up with a Nevo account. Try another, or sign in with it instead."
        : "We couldn’t change it just now. Nothing has moved – your original link still works.",
  };
}
