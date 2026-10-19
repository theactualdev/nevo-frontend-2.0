import { forgetReviewAnswers } from "@/components/student/Lesson/reviewStore";
import { retireLegacyProfile } from "@/lib/auth/deviceRoster";
import type { EndedSession } from "@/lib/auth/sessionEnd";
import { forgetSignals } from "@/lib/signals/outbox";

/**
 * What a child leaves on a shared tablet, let go of when their session ends
 * (19 Oct browser-storage audit). `AuthContext` hands this every ending the
 * session store announces - Sign out, a door's Back, a lapse, a closed or
 * paused account, the next child signing in over a session nobody ended.
 *
 *  - Their unsent signal events, break feelings among them: one last try with
 *    the token their session held, then deleted whatever it comes to
 *    (`forgetSignals`; a stream still open gets the same in `useSignals`).
 *  - Their after-lesson picks and check-in outcomes in this tab
 *    (`forgetReviewAnswers`).
 *  - The old single remembered profile, once the roster holds it
 *    (`retireLegacyProfile`).
 *
 * ONLY THE LEAVING CHILD'S. Every store here is keyed by account, and another
 * child's entries on the same device are not touched; the old profile is the
 * one exception, because it is a copy of what the roster keeps.
 *
 * NOT THEIR WORK. Held answers, held progress and a parked baseline are what
 * the child did, kept until delivered, and they stay exactly as they were
 * (`pendingProgress`, `pendingBaseline`): deciding otherwise is Olayinka's,
 * and has not been decided.
 *
 * Each step on its own: one store failing must not keep the next one's.
 */
export function forgetLeavingChild({ userId, token }: EndedSession): void {
  const steps = [
    () => forgetSignals(userId, token),
    () => forgetReviewAnswers(userId),
    () => retireLegacyProfile(),
  ];
  for (const step of steps) {
    try {
      step();
    } catch {
      // Best-effort, and the rest still run.
    }
  }
}
