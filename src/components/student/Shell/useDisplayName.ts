"use client";

import { useEffect, useState } from "react";
import { publishIdentity, useCurrentUser } from "@/hooks/useCurrentUser";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { usersApi } from "@/lib/api/users";
import {
  getSession,
  getStoredDisplayName,
  onSessionChange,
  setStoredDisplayName,
} from "@/lib/auth/session";
import { MOCK_STUDENT } from "./studentNav";

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * What to call the student.
 *
 * Precedence: the name they chose for themselves, as their ACCOUNT holds it
 * (`users/me` `preferredName`, so it follows them to any tablet), then the
 * same choice as this device last saw it, then the account's real name - first
 * name only, because this app speaks to children by first name - then the
 * fixture, which now only ever shows signed out.
 *
 * THE ACCOUNT FIRST, THE DEVICE AS A FALLBACK. The device copy used to win,
 * which on a shared tablet meant a name changed on another tablet never
 * arrived here. It is kept for the moments the account cannot answer - before
 * `users/me` resolves, or when it fails - and refreshed whenever the account
 * says something different, so the picker on this tablet (28c) learns it too.
 *
 * A signed-in student whose name has not resolved yet is briefly nameless
 * rather than briefly "Ada": being called someone else's name is worse than
 * a beat without one.
 *
 * THE HYDRATION FRAME COUNTS AS "NOT RESOLVED YET". `useHasSession()` returns
 * the SERVER's answer - false - until hydration, so gating the fixture on
 * `!signedIn` alone still called a real child "Ada" (and "AK") for one frame,
 * which is the thing the paragraph above exists to prevent. Nobody is named
 * until we know who is looking; a signed-out visitor gets the fixture one
 * frame later, which costs nothing.
 */
export function useDisplayName(): { name: string; initials: string } {
  const signedIn = useHasSession();
  const hydrated = useHydrated();
  const identity = useCurrentUser();
  const [stored, setStored] = useState<string | null>(null);

  /*
   * RE-READ WHEN THE CHILD CHANGES. The stored name is keyed by account
   * (`getStoredDisplayName`), so a different child signing in on the same
   * tablet has a different one - and must not see the last child's until
   * something happens to remount this.
   */
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      // Post-mount read of an external store, same pattern as
      // AccessibilityContext - it cannot run during render without a mismatch.
      setStored(getStoredDisplayName());
      setOwner(getSession()?.userId ?? null);
    };
    read();
    return onSessionChange(read);
  }, []);

  // Only this child's account, never one resolved for a previous child.
  const account =
    owner && identity?.userId === owner ? identity.chosenName : null;

  // Keep the device copy in step with the account, so it is a true fallback.
  useEffect(() => {
    if (!account || account === getStoredDisplayName()) return;
    setStoredDisplayName(account, initialsOf(account));
  }, [account]);

  const serverFirst = identity?.name?.split(/\s+/)[0] ?? null;
  const chosen = account ?? stored;
  // Only once we can actually tell a signed-out visitor from a signed-in child.
  const fixture = hydrated && !signedIn;
  const name = chosen ?? serverFirst ?? (fixture ? MOCK_STUDENT.name : "");
  const initials =
    (chosen ? initialsOf(chosen) : "") ||
    (identity?.initials ?? "") ||
    (fixture ? MOCK_STUDENT.initials : "");

  return { name, initials };
}

/**
 * Save the name the signed-in child chose, against their account.
 *
 * `PATCH /api/v1/users/me` with `preferredName`, live since 1 Oct. It used to
 * go to the deprecated `/api/settings/me` bag, best-effort, after the device
 * copy had already been written and "Saved" already shown - so a write that
 * failed still said Saved, and the name never left this tablet.
 *
 * Resolves true only once the account holds it. Only then does this device
 * keep a copy and does every mounted name follow (`publishIdentity`), so the
 * screen never says Saved about a name the account does not have.
 */
export async function saveChosenName(name: string): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  try {
    const user = await usersApi.updateMe({ preferredName: trimmed });
    setStoredDisplayName(trimmed, initialsOf(trimmed));
    publishIdentity(user);
    return true;
  } catch {
    return false;
  }
}
