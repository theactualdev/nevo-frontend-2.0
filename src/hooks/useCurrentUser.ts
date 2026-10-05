"use client";

import { useEffect, useState } from "react";
import { usersApi, type CurrentUser } from "@/lib/api/users";
import { getSession } from "@/lib/auth/session";

/**
 * The signed-in user's identity, shaped for rendering.
 *
 * This replaces the two-hop recovery the console ran before
 * `GET /api/v1/users/me` existed - walk the teacher's classes, read each
 * class's teacher list, find the row whose `teacherId` matches our
 * `userId` - which was speculative, cost two round trips, and rested on an
 * id equivalence nothing confirmed. One call answers it outright.
 *
 * Resolved once per signed-in user and shared, because the sidebar mounts on
 * every screen and identity does not change mid-session. Keyed by user id so
 * a sign-out and a second sign-in in the same page load cannot inherit the
 * first user's name.
 *
 * Null until it resolves, and null forever if it cannot - every caller
 * already draws a nameless state, which is exactly what a failed load
 * should look like.
 */

export interface Identity {
  userId: string;
  role: string;
  name: string | null;
  initials: string | null;
  email: string | null;
  /** The school's display name, not its id. */
  school: string | null;
  subjects: string[];
  /** Their own photo, or null - every avatar falls back to initials. */
  photoUrl: string | null;
  /** The name they chose to be called (`preferredName`), or null. */
  chosenName: string | null;
}

function initialsFrom(name: string): string | null {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((w) => !/^(mr|mrs|ms|miss|dr|prof)\.?$/i.test(w));
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return null;
}

function toIdentity(user: CurrentUser): Identity {
  // Prefer the given/family pair; `displayName` is the backend's own
  // fallback and may be an identifier rather than a person's name.
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  const name = full || user.displayName || "";
  return {
    userId: user.userId,
    role: user.role,
    name: name || null,
    initials: name ? initialsFrom(name) : null,
    email: user.email,
    school: user.school?.name ?? null,
    subjects: user.subjects ?? [],
    photoUrl: user.profileImageUrl ?? null,
    chosenName: user.preferredName?.trim() || null,
  };
}

let cache: { userId: string; promise: Promise<Identity | null> } | null = null;
/** The user whose last read failed - so a screen can say so, not "nobody". */
let failedFor: string | null = null;

function resolveIdentity(userId: string): Promise<Identity | null> {
  if (cache?.userId !== userId) {
    cache = {
      userId,
      promise: usersApi
        .me()
        .then(toIdentity)
        .catch(() => {
          /*
           * A FAILURE IS NOT KEPT. It was cached like an answer, so one
           * failed read meant "no identity" on every screen until a full
           * reload - the profile page claiming the details "aren't
           * connected yet" for the rest of the session. The next mount asks
           * again.
           */
          if (cache?.userId === userId) cache = null;
          failedFor = userId;
          return null;
        }),
    };
  }
  return cache.promise;
}

/**
 * Everyone currently rendering an identity.
 *
 * The cache above is resolved once per user, so a teacher who renames
 * themselves would otherwise keep seeing the old name in the sidebar until a
 * reload - the profile page would say one thing and the rail another. A save
 * publishes the new identity here and every mounted consumer follows.
 */
const listeners = new Set<(next: Identity | null) => void>();

/** Replace the resolved identity after a successful write. */
export function publishIdentity(user: CurrentUser): void {
  const next = toIdentity(user);
  failedFor = null;
  cache = { userId: next.userId, promise: Promise.resolve(next) };
  listeners.forEach((fn) => fn(next));
}

/**
 * Replace just the photo, after an upload.
 *
 * The photo endpoint answers with `profileImageUrl` and nothing else, so
 * re-reading `users/me` to publish a whole identity would be a second round
 * trip that can fail on its own - and if it did, a teacher would have
 * uploaded a photo and watched their old one stay put. This keeps everything
 * else the identity already knows.
 */
export function publishPhoto(profileImageUrl: string | null): void {
  if (!cache) return;
  const updated = cache.promise.then((current) =>
    current ? { ...current, photoUrl: profileImageUrl } : current,
  );
  cache = { userId: cache.userId, promise: updated };
  void updated.then((next) => listeners.forEach((fn) => fn(next)));
}

/**
 * Send a new photo and tell every mounted avatar about it.
 *
 * ONE FUNCTION, NOT TWO CALL SITES. The upload and the publish belong
 * together: a screen that uploaded and forgot to publish would leave the
 * sidebar on the old initials until a reload, which is the exact split
 * `publishIdentity` exists to close. Keeping them here also means the
 * behaviour is testable without rendering the profile screen.
 *
 * Null means it did not land, and the caller says the old photo is still
 * there - which it is.
 */
export async function uploadPhoto(file: File): Promise<string | null> {
  try {
    const { profileImageUrl } = await usersApi.uploadProfilePhoto(file);
    publishPhoto(profileImageUrl);
    return profileImageUrl;
  } catch {
    return null;
  }
}

export interface IdentityStatus {
  identity: Identity | null;
  /**
   * WHICH NULL. `useCurrentUser` answers null while the read is in flight
   * AND after it fails, and a screen that has to say something about the
   * teacher cannot tell those apart from null alone - the profile page said
   * "Teacher" and "Your details aren't connected yet" over both.
   */
  status: "loading" | "ready" | "failed";
}

export function useCurrentUserStatus(): IdentityStatus {
  const [state, setState] = useState<IdentityStatus>({
    identity: null,
    status: "loading",
  });

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    let alive = true;
    void resolveIdentity(session.userId).then((value) => {
      if (!alive) return;
      setState({
        identity: value,
        status: value
          ? "ready"
          : failedFor === session.userId
            ? "failed"
            : "ready",
      });
    });
    const onPublish = (next: Identity | null) => {
      if (alive) setState({ identity: next, status: "ready" });
    };
    listeners.add(onPublish);
    return () => {
      alive = false;
      listeners.delete(onPublish);
    };
  }, []);

  return state;
}

export function useCurrentUser(): Identity | null {
  const [identity, setIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    let alive = true;
    void resolveIdentity(session.userId).then((value) => {
      if (alive) setIdentity(value);
    });
    const onPublish = (next: Identity | null) => {
      if (alive) setIdentity(next);
    };
    listeners.add(onPublish);
    return () => {
      alive = false;
      listeners.delete(onPublish);
    };
  }, []);

  return identity;
}
