"use client";

import { useEffect, useRef } from "react";

/**
 * Whether the screen is still on screen: true from mount until unmount.
 *
 * A SCREEN THAT HAS GONE NEVER NAVIGATES (the hub, 8 Nov). A sign-in or entry
 * screen that awaits the server and then moves the person on - straight
 * away, or after its "You're in" beat - must not do either once they have
 * left it: pressed Back during "Signing you in", say. Without this the
 * answer landed, the screen that asked was already gone, and its redirect
 * fired anyway, from wherever they had gone. A timer it set after its own
 * unmount cleanup had run was never cleared at all.
 *
 * Read it in the callback, right before navigating or scheduling a
 * navigation - never during render. Imported by path, not from
 * `@/hooks`, so a test that mocks the hooks index still gets it.
 */
export function useStillHere() {
  const here = useRef(false);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);
  return here;
}
