"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "@/lib/auth/session";
import { useHasSession } from "./useHasSession";

/**
 * One live read, shared by every screen that falls back to fixtures.
 *
 * This exists because four hooks each grew the same bug. They raced the
 * request against a six-second cap and took whichever finished first - so a
 * response arriving at seven seconds was DISCARDED, and the screen stayed on
 * sample data until the teacher reloaded, even though their real data had
 * come back. The live backend answers an unauthenticated 401 in anything from
 * 1.0s to 5.6s, and a Render cold start is far slower, so that cap was below
 * its ordinary latency, not a guard against the exceptional.
 *
 * The rule now: a response always wins, however late. The timer only decides
 * what a screen shows WHILE waiting - `slow` lets it say the server is taking
 * a moment - and `failed` means the request genuinely failed, which is the
 * only thing that should ever put fixtures on screen.
 */

/** Long enough that a normal load never trips it. */
const SLOW_AFTER_MS = 4000;

export interface LiveQuery<T> {
  data: T | null;
  /** The request failed. The only honest reason to show fixtures. */
  failed: boolean;
  /** Still waiting, and long enough that the screen should say so. */
  slow: boolean;
  /** Signed in, nothing yet, no failure - a skeleton belongs here. */
  loading: boolean;
  /**
   * Ask again (C06). What is on screen stays there while it does: a re-read
   * that answers replaces it, one that fails changes nothing - a screen that
   * had data keeps it rather than dropping to fixtures over a blip, and one
   * that had failed is still failed. Every read here used to be once per
   * page load, so a lesson still parsing said "it will appear here when it's
   * done" and never did.
   */
  refresh: () => void;
}

/**
 * `run` must be stable (wrap it in `useCallback`), and its dependencies
 * belong in `deps` - the effect re-runs when they change.
 */
export function useLiveQuery<T>(
  run: () => Promise<T>,
  deps: React.DependencyList,
): LiveQuery<T> {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  const signedIn = useHasSession();
  const [asked, setAsked] = useState(0);
  /** The next run was asked for, rather than started by its deps changing. */
  const again = useRef(false);
  const refresh = useCallback(() => {
    again.current = true;
    setAsked((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    const reread = again.current;
    again.current = false;
    // A re-read has something on screen already; "taking a moment" is for
    // the first answer.
    const timer = reread
      ? null
      : setTimeout(() => {
          if (!cancelled) setSlow(true);
        }, SLOW_AFTER_MS);

    void run()
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setFailed(false);
        setSlow(false);
      })
      .catch(() => {
        if (!cancelled && !reread) setFailed(true);
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, asked]);

  return {
    data,
    failed,
    slow,
    loading: signedIn && data === null && !failed,
    refresh,
  };
}
