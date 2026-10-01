"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { contentApi } from "@/lib/api/content";

/**
 * Why a picture or recording ended up not loading, as `media_load_failed`
 * carries it. Each is a fact the device saw, not a guess:
 * - `offline`: the device said it had no connection when the load failed.
 * - `refresh_failed`: the link had to be re-issued and the request for a
 *   fresh one did not answer.
 * - `load_error`: the element could not load it, fresh link or not.
 */
export type MediaFailReason = "offline" | "refresh_failed" | "load_error";

/** Offline outranks the rest: it is the cause, the other two are symptoms. */
function because(reason: MediaFailReason): MediaFailReason {
  return typeof navigator !== "undefined" && navigator.onLine === false
    ? "offline"
    : reason;
}

/**
 * A lesson picture's or recording's URL, kept playable.
 *
 * Generated media lives behind SIGNED links that age out (`urlExpiresInSeconds`
 * on both variants), and a child who opened a lesson before break and came
 * back after it met a dead link: a broken image, or a recording that would
 * never load. The teacher's player already recovers through
 * `POST /api/content/media/url`; the child's player dropped `storagePath`, the
 * one thing that endpoint needs.
 *
 * So: the element's own error is the signal (an expiry is only discovered at
 * load, and guessing from `urlExpiresInSeconds` would mean guessing when the
 * link was minted). One refresh per failure - a loop on an object that is
 * really gone is worse than saying so - and then `failed`.
 *
 * AND AGAIN WHEN THE CONNECTION RETURNS. Offline, every segment the child had
 * not opened yet failed its media, and the failure stuck after the signal came
 * back. A failure is retried once on `online`, from the top.
 *
 * `onFailed` IS TOLD ONCE PER FAILURE (B12), so the engine learns the child
 * did not see or hear it. A retry that fails again is a second failure and is
 * told again; a retry that works says nothing.
 */
export function useMediaSource(
  src: string | undefined,
  storagePath: string | undefined,
  onFailed?: (reason: MediaFailReason) => void,
) {
  const [current, setCurrent] = useState(src);
  const [failure, setFailure] = useState<MediaFailReason | null>(null);
  const failed = failure !== null;
  /** Bumped to remount the element, which otherwise holds the failed load. */
  const [attempt, setAttempt] = useState(0);
  const refreshed = useRef(false);
  const refreshing = useRef(false);
  const onFailedRef = useRef(onFailed);

  useEffect(() => {
    onFailedRef.current = onFailed;
  }, [onFailed]);

  // From the state rather than from `onError`, so an element that reports
  // the same error twice before it unmounts is still one failure.
  useEffect(() => {
    if (failure) onFailedRef.current?.(failure);
  }, [failure]);

  const onError = useCallback(async () => {
    if (refreshing.current) return;
    if (refreshed.current || !storagePath) {
      setFailure(because("load_error"));
      return;
    }
    refreshed.current = true;
    refreshing.current = true;
    try {
      const fresh = await contentApi.mediaUrl(storagePath);
      setCurrent(fresh.url);
      setAttempt((a) => a + 1);
    } catch {
      setFailure(because("refresh_failed"));
    } finally {
      refreshing.current = false;
    }
  }, [storagePath]);

  useEffect(() => {
    if (!failed) return;
    const retry = () => {
      refreshed.current = false;
      setFailure(null);
      setAttempt((a) => a + 1);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [failed]);

  return { src: current, failed, key: String(attempt), onError };
}
