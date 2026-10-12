"use client";

import { useEffect, useState } from "react";
import {
  learningSupportApi,
  type LearningSupportHolders,
} from "@/lib/api/learningSupport";

/**
 * Who holds Learning Support, and whether the viewer does.
 *
 * Null until the read answers, and null for good when it fails: an unknown
 * answer asserts nothing, so no record line is drawn and nothing is marked
 * unavailable. Each learning support read still answers for itself.
 */
export function useLearningSupport() {
  const [holders, setHolders] = useState<LearningSupportHolders | null>(null);

  useEffect(() => {
    let alive = true;
    learningSupportApi
      .holders()
      .then((h) => {
        if (alive) setHolders(h);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return { holders, setHolders };
}
