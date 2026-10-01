"use client";

import { useEffect, useState } from "react";
import { consentsApi, processingWithdrawn } from "@/lib/api/consents";
import { useHasSession } from "./useHasSession";

/**
 * Whether this child's guardian has withdrawn consent for processing.
 *
 * `GET /api/v1/students/me/consent-gate` had been deployed for some time while
 * `consentsApi.myConsentGate` had **zero callers**, so a child whose parent
 * withdrew consent kept being profiled. Nothing in the student app ever
 * asked.
 *
 * That is a compliance failure before it is a bug. Withdrawal is the one
 * consent answer the frontend is entitled to act on, and `processingWithdrawn`
 * is where that ruling is written down.
 *
 * The two calibrated activities ask now. `ProfilingFlow` (the onboarding
 * baseline) and `WarmUpRun` (the daily warm-up) stop their capture the moment
 * this says withdrawn, and derive, park and send nothing.
 *
 * DEFAULTS TO ALLOWED, and that is deliberate. A read that fails, a backend
 * having a bad minute, a child on 3G - none of those is a withdrawal, and
 * treating them as one would silently stop measuring for children whose
 * guardians consented. Only an answer that SAYS withdrawn stops anything. The
 * mirror risk - continuing to process for a short window while the read is in
 * flight - is bounded by one request, and the same request is what ends it.
 */
export function useConsentGate(): { withdrawn: boolean; known: boolean } {
  const signedIn = useHasSession();
  const [state, setState] = useState<{ withdrawn: boolean; known: boolean }>({
    withdrawn: false,
    known: false,
  });

  useEffect(() => {
    // A signed-out visitor is on the designed walkthrough. There is no child to
    // have consent for, and the endpoint is Bearer-only.
    if (!signedIn) return;
    let cancelled = false;
    void consentsApi
      .myConsentGate()
      .then((gate) => {
        if (cancelled) return;
        setState({ withdrawn: processingWithdrawn(gate), known: true });
      })
      .catch(() => {
        // Deliberately silent, and deliberately not a withdrawal. See above.
        if (!cancelled) setState({ withdrawn: false, known: false });
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  return state;
}
