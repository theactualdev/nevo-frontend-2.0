"use client";

import { useEffect, useState } from "react";
import { intelligenceApi } from "@/lib/api/intelligence";
import type { AccommodationType } from "@/lib/api/students";
import { getSession } from "@/lib/auth/session";
import { useHasSession } from "./useHasSession";

/** The accommodation flags an `AdaptationPlan` carries. */
export interface ActiveAccommodations {
  attention?: boolean;
  reading?: boolean;
  numerical?: boolean;
}

/**
 * The UDL accommodations Nevo has turned on for THIS child.
 *
 * Every one of these was computed by the engine, listed to the teacher as
 * active, and never applied to the child. `AdaptationPlan.accommodations` is
 * read by the player - a spacious body for `reading`, a chunked flow and
 * dimmed chrome for `attention` - and `toAdaptationPlan` never set it, so it
 * was permanently undefined for every signed-in child. The only plan that ever
 * carried one was the authored mock, which only a signed-OUT visitor sees. The
 * demo had the accommodation; the SEND learner it was built for did not.
 *
 * FROM THE SESSION-START READ (B24, audit 50). `POST /api/intelligence/adapt`
 * carries no accommodation field, so these come from
 * `GET /api/session/state/{id}`: the one read frontend §1 and §4 specify for
 * the start of a lesson, which carries the accommodations, the engine's
 * configuration and the consent state from one moment. It replaces the
 * separate `/api/intelligence/accommodations` read, which the teacher's and
 * SENCo's screens still use for the evidence behind each one.
 *
 * ONLY THE ACCOMMODATIONS ARE APPLIED. The engine configuration it carries is
 * the engine's own parameters, and the contract does not say what any of them
 * changes on screen - see `EngineConfig`. The consent state is already acted
 * on where a lesson opens: a withdrawn child is refused it (B7) and taken to
 * 00e (`withdrawnDoor`).
 *
 * DEFAULTS TO NONE, and note this points the OPPOSITE way to `useConsentGate`,
 * which defaults to allowed. The asymmetry is the point: there, silence must
 * not stop a consented child being measured; here, silence must not invent a
 * provision. An accommodation is a claim that Nevo is doing something for a
 * particular child, and a failed read is not evidence for it.
 *
 * A CHILD READS THEIR OWN. Backend answered this for the accommodations
 * route (B22): a student's own token on their own id is allowed, and the
 * guard refuses only a student reading another. This route takes the id the
 * same way; that it shares the guard is asked of backend. Refused all the
 * same, the read fails closed like any other failure - a 403 is an ordinary
 * `ApiError` here; only a 401 reaches `handleAuthFailure`.
 */
export function useAccommodations(): ActiveAccommodations | null {
  return useAccommodationsState().active;
}

/**
 * The same read, plus whether it has SETTLED - answered or failed.
 *
 * The lesson waits on this before its first frame. Accommodations are applied
 * before the first screen, never after (rule 6): a reading or attention
 * accommodation that arrives once the segment is showing reshapes it in front
 * of the child, which is also the visible transition rule 7 forbids. A failed
 * read settles too - waiting on it for ever would trade a late accommodation
 * for a lesson that never opens.
 */
export function useAccommodationsState(): {
  active: ActiveAccommodations | null;
  settled: boolean;
} {
  const signedIn = useHasSession();
  const [active, setActive] = useState<ActiveAccommodations | null>(null);
  /** Whose read settled, so a different child's answer never counts. */
  const [settledFor, setSettledFor] = useState<string | null>(null);

  useEffect(() => {
    /*
     * The id IS the guard. A signed-out visitor is on the authored
     * walkthrough, which carries its own plan - there is no child here to hold
     * an accommodation, and the route is Bearer-only, so asking would be a
     * guaranteed 401 on every lesson open.
     *
     * `signedIn` stays in the dependency list, because it is what re-runs this
     * when a child signs in, but it is deliberately NOT a second check: a
     * mutation proved an `if (!signedIn) return;` above this line changed
     * nothing, since no session means no `userId` either.
     */
    const studentId = getSession()?.userId;
    if (!studentId) return;
    let cancelled = false;
    void intelligenceApi
      .sessionState(studentId)
      .then((res) => {
        if (cancelled) return;
        // Absent is none: the field is not in the schema's `required` list.
        const on = new Set<AccommodationType>(res.accommodations ?? []);
        setActive({
          reading: on.has("reading"),
          attention: on.has("attention"),
          numerical: on.has("numerical"),
        });
        setSettledFor(studentId);
      })
      .catch(() => {
        // Deliberately silent and deliberately not an accommodation. See above.
        if (!cancelled) setSettledFor(studentId);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const studentId = signedIn ? (getSession()?.userId ?? null) : null;
  return {
    active,
    // Nobody signed in has nothing to wait for.
    settled: !studentId || settledFor === studentId,
  };
}
