import type { Metadata } from "next";
import { Suspense } from "react";
import { SetPasswordForm } from "@/components/teacher/Auth/SetPasswordForm";

export const metadata: Metadata = {
  title: "Activate your admin account - Nevo",
};

/**
 * Where an invited admin sets their password.
 *
 * `SetPasswordForm` in activation mode has been live against
 * `POST /api/v1/admin/team/invitations/accept` all along - the ADMIN TEAM
 * endpoint - but the only route rendering it was `/auth/teacher/activate`.
 * So the one flow that accepts an admin invitation could only be reached at an
 * address reading "teacher", which is not a link to send a proprietor's new
 * deputy head.
 *
 * The component is shared rather than copied: two forms accepting the same
 * endpoint would drift, and this one already carries the reasoning about not
 * guessing the invitee's identity when the link does not name it.
 *
 * `AdminTeamView` builds the link, via `adminActivationLink`.
 *
 * `door="admin"` because the form assumed a teacher: an invited admin was told
 * "Your teacher account is active" and, when the sign-in hop failed, sent to
 * the teacher door.
 */
export default function AdminActivatePage() {
  return (
    <Suspense>
      <SetPasswordForm mode="activation" door="admin" />
    </Suspense>
  );
}
