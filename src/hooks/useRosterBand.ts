"use client";

import { useCallback } from "react";
import { studentsApi } from "@/lib/api/students";
import { bandForRoster, type AgeBand } from "@/lib/profiling/bands";
import { useHydrated } from "./useHydrated";
import { useLiveQuery } from "./useLiveQuery";

export interface RosterBand {
  /** The roster's band for this child, or null when it has none to give. */
  band: AgeBand | null;
  /**
   * The read has answered, failed, or was never going to be made. Until then
   * a caller knows neither the band nor that there is none, so it must not
   * start anything sized by one.
   */
  settled: boolean;
}

/**
 * The child's age band as the roster holds it - the dashboard's
 * `student.ageBand`, a closed set derived server-side from the date of birth
 * since 1 Oct (B5). See `bandForRoster` for the mapping.
 *
 * ONLY FOR A NAMED OWNER, AND ONLY IF THE ANSWER IS THEIRS. `ownerUserId` is
 * the child sitting the activity; with none, nothing is read at all. That
 * matters in onboarding, where a class-code child has no account yet and the
 * device may still hold the PREVIOUS child's session on a shared tablet - the
 * dashboard read would answer with that child's band. The answer is also
 * checked against the owner, so a session that changed under the read cannot
 * band one child by another.
 *
 * A failed read settles with no band, the same as a roster row with none: a
 * flaky network is not a reason to guess.
 */
export function useRosterBand(ownerUserId: string | null): RosterBand {
  const hydrated = useHydrated();
  /*
   * With no owner the read never starts, rather than failing: `useLiveQuery`
   * does not clear `failed` when its next read begins, so a refusal here
   * would leave the owner's own read looking settled while still in flight.
   */
  const run = useCallback(
    () =>
      ownerUserId
        ? studentsApi.myDashboard()
        : new Promise<never>(() => {}),
    [ownerUserId],
  );
  const { data, loading } = useLiveQuery(run, [run]);

  if (!ownerUserId) return { band: null, settled: hydrated };
  if (!hydrated || loading) return { band: null, settled: false };
  return {
    band:
      data?.student?.id === ownerUserId
        ? bandForRoster(data.student.ageBand)
        : null,
    settled: true,
  };
}
