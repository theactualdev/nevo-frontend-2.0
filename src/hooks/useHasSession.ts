"use client";

import { useSyncExternalStore } from "react";
import { getToken, onSessionChange } from "@/lib/auth/session";

/**
 * Whether a real signed-in session exists on this device.
 *
 * The console ships with fixture personas and fixture content, which are right
 * for the designed screens and wrong the moment somebody actually signs in. So
 * the rule is: with a session, the screens show what the API returned, and say
 * nothing rather than saying the fixture's thing.
 *
 * Who that person is comes from `useCurrentUser` now that `users/me` exists;
 * this hook answers only "is anyone signed in", which every screen still needs
 * before it decides between live and fixture content.
 *
 * Deliberately not derived from any fetch: a teacher whose classes or lessons
 * fail to load is still not Ms. Adeyemi.
 *
 * The token lives in localStorage, which the server cannot see. Reading it
 * through `useSyncExternalStore` keeps the server snapshot false and lets the
 * client settle on the truth without a hydration mismatch - and the `storage`
 * subscription means signing out in another tab updates this one.
 */
/*
 * THIS TAB AS WELL AS OTHERS. It listened to `storage` alone, which only fires
 * for writes made in ANOTHER tab - so a child who signed in here left every
 * root-mounted reader on its signed-out answer until something else happened
 * to re-render it. `onSessionChange` covers both.
 */
function subscribe(onChange: () => void): () => void {
  return onSessionChange(onChange);
}

const clientSnapshot = () => Boolean(getToken());
const serverSnapshot = () => false;

export function useHasSession(): boolean {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
