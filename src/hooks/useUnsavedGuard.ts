"use client";

import { useEffect } from "react";

/**
 * Ask before the browser throws away work nobody has sent yet.
 *
 * NOTHING GUARDED UNSAVED WORK (audit C17). A refresh, a closed tab or a typed
 * address threw away structure edits, half-written messages, a safeguarding
 * note and a wizard's choices without a word. This is the browser's own
 * "Leave site?" prompt, raised only while there is something to lose - so it
 * carries no words of ours, and needs none from design.
 *
 * WHAT IT DOES NOT COVER, and why. A click on the console's own sidebar is a
 * client-side navigation, which never fires `beforeunload`; catching that
 * needs a leave confirmation of our own, which no frame draws. Nor does it
 * survive the session lapsing, which navigates on the console's behalf. Both
 * are raised with design rather than invented here.
 */
export function useUnsavedGuard(unsaved: boolean): void {
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
