"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { usersApi } from "@/lib/api/users";
import { getToken } from "@/lib/auth/session";
import { avatarTone, type AvatarTone } from "@/lib/profile/avatarTone";

/**
 * The look the signed-in child chose, shared by every disc that draws it.
 *
 * ONE STORE, NOT ONE STATE PER DISC. The shell's disc and the Profile screen's
 * are on screen together; a choice made on one has to move the other at the
 * same instant, or the child taps a colour and watches the corner of the
 * screen ignore them.
 *
 * STORED AGAINST THE ACCOUNT, NOT THE DEVICE. A classroom tablet is shared
 * (28c), so a device copy would hand one child's look to whoever signs in
 * next. The account copy follows the child to any tablet, and the store is
 * keyed by session so a second child on the same tab never sees the first
 * one's choice, even for a frame.
 *
 * ON THE PROFILE'S OWN FIELD. `users/me` carries a typed `avatarTone` (GET
 * reads it, PATCH writes it) since 1 Oct. It used to ride in the free-form
 * `/api/settings/me` bag, which is deprecated; backend keeps the two in step,
 * so a look saved the old way still reads back here.
 *
 * Signed out - the walkthrough - a choice lives only in this tab. There is no
 * account to write it to, and no child whose look it is.
 */

const GUEST = "guest";

let state: { owner: string; id: string | null } = { owner: "", id: null };
let loading: string | null = null;
const listeners = new Set<() => void>();

const ownerNow = () => getToken() ?? GUEST;

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The choice for whoever is signed in now, or null when there is none yet. */
function snapshot(): string | null {
  return state.owner === ownerNow() ? state.id : null;
}

function load(owner: string) {
  if (owner === GUEST || state.owner === owner || loading === owner) return;
  loading = owner;
  void usersApi
    .me()
    .then((res) => {
      // A different child signed in while this was in flight, or this child
      // already chose - either way the read is out of date.
      if (ownerNow() !== owner || state.owner === owner) return;
      const stored: unknown = res.avatarTone;
      state = { owner, id: typeof stored === "string" ? stored : null };
      emit();
    })
    .catch(() => {
      // No read, no choice: the default disc, which is what the child had
      // before this screen existed. Nothing here is worth an error.
    })
    .finally(() => {
      if (loading === owner) loading = null;
    });
}

export function useAvatarTone(): {
  tone: AvatarTone;
  /** Resolves once the account holds it; rejects, and puts the old look back, if not. */
  choose: (id: string) => Promise<void>;
} {
  const id = useSyncExternalStore(subscribe, snapshot, () => null);

  useEffect(() => {
    load(ownerNow());
  }, []);

  const choose = useCallback(async (next: string) => {
    const owner = ownerNow();
    const previous = snapshot();
    // Shown at once: the write is a formality to the child, and a disc that
    // waits on the network feels like a tap that missed.
    state = { owner, id: next };
    emit();
    if (owner === GUEST) return;
    try {
      await usersApi.updateMe({ avatarTone: next });
    } catch (cause) {
      // Only undo OUR choice - a later tap may already have replaced it.
      if (state.owner === owner && state.id === next) {
        state = { owner, id: previous };
        emit();
      }
      throw cause;
    }
  }, []);

  return { tone: avatarTone(id), choose };
}
