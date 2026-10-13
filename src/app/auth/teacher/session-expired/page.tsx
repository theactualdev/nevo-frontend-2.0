import type { Metadata } from "next";
import { ConsoleSessionExpired } from "@/components/shared/ConsoleSessionExpired";
import { sessionEndReason } from "@/lib/auth/sessionEndReason";

export const metadata: Metadata = {
  title: "Session expired - Nevo",
};

/** The teacher console's timeout landing; the door behind it is the teacher's. */
export default async function TeacherSessionExpiredPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; next?: string }>;
}) {
  // `client.ts` puts the backend's own code here on its way out. Anything
  // unrecognised resolves to the ordinary screen, so a hand-typed or stale
  // value can only under-claim. Next.js 16: `searchParams` is a Promise.
  const { reason, next } = await searchParams;
  // Where they were, handed on to the door so signing back in returns them
  // there (T217). A console route only - the door applies the same rule.
  const back = next?.startsWith("/teacher/")
    ? `/auth/teacher?next=${encodeURIComponent(next)}`
    : "/auth/teacher";
  return (
    <ConsoleSessionExpired
      signInHref={back}
      reason={sessionEndReason(reason)}
    />
  );
}
