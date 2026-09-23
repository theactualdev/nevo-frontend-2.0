"use client";

import { useEffect, useState } from "react";
import { scaffoldsApi } from "@/lib/api/scaffolds";
import { getSession } from "@/lib/auth/session";
import { levelForIntensity } from "@/lib/lessons/scaffoldLevel";
import type { ScaffoldLevel } from "@/lib/constants/scaffold";

/**
 * How much support this child is getting on ONE concept.
 *
 * **ONLY WHERE A CONCEPT IS ACTUALLY KNOWN, which today is a review session.**
 * The scaffolds engine is keyed per student per concept, and an ordinary
 * lesson segment carries no `conceptId` - `LessonSegment` has never had one.
 * A review session is opened FOR a concept (`?concept=`), so it is the one
 * place the question "how much support on this?" has a subject.
 *
 * **THIS IS NOT A SECOND OPINION ABOUT THE SAME THING.** The adaptation plan's
 * per-segment `scaffolding` and this per-concept intensity never both apply:
 * the plan answers where there is no concept, this answers where there is. If
 * a segment ever carries a `conceptId`, that stops being true and the question
 * of which wins becomes a real one - flagged now rather than discovered then.
 *
 * Returns null whenever there is nothing to say, and the caller keeps whatever
 * the plan gave it. A failed read is not evidence that a child needs more help
 * or less.
 */
export function useScaffoldLevel(conceptId?: string): ScaffoldLevel | null {
  const [level, setLevel] = useState<ScaffoldLevel | null>(null);

  useEffect(() => {
    if (!conceptId) return;
    const studentId = getSession()?.userId;
    // A signed-out visitor is on the designed walkthrough. There is no child
    // to have a support level, and the endpoint is Bearer-only.
    if (!studentId) return;

    let cancelled = false;
    void scaffoldsApi
      .state(studentId, conceptId)
      .then((s) => {
        if (!cancelled) setLevel(levelForIntensity(s.currentIntensity));
      })
      .catch(() => {
        /*
         * Deliberately silent, and deliberately not a level. A concept the
         * child has never attempted may legitimately have no state at all, and
         * a dropped read says nothing either. Both are "we do not know", which
         * is not a thing to show a child a picture of.
         */
      });

    return () => {
      cancelled = true;
    };
  }, [conceptId]);

  return level;
}
