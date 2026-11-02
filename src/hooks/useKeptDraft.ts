"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { clearKeptDraft, readKeptDraft, writeKeptDraft } from "@/lib/drafts/keptDraft";

/**
 * Keep a screen's unsaved work on the device, and offer it back after a lapse
 * (SCRUM-246, part 2).
 *
 * While `dirty`, `value` is written under `key` for the signed-in teacher;
 * once it is not (saved, sent, or emptied) the kept copy goes. On arrival, a
 * draft left there is returned as `kept` and NOT applied: the ticket wants
 * "the restored draft ... clearly the teacher's own unsaved work, not
 * silently merged into a saved version", so the screen shows it with
 * `KeptDraftNotice` and the teacher puts it back or discards it.
 *
 * Nothing is written or cleared until that is answered, so a screen that
 * opens empty cannot wipe the draft it is about to offer. A null `key` keeps
 * nothing (no record to key it to yet). Storage is read only once the page
 * has hydrated, since the server render has none.
 */
export function useKeptDraft<T>(
  key: string | null,
  value: T,
  dirty: boolean,
): {
  /** Work left from before, waiting for the teacher's answer. */
  kept: T | null;
  /** The kept work, handed to the screen to put back. */
  restore: () => T | null;
  discard: () => void;
} {
  const hydrated = useHydrated();
  /** The key the teacher has answered for, so a new record asks again. */
  const [answered, setAnswered] = useState<string | null>(null);
  const stored = useMemo(
    () => (hydrated && key && answered !== key ? readKeptDraft<T>(key) : null),
    [hydrated, key, answered],
  );

  useEffect(() => {
    if (!key || !hydrated || stored) return;
    if (dirty) writeKeptDraft(key, value);
    else clearKeptDraft(key);
  }, [key, hydrated, stored, dirty, value]);

  const restore = useCallback(() => {
    setAnswered(key);
    return stored?.value ?? null;
  }, [key, stored]);

  const discard = useCallback(() => {
    if (key) clearKeptDraft(key);
    setAnswered(key);
  }, [key]);

  return { kept: stored?.value ?? null, restore, discard };
}
