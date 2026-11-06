"use client";

import { useEffect, useState } from "react";
import { classesApi, type UnfinishedClassCheck } from "@/lib/api/classes";
import { getToken } from "@/lib/auth/session";

/**
 * SCRUM-231's list for one class, or null until (and unless) it answers.
 *
 * Read on opening the class and again whenever the tab comes back into view,
 * so a child who has since finished drops off - the server's list clears
 * itself. Not on a timer: nothing here is urgent enough to poll for.
 *
 * A failed read is null, which draws nothing - the first time and on any
 * re-read. It is never turned into an empty list, because an empty list
 * would be the server saying no one has a check to finish.
 */
export function useUnfinishedChecks(classId: string): UnfinishedClassCheck[] | null {
  const [rows, setRows] = useState<UnfinishedClassCheck[] | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setNonce((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void classesApi
      .unfinishedChecks(classId)
      .then((list) => {
        if (!cancelled) setRows(Array.isArray(list) ? list : null);
      })
      .catch(() => {
        // Nothing drawn, not the last answer: a child on it may have finished
        // since, and the list would then name them as not having.
        if (!cancelled) setRows(null);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, nonce]);

  return rows;
}
