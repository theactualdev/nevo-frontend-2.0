"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { contentApi } from "@/lib/api/content";

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
 */
export function useMediaSource(
  src: string | undefined,
  storagePath: string | undefined,
) {
  const [current, setCurrent] = useState(src);
  const [failed, setFailed] = useState(false);
  /** Bumped to remount the element, which otherwise holds the failed load. */
  const [attempt, setAttempt] = useState(0);
  const refreshed = useRef(false);
  const refreshing = useRef(false);

  const onError = useCallback(async () => {
    if (refreshing.current) return;
    if (refreshed.current || !storagePath) {
      setFailed(true);
      return;
    }
    refreshed.current = true;
    refreshing.current = true;
    try {
      const fresh = await contentApi.mediaUrl(storagePath);
      setCurrent(fresh.url);
      setAttempt((a) => a + 1);
    } catch {
      setFailed(true);
    } finally {
      refreshing.current = false;
    }
  }, [storagePath]);

  useEffect(() => {
    if (!failed) return;
    const retry = () => {
      refreshed.current = false;
      setFailed(false);
      setAttempt((a) => a + 1);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [failed]);

  return { src: current, failed, key: String(attempt), onError };
}
