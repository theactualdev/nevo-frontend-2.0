"use client";

import { useCallback, useEffect, useState } from "react";
import {
  learningSupportApi,
  type LearningSupportHolders,
} from "@/lib/api/learningSupport";

/**
 * Who holds Learning Support, and whether the viewer does.
 *
 * Null until the read answers, and null while it has failed: an unknown
 * answer asserts nothing, so no record line is drawn and nothing is marked
 * unavailable. Each learning support read still answers for itself.
 *
 * `failed` says the read failed, and `retry` asks again (backlog 87): the
 * Edit access sheet showed the old SENCo checkbox in its place, as if the
 * school had no Learning Support at all.
 */
export function useLearningSupport() {
  const [holders, setHolders] = useState<LearningSupportHolders | null>(null);
  const [failed, setFailed] = useState(false);
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    let alive = true;
    learningSupportApi
      .holders()
      .then((h) => {
        if (!alive) return;
        setHolders(h);
        setFailed(false);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [asked]);

  const retry = useCallback(() => {
    setFailed(false);
    setAsked((n) => n + 1);
  }, []);

  return { holders, setHolders, failed, retry };
}
