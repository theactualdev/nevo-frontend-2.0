import { ApiError, apiErrorCode } from "@/lib/api/client";

/**
 * Whether a failed PIN change was the CHILD's current PIN being wrong.
 *
 * **THE DISTINCTION IS THE WHOLE POINT, and this codebase has already been
 * caught on its mirror image.** `PinCreationScreen` renders *"we couldn't save
 * that just now - that's on us, not you"* for a failed write, and that copy
 * exists because the previous version blamed a child for a write failure they
 * could not fix by retyping. A wrong current PIN is the opposite case: it IS
 * the child's, retyping IS the fix, and telling them it was our fault sends
 * them to find an adult about a problem they could have solved themselves.
 *
 * So this is the same shape as `classifyLoginFailure` and separate from the
 * screen for the same reason: classification is the half that can be wrong, so
 * it lives where it can be tested.
 *
 * Backend, 23 Sep: *"on `POST /api/v1/auth/pin` as a signed-in student: if the
 * account already has a PIN, `currentPin` is required and a wrong or missing
 * one is a 403 `current_pin_required`."*
 *
 * **NARROW ON PURPOSE.** Only that code, on that status. Every other 403 on
 * this route is something else - a teacher signed in on the tablet is the one
 * already documented - and treating those as a mistyped PIN would send a child
 * round the retype loop for a problem no retype can fix. That is the exact
 * trap the save-failure copy was written to escape.
 */
export function isCurrentPinRejected(cause: unknown): boolean {
  if (!(cause instanceof ApiError) || cause.status !== 403) return false;
  return apiErrorCode(cause.detail) === "current_pin_required";
}
