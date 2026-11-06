import type { Metadata } from "next";
import { redirect } from "next/navigation";

/**
 * `/parent` - where the written-consent notice's "Open in Nevo" button goes.
 *
 * The backend tells a parent their school recorded written consent with
 * `navigates_to="/parent"` (`api/written_consent.py`, `_tell_the_parent`), and
 * the email worker turns that into `{frontend}/parent`. Nothing served the
 * bare path - only the consent link `/parent/<token>` - so the button landed
 * on a 404 (backlog 61). That notice only goes to a parent who already has an
 * account, so it forwards to their home, which offers sign-in when they are
 * not signed in.
 *
 * The consent link `/parent/<token>` is a different route and is untouched.
 * PUBLIC, like that link: `proxy.ts` does not match `/parent`.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ParentRootPage() {
  redirect("/parent-portal");
}
