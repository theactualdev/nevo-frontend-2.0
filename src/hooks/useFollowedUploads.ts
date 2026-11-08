"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { uploadsApi, type UploadStage, type UploadStatus } from "@/lib/api/uploads";
import { getSession } from "@/lib/auth/session";
import {
  followedUploads,
  onFollowedUploadsChange,
  unfollowUpload,
  type FollowedUpload,
} from "@/lib/uploads/followedUploads";
import { useHasSession } from "./useHasSession";

/**
 * The uploads this teacher started on this device, each with what the SERVER
 * last said about it - asked by its own id, never read off the school-wide
 * list (see `lib/uploads/followedUploads`).
 *
 * Polled until it settles. A confirmed upload is in the library and a
 * cancelled one is gone, so both are let go; a missing one (404) too. A
 * ready one waits for the teacher's check, and a failed one for them to see
 * it, so both stay until they do.
 */
export interface FollowedRow {
  upload: FollowedUpload;
  /** Null until the server has answered for it. */
  status: UploadStatus | null;
  stage: UploadStage | null;
}

const POLL_MS = 5000;
const WAITING: ReadonlySet<UploadStatus | null> = new Set([null, "pending", "processing"]);

export function useFollowedUploads(): FollowedRow[] {
  const signedIn = useHasSession();
  const [list, setList] = useState<FollowedUpload[]>([]);
  const [answers, setAnswers] = useState<Record<string, { status: UploadStatus; stage: UploadStage | null }>>({});
  const answered = useRef(answers);
  useEffect(() => {
    answered.current = answers;
  }, [answers]);

  // Scheduled rather than set in the effect body - the house pattern
  // (react-hooks/set-state-in-effect).
  useEffect(() => {
    const read = () =>
      setList(signedIn ? followedUploads(getSession()?.userId) : []);
    const first = setTimeout(read, 0);
    const stop = signedIn ? onFollowedUploadsChange(read) : () => {};
    return () => {
      clearTimeout(first);
      stop();
    };
  }, [signedIn]);

  useEffect(() => {
    if (list.length === 0) return;
    let alive = true;
    const userId = getSession()?.userId;
    const poll = () => {
      for (const u of list) {
        if (!WAITING.has(answered.current[u.uploadId]?.status ?? null)) continue;
        uploadsApi
          .status(u.uploadId)
          .then((res) => {
            if (!alive) return;
            if (res.status === "confirmed" || res.status === "cancelled") {
              unfollowUpload(userId, u.uploadId);
              return;
            }
            setAnswers((a) => ({ ...a, [u.uploadId]: { status: res.status, stage: res.stage } }));
          })
          .catch((err: unknown) => {
            // Gone from the server: nothing left to follow. Anything else is
            // our connection, and the next tick asks again.
            if (alive && err instanceof ApiError && err.status === 404) {
              unfollowUpload(userId, u.uploadId);
            }
          });
      }
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [list]);

  return list.map((upload) => ({
    upload,
    status: answers[upload.uploadId]?.status ?? null,
    stage: answers[upload.uploadId]?.stage ?? null,
  }));
}
