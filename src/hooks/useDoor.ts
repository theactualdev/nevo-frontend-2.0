"use client";

import { useLayoutEffect } from "react";
import { openDoor } from "@/lib/auth/doorSession";

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
 */
export function useDoor(active = true): void {
  useLayoutEffect(() => (active ? openDoor() : undefined), [active]);
}
