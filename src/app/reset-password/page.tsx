import type { Metadata } from "next";
import { Suspense } from "react";
import { TeacherPasswordReset } from "@/components/teacher/Auth/TeacherPasswordReset";

// A credential rides in this URL - never indexed.
export const metadata: Metadata = {
  title: "Reset your password - Nevo",
  robots: { index: false, follow: false },
};

/**
 * WHERE THE BACKEND'S RESET EMAIL LANDS, for every account.
 *
 * `POST /api/v1/auth/password-reset/request` emails a link to
 * `<frontend>/reset-password?token=…` whoever asked - a teacher, an admin, a
 * learner (Teslim's /me spec, section 15). This path answered 404 on
 * nevolearning.com, so every school reset email landed on "page not found"
 * (Hub, 25 Nov). Our own links go to `/auth/teacher/reset` and
 * `/auth/admin/reset`; this is the path the server writes.
 *
 * THE SAME SCREEN, NOT A COPY. It is the shared reset flow those two routes
 * and `/auth/forgot-password` render (C02d and `Nevo Set Password`), with
 * its behaviour unchanged: `?token=` opens the set-password step, `?expired=1`
 * the expired-link state, and nothing at all the request for a fresh link.
 *
 * NO ROLE IS GUESSED. Neither the token nor the `{"status": "password_updated"}`
 * answer says whose account it was, so sign-in is the landing page, which
 * carries every door - as `/auth/forgot-password` already does. An expired
 * link recovers here, on the path the email used.
 *
 * The token is read off the link and posted, nothing more: it is not logged,
 * stored or reported (`clientErrors` drops a query string from what it sends).
 *
 * Outside `/auth`, so its layout is drawn here: the same centred column on
 * cream that `app/auth/layout.tsx` gives every other door.
 */
export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-nevo-cream text-nevo-near-black">
      <Suspense>
        <TeacherPasswordReset signInHref="/" resetHref="/reset-password" />
      </Suspense>
    </div>
  );
}
