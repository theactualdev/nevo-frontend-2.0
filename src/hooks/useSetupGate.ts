"use client";

import { useContext } from "react";
import { SetupGateContext, pauseNote } from "@/context/SetupGateContext";

/**
 * Whether this console's writes are paused, and why — D01b AC-05 (email not
 * confirmed) and D24 OB-00 (school not yet active).
 *
 * USABLE OUTSIDE THE PROVIDER, deliberately, and this is the one place it
 * differs from `usePermissions`, which throws. The provider is admin-only, and
 * the answer for everywhere else is a true and useful one: nothing is paused.
 * Throwing would mean a shared component could not ask the question at all,
 * which is how the check ends up duplicated inline instead.
 */
export function useSetupGate() {
  const ctx = useContext(SetupGateContext);
  return {
    /** True only when we KNOW writes are paused. Never true on a failed read. */
    writesPaused: ctx?.writesPaused ?? false,
    pause: ctx?.pause ?? null,
    /** False while a read is outstanding or after one failed. */
    resolved: ctx?.resolved ?? false,
    email: ctx?.email ?? null,
    onboarding: ctx?.onboarding ?? null,
    loading: ctx?.loading ?? false,
    refresh: ctx?.refresh ?? (() => {}),
    /**
     * The sentence for a paused control, or null when nothing is paused.
     *
     * Returned from here rather than composed at the call site, so thirty
     * controls cannot end up with thirty wordings for one reason.
     */
    note: ctx?.writesPaused && ctx.pause ? pauseNote(ctx.pause) : null,
  };
}
