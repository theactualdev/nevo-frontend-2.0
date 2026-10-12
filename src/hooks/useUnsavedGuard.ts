"use client";

import { createContext, useContext, useEffect, useId } from "react";

/**
 * Ask before the browser throws away work nobody has sent yet.
 *
 * NOTHING GUARDED UNSAVED WORK (audit C17). A refresh, a closed tab or a typed
 * address threw away structure edits, half-written messages, a safeguarding
 * note and a wizard's choices without a word. This is the browser's own
 * "Leave site?" prompt, raised only while there is something to lose - so it
 * carries no words of ours, and needs none from design.
 *
 * A CLICK ON THE CONSOLE'S OWN SIDEBAR is a client-side navigation, which
 * never fires `beforeunload`. Design drew the answer on 12 Oct - C18, "shown
 * when a teacher clicks away in the sidebar mid-edit" - so while this guard
 * holds it also registers with the shell, and the sidebar asks before it
 * goes (`Shell/UnsavedChanges.tsx`). Outside the shell there is no registry
 * and only the browser's prompt applies.
 *
 * Still not covered: the session lapsing, which navigates on the console's
 * behalf. Raised with design rather than invented here.
 */

/**
 * What the unsaved work is, for C18's one line. Design wrote it for a lesson
 * ("your edits to this lesson won't be kept"); anywhere else the line drops
 * the three words rather than us writing a new noun for it.
 */
export type UnsavedAbout = "lesson" | "edits";

export interface UnsavedRegistry {
  register: (id: string, about: UnsavedAbout) => void;
  unregister: (id: string) => void;
}

/** Provided by the teacher shell. Null anywhere else. */
export const UnsavedRegistryContext = createContext<UnsavedRegistry | null>(null);

export function useUnsavedGuard(
  unsaved: boolean,
  about: UnsavedAbout = "edits",
): void {
  const registry = useContext(UnsavedRegistryContext);
  const id = useId();
  useEffect(() => {
    if (!unsaved || !registry) return;
    registry.register(id, about);
    return () => registry.unregister(id);
  }, [unsaved, registry, id, about]);

  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older engines read the legacy field instead, and only prompt when it
      // is set to something truthy - an empty string asks nothing (MDN).
      e.returnValue = true;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [unsaved]);
}
