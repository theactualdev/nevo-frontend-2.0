import type { Metadata } from "next";
import { EntryCheckFailed } from "@/components/student/Entry/EntryCheckFailed";
import { UNCHECKED_ROUTE } from "@/lib/auth/consentHold";
import { safeNextPath } from "@/lib/auth/nextPath";

// Says nothing about why, like 00d's.
export const metadata: Metadata = {
  title: "Welcome - Nevo",
};

/**
 * The hold for a consent read that failed at a sign-in door (D69) - see
 * `EntryCheckFailed`.
 *
 * A ROUTE RATHER THAN A STATE IN EACH DOOR, so the hold survives a reload: a
 * door holding it in memory would lose it, and the route guard sends a
 * signed-in child who reloads a sign-in door straight to Home.
 *
 * `?next=` is where the child was going, untrusted like every URL value, and
 * never this hold itself.
 *
 * Next.js 16: `searchParams` is a Promise and must be awaited.
 */
export default async function StudentUncheckedPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safe = safeNextPath(next);
  return (
    <EntryCheckFailed
      next={safe?.startsWith(UNCHECKED_ROUTE) ? undefined : safe}
    />
  );
}
