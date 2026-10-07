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
import { A11Y_STORAGE_KEY } from "./accessibilityBoot";

export type TextSize = "s" | "m" | "l" | "xl";

export interface AccessibilityPrefs {
  reducedMotion: boolean;
  highContrast: boolean;
  textSize: TextSize;
}

export interface AccessibilityValue extends AccessibilityPrefs {
  setReducedMotion: (v: boolean) => void;
  setHighContrast: (v: boolean) => void;
  setTextSize: (v: TextSize) => void;
}

const DEFAULTS: AccessibilityPrefs = {
  reducedMotion: false,
  highContrast: false,
  textSize: "m",
};

const STORAGE_KEY = A11Y_STORAGE_KEY;

/** Whose preferences to read: the signed-in child's, or the device's. */
function prefsKey(): string {
  const userId = getSession()?.userId;
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

function readPrefs(key: string): AccessibilityPrefs {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULTS;
    // The three it holds and nothing else: an older build's `suggestBreaks`
    // (D87, gone) is left behind here and dropped at the next write.
    const { reducedMotion, highContrast, textSize } = {
      ...DEFAULTS,
      ...(JSON.parse(raw) as Partial<AccessibilityPrefs>),
    };
    return { reducedMotion, highContrast, textSize };
  } catch {
    // Malformed or unavailable storage is no preference at all.
    return DEFAULTS;
  }
}

/**
 * Text-size → content zoom factor (works with the app's fixed-px type).
 *
 * The student app applies it through CSS - `.nevo-text-zoom` under
 * `html[data-text-size]` in globals.css, which must carry these same numbers -
 * so it is right before React runs. The teacher shell still reads this map
 * for a numeric inline `zoom`.
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
 *   - `data-text-size` → globals.css zooms `.nevo-text-zoom` content regions
 *
 * Defaults match the server render, so hydration stays in agreement; the stored
 * prefs are read on mount. The PAINT does not wait for that: the same three
 * attributes are set before first paint by `A11Y_BOOT_SCRIPT`, and this only
 * ever writes the values that script already wrote.
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
    /*
     * NOTHING UNTIL THE CLIENT HAS LOOKED. This wrote the DEFAULTS to `<html>`
     * on the first pass, before the stored prefs were read - harmless while
     * the root started bare, but the boot script now sets the child's real
     * values before paint, and writing defaults over them is the very snap it
     * exists to prevent.
     */
    if (!state.key) return;
    const root = document.documentElement;
    root.dataset.reducedMotion = String(state.prefs.reducedMotion);
    root.dataset.contrast = state.prefs.highContrast ? "high" : "normal";
    root.dataset.textSize = state.prefs.textSize;
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
  const value = useMemo<AccessibilityValue>(
    () => ({
      ...prefs,
      setReducedMotion,
      setHighContrast,
      setTextSize,
    }),
    [prefs, setReducedMotion, setHighContrast, setTextSize],
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
