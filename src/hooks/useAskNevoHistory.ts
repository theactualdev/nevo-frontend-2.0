"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  askNevoApi,
  recentThreads,
  type ThreadSummary,
  type ThreadTranscript,
} from "@/lib/api/askNevo";
import { getToken } from "@/lib/auth/session";

/**
 * The child's past conversations with Nevo (frame 26, "Conversation history").
 *
 * *"A quiet clock icon in the drawer's top bar opens a flat, most-recent-first
 * list of past conversations inside the same sheet. Tapping an entry opens it
 * read-only, with the input still there to start something new. Nothing older
 * than 90 days, up to 50 entries."*
 *
 * EVERYTHING BELOW WAS ALREADY BUILT EXCEPT THE READING OF IT. `threads`,
 * `thread` and `recentThreads` have been typed and wrapped since the endpoints
 * shipped, and nothing called them - the drawer opened with no memory of any
 * conversation a child had ever had with it.
 *
 * THE NINETY DAYS AND THE FIFTY ARE APPLIED HERE, not asked for. The endpoint
 * declares no parameters at all, so there is nowhere to ask the server for a
 * window; `recentThreads` enforces the frame's rule regardless of whether the
 * backend already does, which makes it a no-op if it does and correct if it
 * does not.
 *
 * READ ONCE PER OPEN, not on a timer. A conversation list that reorders itself
 * while a child is reading it is the opposite of the calm this drawer is for.
 */

export interface AskNevoHistory {
  threads: ThreadSummary[];
  loading: boolean;
  failed: boolean;
  /** Fetch one past conversation in full. Null while loading or on failure. */
  transcript: ThreadTranscript | null;
  transcriptFailed: boolean;
  openThread: (threadId: string) => void;
  closeThread: () => void;
  /** Ask for the list again - called when the drawer opens. */
  refresh: () => void;
}

export function useAskNevoHistory(enabled: boolean): AskNevoHistory {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [transcript, setTranscript] = useState<ThreadTranscript | null>(null);
  const [transcriptFailed, setTranscriptFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  /** So a slow answer for a thread the child has left cannot land on screen. */
  const wanted = useRef<string | null>(null);

  useEffect(() => {
    // Signed out there is no token, and the designed walkthrough has no server
    // history to show - asking would 401 and render as a failure that is not
    // one.
    if (!enabled || !getToken()) return;
    let cancelled = false;

    void askNevoApi
      .threads()
      .then((rows) => {
        if (cancelled) return;
        setThreads(recentThreads(rows, Date.now()));
        // Cleared on SUCCESS rather than before the request: a synchronous
        // reset here is what `set-state-in-effect` exists to stop, and it
        // would also blank a previous failure for as long as the retry is in
        // flight - showing an empty list where the honest state is still
        // "could not ask".
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Kept apart from "no conversations yet": could not ask is not the
        // same as nothing to show, and the drawer says so.
        setThreads([]);
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  const openThread = useCallback((threadId: string) => {
    wanted.current = threadId;
    setTranscript(null);
    setTranscriptFailed(false);
    if (!getToken()) return;

    void askNevoApi
      .thread(threadId)
      .then((body) => {
        if (wanted.current !== threadId) return;
        setTranscript(body);
      })
      .catch(() => {
        if (wanted.current !== threadId) return;
        setTranscriptFailed(true);
      });
  }, []);

  const closeThread = useCallback(() => {
    wanted.current = null;
    setTranscript(null);
    setTranscriptFailed(false);
  }, []);

  return {
    threads: threads ?? [],
    loading: enabled && Boolean(getToken()) && threads === null && !failed,
    failed,
    transcript,
    transcriptFailed,
    openThread,
    closeThread,
    refresh: useCallback(() => setNonce((n) => n + 1), []),
  };
}
