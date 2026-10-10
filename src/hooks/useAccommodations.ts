"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { intelligenceApi, type EngineConfig } from "@/lib/api/intelligence";
import { studentsApi, type AccommodationType } from "@/lib/api/students";
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
 * configuration and the consent state from one moment.
 *
 * WITH THE CONFIRMED ROUTE BEHIND IT. Backend confirmed a child may read
 * their own `/api/intelligence/accommodations/{id}` (B22); this route is not
 * confirmed yet. So when the session-state read fails for any reason but a
 * dead session - refused, missing, rejected, the server or the network - the
 * accommodations are read from there instead, and the first frame waits for
 * that answer too. A child is never left without an accommodation because a
 * newer route turned them away. A 401 is the client's to handle
 * (`handleAuthFailure`), and there is no child left to read for.
 *
 * THE ACCOMMODATIONS, AND THE ENGINE'S SUPPORT SETTINGS. Backend, 9 Oct: the
 * client applies `engineConfig.support`, while `reading` and `pacing` are the
 * server's own inference parameters. So `support` is handed on as read, from
 * this read only - the fallback route carries none, and none is what a
 * failed read means. Which of them change anything on screen, and how, is
 * in `EngineConfig`. The consent state is already acted on where a lesson
 * opens: a withdrawn child is refused it (B7) and taken to 00e
 * (`withdrawnDoor`).
 *
 * DEFAULTS TO NONE, and note this points the OPPOSITE way to `useConsentGate`,
 * which defaults to allowed. The asymmetry is the point: there, silence must
 * not stop a consented child being measured; here, silence must not invent a
 * provision. An accommodation is a claim that Nevo is doing something for a
 * particular child, and a failed read is not evidence for it.
 *
 * Only when both reads fail is it none, which is what a failed read always
 * meant here.
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
  /** `engineConfig.support` from the session-start read; null without one. */
  support: EngineConfig["support"] | null;
} {
  const signedIn = useHasSession();
  const [active, setActive] = useState<ActiveAccommodations | null>(null);
  /** Keyed by child, like `settledFor`, so one child's never reaches another. */
  const [support, setSupport] = useState<{
    for: string;
    value: EngineConfig["support"] | null;
  } | null>(null);
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
    const apply = (list: readonly AccommodationType[] | undefined) => {
      if (cancelled) return;
      // Absent is none: the field is not in the schema's `required` list.
      const on = new Set<AccommodationType>(list ?? []);
      setActive({
        reading: on.has("reading"),
        attention: on.has("attention"),
        numerical: on.has("numerical"),
      });
      setSettledFor(studentId);
    };
    // Deliberately silent and deliberately not an accommodation. See above.
    const none = () => {
      if (!cancelled) setSettledFor(studentId);
    };
    void intelligenceApi
      .sessionState(studentId)
      .then((res) => {
        if (!cancelled)
          setSupport({ for: studentId, value: res.engineConfig?.support ?? null });
        apply(res.accommodations);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) return none();
        return studentsApi
          .accommodations(studentId)
          .then((res) => apply(res.activeAccommodations))
          .catch(none);
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
    support: studentId && support?.for === studentId ? support.value : null,
  };
}
