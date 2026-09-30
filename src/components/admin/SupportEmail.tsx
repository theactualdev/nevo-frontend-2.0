"use client";

import { useSupportContact } from "@/hooks/useSupportContact";

/**
 * Nevo's support address, as backend publishes it - `GET /api/v1/support-contact`,
 * public on purpose, "because a teacher who cannot sign in is exactly who
 * needs it". The admin console hard-coded it in four places while the teacher
 * console read it live, so a change of address would have reached one and not
 * the other.
 *
 * THE PUBLISHED ADDRESS IS THE FALLBACK, not a guess. These links sit inside
 * sentences on screens where the admin may have nothing else - a paused
 * account on the sign-in page, a transfer that has not matched - and a
 * sentence ending "email" with no address is a dead end at the worst moment.
 * The address below is the one on Nevo's public landing page; the live one
 * replaces it as soon as the read answers.
 */
export const PUBLISHED_SUPPORT_EMAIL = "support@nevolearning.com";

export function useSupportEmail(): string {
  const { contact } = useSupportContact();
  return contact?.email?.trim() || PUBLISHED_SUPPORT_EMAIL;
}

/** A mailto link to support. `children` replaces the address as the label. */
export function SupportEmailLink({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const email = useSupportEmail();
  return (
    <a href={`mailto:${email}`} className={className}>
      {children ?? email}
    </a>
  );
}
