import { forgetReviewAnswers } from "@/components/student/Lesson/reviewStore";
import { retireLegacyProfile } from "@/lib/auth/deviceRoster";
import { forgetOnboardingDraft } from "@/lib/auth/onboarding";
import { retireLegacyDisplayName } from "@/lib/auth/session";
import type { EndedSession } from "@/lib/auth/sessionEnd";
import { purgeStoredCaptures } from "@/lib/profiling/capture";
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
 *    (`retireLegacyProfile`), and the bare chosen-name key builds from
 *    25 Aug wrote (`retireLegacyDisplayName`).
 *  - The baseline's raw taps a run left in IndexedDB when it was abandoned
 *    (`purgeStoredCaptures`).
 *  - The onboarding draft in this tab - a school code, a Student ID and a
 *    first name - unless a child is onboarding on this page right now
 *    (`forgetOnboardingDraft`).
 *
 * ONLY THE LEAVING CHILD'S. Every store here is keyed by account, and another
 * child's entries on the same device are not touched. The exceptions are
 * keyed by nobody: the old profile, which the roster holds; the bare name,
 * which nothing can say is whose; the raw taps, whose run - if one is still
 * going - keeps its stream in memory and writes it again; and an onboarding
 * draft no open screen is using, which is a child who walked away.
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
    () => retireLegacyDisplayName(),
    () => void purgeStoredCaptures(),
    () => forgetOnboardingDraft(),
  ];
  for (const step of steps) {
    try {
      step();
    } catch {
      // Best-effort, and the rest still run.
    }
  }
}
