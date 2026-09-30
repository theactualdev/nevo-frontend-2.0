"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSession, onSessionChange } from "@/lib/auth/session";

export type TextSize = "s" | "m" | "l" | "xl";

export interface AccessibilityPrefs {
  reducedMotion: boolean;
  highContrast: boolean;
  textSize: TextSize;
  /** Learning-support preference (B.11): the 20-minute break prompt. */
  suggestBreaks: boolean;
}

export interface AccessibilityValue extends AccessibilityPrefs {
  setReducedMotion: (v: boolean) => void;
  setHighContrast: (v: boolean) => void;
  setTextSize: (v: TextSize) => void;
  setSuggestBreaks: (v: boolean) => void;
}

const DEFAULTS: AccessibilityPrefs = {
  reducedMotion: false,
  highContrast: false,
  textSize: "m",
  suggestBreaks: true,
};

const STORAGE_KEY = "nevo:a11y";

/** Whose preferences to read: the signed-in child's, or the device's. */
function prefsKey(): string {
  const userId = getSession()?.userId;
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

function readPrefs(key: string): AccessibilityPrefs {
  try {
    const raw = localStorage.getItem(key);
    return raw
      ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AccessibilityPrefs>) }
      : DEFAULTS;
  } catch {
    // Malformed or unavailable storage is no preference at all.
    return DEFAULTS;
  }
}

/**
 * Text-size → content zoom factor (works with the app's fixed-px type). Applied
 * as a numeric `zoom` on content regions — `zoom: var(...)` isn't supported, so
 * consumers read this map directly rather than a CSS variable.
 */
export const TEXT_ZOOM: Record<TextSize, number> = {
  s: 0.9,
  m: 1,
  l: 1.1,
  xl: 1.2,
};

const AccessibilityContext = createContext<AccessibilityValue | undefined>(
  undefined,
);

/**
 * Global accessibility preferences (Product Arch B.11). Holds the student's
 * Reduced Motion / High Contrast / Text Size choices, persists them, and applies
 * them to the document root so they take effect app-wide:
 *   - `data-reduced-motion` → globals.css disables animation/transition
 *   - `data-contrast="high"` → globals.css strengthens muted text + borders
 *   - `textSize` → content regions apply `TEXT_ZOOM` as a numeric `zoom`
 *
 * Defaults match the server render, so hydration stays in agreement; the stored
 * prefs are read and applied on mount.
 */
export function AccessibilityProvider({ children }: { children: ReactNode }) {
  /**
   * The preferences AND whose they are. Kept together so a switch of child
   * can never write the last child's text size under the new child's key:
   * the persist effect only ever writes a pair that was read as a pair.
   * `key` is null until the client has looked, so nothing is written before.
   */
  const [state, setState] = useState<{
    key: string | null;
    prefs: AccessibilityPrefs;
  }>({ key: null, prefs: DEFAULTS });
  const { prefs } = state;

  /*
   * ONE CHILD'S SETTINGS, NOT THE TABLET'S.
   *
   * These lived under a single device key, so on a shared classroom tablet
   * the next child inherited the last child's text size and contrast - and,
   * worse, their break preference, which is a learning-support setting and
   * not a screen setting at all. Keyed by the signed-in account now, and
   * re-read whenever the account changes. Signed out (the walkthrough) keeps
   * the device key, which is about the screen and belongs to nobody.
   *
   * No migration from the old shared key: it cannot say which child set it,
   * and handing it to whichever child signs in first is the bug again.
   */
  useEffect(() => {
    const load = () => {
      const key = prefsKey();
      setState((s) => (s.key === key ? s : { key, prefs: readPrefs(key) }));
    };
    // Post-mount read of an external store - it cannot run during render
    // without a hydration mismatch.
    load();
    return onSessionChange(load);
  }, []);

  // Apply to the document root + persist on any change.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.reducedMotion = String(state.prefs.reducedMotion);
    root.dataset.contrast = state.prefs.highContrast ? "high" : "normal";
    if (!state.key) return;
    try {
      localStorage.setItem(state.key, JSON.stringify(state.prefs));
    } catch {
      // ignore
    }
  }, [state]);

  const update = useCallback(
    (patch: Partial<AccessibilityPrefs>) =>
      setState((s) => ({ ...s, prefs: { ...s.prefs, ...patch } })),
    [],
  );
  const setReducedMotion = useCallback(
    (v: boolean) => update({ reducedMotion: v }),
    [update],
  );
  const setHighContrast = useCallback(
    (v: boolean) => update({ highContrast: v }),
    [update],
  );
  const setTextSize = useCallback(
    (v: TextSize) => update({ textSize: v }),
    [update],
  );
  const setSuggestBreaks = useCallback(
    (v: boolean) => update({ suggestBreaks: v }),
    [update],
  );

  const value = useMemo<AccessibilityValue>(
    () => ({
      ...prefs,
      setReducedMotion,
      setHighContrast,
      setTextSize,
      setSuggestBreaks,
    }),
    [prefs, setReducedMotion, setHighContrast, setTextSize, setSuggestBreaks],
  );

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

/** Access + update the global accessibility preferences. */
export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (ctx === undefined) {
    throw new Error(
      "useAccessibility must be used within <AccessibilityProvider>",
    );
  }
  return ctx;
}
