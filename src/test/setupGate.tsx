import type { ReactNode } from "react";
import {
  SetupGateContext,
  type SetupGateValue,
  type SetupPause,
} from "@/context/SetupGateContext";

/**
 * Render inside a setup gate that has already decided. For testing screens
 * that pause their writes: the real provider reads two endpoints, and what a
 * screen does with the answer is the thing under test, not the reads.
 */
export function withGate(ui: ReactNode, pause: SetupPause | null) {
  const value: SetupGateValue = {
    writesPaused: pause !== null,
    pause,
    resolved: true,
    email: null,
    onboarding: null,
    loading: false,
    refresh: () => {},
  };
  return <SetupGateContext.Provider value={value}>{ui}</SetupGateContext.Provider>;
}
