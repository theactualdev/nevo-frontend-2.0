import type { Metadata } from "next";
import { Suspense } from "react";
import { SetPasswordForm } from "@/components/teacher/Auth/SetPasswordForm";

export const metadata: Metadata = {
  title: "Activate your account - Nevo",
};

/**
 * C02c Teacher Activation - opened from the invite link the admin sent.
 * Clicking that link IS the verification; the teacher only sets a password.
 *
 * NO FIXTURE IDENTITY. This page used to pass `TEACHER_INVITE.email` and
 * `TEACHER_INVITE.school` as the activating teacher's own details, and the
 * form treats the prop as the fallback when the link carries no `?email=`.
 * So a real invitee could be shown the fixture teacher's address and a
 * school they have never heard of as their own - and the post-activation
 * sign-in would then be attempted against that address.
 *
 * The link is the only thing that knows who is activating. If it does not say,
 * the screen does not guess.
 */
export default function TeacherActivatePage() {
  return (
    <Suspense>
      <SetPasswordForm mode="activation" />
    </Suspense>
  );
}
