"use client";

import { useEffect, useState } from "react";
import { readAcademic, schoolApi } from "@/lib/api/school";
import {
  defaultYearGroupLabel,
  setYearGroupLabels,
  yearGroupOptions,
} from "@/lib/constants/yearGroups";

/**
 * Installs the school's own year-group labels for the whole admin console.
 *
 * `yearGroups.ts` says the map "is set once, at the top of the admin console,
 * through `setYearGroupLabels`" - and nothing did. Only Settings installed it,
 * when opened. Every other screen read the Nigerian defaults, and Add several
 * COMPOSED CLASS NAMES from them: a school that had renamed JSS 2 to "Year 8"
 * got "JSS 2A" created, a class called something nobody in the building says.
 *
 * `yearGroupLabel` is a plain function read during render - deliberately, it is
 * called from a dozen places - so a screen already on display does not notice
 * the map change. The returned key does: it changes once, when the school has
 * renamed any level, and the shell remounts its content under it. A school on
 * the defaults (most of them) never sees a remount. A failed read changes
 * nothing, and the defaults stand.
 */
export function useYearGroupLabels(enabled: boolean): number {
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    schoolApi
      .get()
      .then((school) => {
        if (!live) return;
        setYearGroupLabels(readAcademic(school).yearGroupLabels);
        const renamed = yearGroupOptions().some(
          (o) => o.label !== defaultYearGroupLabel(o.value),
        );
        if (renamed) setKey((k) => k + 1);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [enabled]);

  return key;
}
