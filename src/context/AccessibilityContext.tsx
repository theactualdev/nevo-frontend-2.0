"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { personalSettingsApi } from "@/lib/api/settings";
import { getSession, onSessionChange } from "@/lib/auth/session";
import { USER_ROLES } from "@/lib/constants/permissions";
import { A11Y_STORAGE_KEY } from "./accessibilityBoot";

export type TextSize = "s" | "m" | "l" | "xl";

export interface AccessibilityPrefs {
  reducedMotion: boolean;
  highContrast: boolean;
  textSize: TextSize;
}

/**
 * Each setter applies the choice at once and resolves TRUE ONLY ONCE IT IS
 * KEPT: on a child's account, once the account's write has landed (D112, a
 * failed write is not "Saved"); with no account to hold it, once this device
 * has it.
 */
export interface AccessibilityValue extends AccessibilityPrefs {
  setReducedMotion: (v: boolean) => Promise<boolean>;
  setHighContrast: (v: boolean) => Promise<boolean>;
  setTextSize: (v: TextSize) => Promise<boolean>;
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

/**
 * The key a child's preferences live under in their account's `preferences`
 * (`GET/PUT /api/v1/settings/me`). The contract names no keys; backend
 * confirmed this one and its shape on 9 Oct - `accessibility: { reducedMotion,
 * highContrast, textSize }`, with "textSize values s | m | l | xl". Those are
 * `TextSize`'s own four, so nothing is mapped either way. All three ride under
 * the one key, so the PUT's merge cannot leave a stale one beside a fresh one.
 */
export const ACCOUNT_PREFS_KEY = "accessibility";

const TEXT_SIZES: readonly TextSize[] = ["s", "m", "l", "xl"];

/**
 * The account the preferences are kept on: a signed-in STUDENT's. SCRUM-226
 * puts the child's preferences on their account; the staff consoles keep
 * theirs on the device, as they did.
 */
function syncedAccount(): string | null {
  const session = getSession();
  return session?.token && session.role === USER_ROLES.STUDENT
    ? session.userId
    : null;
}

/**
 * What the account holds, field by field, keeping only the three and only
 * when well-formed. Anything else is no preference at all.
 */
export function accountPrefs(
  preferences: unknown,
): Partial<AccessibilityPrefs> {
  const held =
    preferences && typeof preferences === "object"
      ? (preferences as Record<string, unknown>)[ACCOUNT_PREFS_KEY]
      : undefined;
  if (!held || typeof held !== "object") return {};
  const { reducedMotion, highContrast, textSize } = held as Record<
    string,
    unknown
  >;
  const out: Partial<AccessibilityPrefs> = {};
  if (typeof reducedMotion === "boolean") out.reducedMotion = reducedMotion;
  if (typeof highContrast === "boolean") out.highContrast = highContrast;
  if (TEXT_SIZES.includes(textSize as TextSize)) {
    out.textSize = textSize as TextSize;
  }
  return out;
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
  /**
   * The same pair, readable from a callback without a stale closure, and set
   * only beside `setState` - so the next state is worked out before React
   * sees it, never inside an updater.
   */
  const current = useRef(state);
  const commit = useCallback((next: typeof state) => {
    current.current = next;
    setState(next);
  }, []);
  /** The key the account has been asked about, so one sign-in asks once. */
  const askedFor = useRef<string | null>(null);
  /** The child has chosen since the account was asked: its answer is older. */
  const chosenSince = useRef(false);
  /** Account writes, one at a time, so the last choice is the one kept. */
  const writes = useRef<Promise<unknown>>(Promise.resolve());

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
   *
   * THEN THE ACCOUNT'S, WHICH WIN (SCRUM-226, 8 Oct): "Preferences are
   * account-level ... They are not tablet-local." The device's copy paints
   * first - before React, through the boot script (rule 6) - and the account's
   * values replace it once read, and are kept on the device in turn so the
   * next load paints them. A read that fails changes nothing: the device's
   * copy is the child's last known choice, not a guess. And a choice made
   * while the read is out is not undone by its older answer.
   */
  useEffect(() => {
    const load = () => {
      const key = prefsKey();
      if (current.current.key !== key) {
        commit({ key, prefs: readPrefs(key) });
      }
      if (!syncedAccount()) {
        // Signed out: the next sign-in, the same child's included, asks again.
        askedFor.current = null;
        return;
      }
      if (askedFor.current === key) return;
      askedFor.current = key;
      chosenSince.current = false;
      personalSettingsApi.get().then(
        (res) => {
          if (current.current.key !== key || chosenSince.current) return;
          const held = accountPrefs(res?.preferences);
          if (Object.keys(held).length === 0) return;
          commit({ key, prefs: { ...current.current.prefs, ...held } });
        },
        () => {
          // Unread is not a preference. Asked again on the next change of
          // session, rather than never.
          if (askedFor.current === key) askedFor.current = null;
        },
      );
    };
    // Post-mount read of an external store - it cannot run during render
    // without a hydration mismatch.
    load();
    return onSessionChange(load);
  }, [commit]);

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

  /*
   * Applied at once, kept on the device by the effect above, and WRITTEN
   * THROUGH TO A CHILD'S ACCOUNT - all three, under one key. What it resolves
   * is whether the choice is kept, which is all "Saved" may say.
   */
  const update = useCallback(
    (patch: Partial<AccessibilityPrefs>): Promise<boolean> => {
      const was = current.current;
      if (!was.key) return Promise.resolve(false);
      const next = { key: was.key, prefs: { ...was.prefs, ...patch } };
      commit(next);
      if (!syncedAccount() || next.key !== prefsKey()) {
        return Promise.resolve(true);
      }
      chosenSince.current = true;
      const write = writes.current.then(() =>
        personalSettingsApi.update({ [ACCOUNT_PREFS_KEY]: next.prefs }),
      );
      writes.current = write.catch(() => {});
      return write.then(
        () => true,
        () => false,
      );
    },
    [commit],
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
