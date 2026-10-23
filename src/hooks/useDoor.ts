"use client";

import { useLayoutEffect, useRef } from "react";
import {
  endSessionIfStill,
  heldSessionToken,
  openDoor,
} from "@/lib/auth/doorSession";

/**
 * This screen is a door - a sign-in, Forgot PIN, the SSO callback, 05 Entry -
 * so nothing on the page is sent as the session it found stored (19 Oct
 * browser-storage audit; `doorSession`).
 *
 * A LAYOUT EFFECT, called first in the screen: layout effects all run before
 * any passive effect on the page, which is where the app's routine reads and
 * the screen's own stream start, so the door is open before any of them can
 * send. `active` for a screen that is a door only some of the time: the
 * sequence, while it is on its way somewhere else.
 *
 * `endOnLeave`: LEAVING THE SCREEN, BY ANY WAY, ENDS THE SESSION IT WAS STILL
 * HOLDING (19 Oct browser-storage audit) - 05's. A listener for the device's
 * Back never ran: Next's own was added first, and its navigation unmounted 05
 * inside the same dispatch, taking 05's listener with it before it was
 * called. So the child landed on the Welcome, or back on 03, with the last
 * child's session and its cookie still stored. The screen closing is the one
 * thing every way off it has in common, so that is where it ends - the
 * device's Back, the chevron and anything else. A reload runs no cleanup,
 * so the session stays held, and the screen holds it again.
 *
 * READ AS THE DOOR CLOSES, ENDED A MICROTASK LATER, and only if the screen
 * did not open again in between: Strict Mode rehearses an unmount on every
 * mount in development, and reopens at once - that is not a child leaving.
 */
export function useDoor(
  active = true,
  { endOnLeave = false }: { endOnLeave?: boolean } = {},
): void {
  /** Each opening, so a leave can tell the screen has not opened again. */
  const openings = useRef(0);
  useLayoutEffect(() => {
    openings.current += 1;
    if (!active) return;
    const opening = openings.current;
    const release = openDoor();
    return () => {
      const held = endOnLeave ? heldSessionToken() : null;
      release();
      if (!held) return;
      queueMicrotask(() => {
        if (openings.current === opening) endSessionIfStill(held);
      });
    };
  }, [active, endOnLeave]);
}
