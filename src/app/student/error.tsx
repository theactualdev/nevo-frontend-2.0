"use client";

import { ErrorScreen } from "@/components/shared/SystemScreens";

/**
 * Student-scoped error boundary. Without one, a stumble anywhere outside the
 * lesson player fell through to the app-wide screen, which unmounts the whole
 * shell and drops the student out of their app.
 *
 * BOARD 28'S WORDS AND ART. This read "This bit got stuck" with "Back home",
 * copy no frame draws; board 28's generic error is "Something went wrong. We're
 * on it. Try again or go back." with its illustration, and "Go back" goes home
 * when there is nothing to go back to. No wordmark here: the shell around this
 * boundary already carries it.
 *
 * `unstable_retry` re-fetches the segment; `reset` only re-rendered it.
 *
 * The error goes to the screen so "We're on it" is kept: it is reported (B36).
 */
export default function StudentError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorScreen
      retry={unstable_retry}
      error={error}
      surface="student"
      mark={false}
      className="flex min-h-full flex-1 flex-col items-center justify-center px-8 py-12 text-center text-nevo-near-black"
    />
  );
}
