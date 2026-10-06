"use client";

import { ErrorScreen } from "@/components/shared/SystemScreens";

/**
 * Generic error boundary (board 28) - calm, never red, never technical.
 * Route-level boundaries (e.g. the lesson player's) stay closer to their
 * context; this is the app-wide fallback.
 *
 * `unstable_retry`, not `reset`: Next 16's own guidance. `reset` re-renders
 * without re-fetching, so a failed server read failed again on "Try again".
 *
 * The error is reported (B36), with the console read from the path: this one
 * boundary catches the child's sign-in doors as well as everyone else's.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ErrorScreen retry={unstable_retry} error={error} />;
}
