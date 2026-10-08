"use client";

import { useCallback, useEffect, useState } from "react";
import {
  notificationPrefsApi,
  type NotificationPreference,
  type TeacherNotificationSettings,
} from "@/lib/api/settings";
import { getToken } from "@/lib/auth/session";
import { DEFAULT_SETTINGS } from "@/lib/mocks/teacherProfile";
import { useHasSession } from "./useHasSession";

/**
 * The teacher's notification choices, on `/api/v1/notification-preferences`.
 *
 * This used to write into the free-form `/api/settings/me` bag under a key I
 * invented, before I had enumerated the surface and found the purpose-built
 * endpoint. Anything saved that way does not carry over.
 *
 * One switch per row in the frame, two channels in the API: the switch drives
 * `inApp`, and `email` is preserved from whatever the server holds - see
 * `settings.ts` for why it is not turned on alongside.
 *
 * Defaults come from the frame. A teacher who has never saved has no stored
 * rows at all, and the frame's defaults are the right starting position - an
 * empty response is a new account, not an error.
 *
 * Accessibility toggles are deliberately elsewhere: they belong to the device,
 * not the account, and apply instantly through the accessibility context.
 */

const DEFAULTS: TeacherNotificationSettings = {
  attention: DEFAULT_SETTINGS.attention,
  messages: DEFAULT_SETTINGS.messages,
  reports: DEFAULT_SETTINGS.reports,
};

export type SaveState = "idle" | "saving" | "saved" | "failed";

export interface TeacherSettings {
  values: TeacherNotificationSettings;
  ready: boolean;
  /**
   * The stored preferences could not be read. Editing is refused while this
   * is true: every write sends ALL THREE categories, so saving over state we
   * never read would overwrite the two the teacher did not touch with the
   * frame's defaults - and force each category's `email` channel to false,
   * silently turning off email they may have had on. (The email channel has
   * no switch in the frame; design deferred it to v1.5, so this side must
   * preserve it, never clear it.)
   */
  failed: boolean;
  set: (key: keyof TeacherNotificationSettings, value: boolean) => void;
  /** Resolves true when the write landed, so the caller can toast the truth. */
  save: () => Promise<boolean>;
  saveState: SaveState;
}

export function useTeacherSettings(): TeacherSettings {
  const [values, setValues] = useState<TeacherNotificationSettings>(DEFAULTS);
  /** Whatever the server holds for `email`, kept so a save cannot clear it. */
  const [emailByCategory, setEmailByCategory] = useState<
    Record<string, boolean>
  >({});
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const signedIn = useHasSession();

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void notificationPrefsApi
      .list()
      .then((rows) => {
        if (cancelled) return;
        const next = { ...DEFAULTS };
        const email: Record<string, boolean> = {};
        for (const row of rows) {
          if (row.category in next) {
            next[row.category as keyof TeacherNotificationSettings] = row.inApp;
          }
          email[row.category] = row.email;
        }
        setValues(next);
        setEmailByCategory(email);
        setReady(true);
      })
      .catch(() => {
        // NOT ready. `values` still holds the frame's defaults, and rendering
        // those as the teacher's saved choices is exactly the thing the old
        // comment here said must not happen - while doing it.
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = useCallback(
    (key: keyof TeacherNotificationSettings, value: boolean) => {
      setValues((v) => ({ ...v, [key]: value }));
      setSaveState("idle");
    },
    [],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (!getToken()) {
      setSaveState("saved");
      return true;
    }
    // Refuse rather than clobber: see `failed` above.
    if (failed) {
      setSaveState("failed");
      return false;
    }
    setSaveState("saving");
    const rows: NotificationPreference[] = (
      Object.keys(values) as (keyof TeacherNotificationSettings)[]
    ).map((category) => ({
      category,
      inApp: values[category],
      email: emailByCategory[category] ?? false,
    }));
    try {
      const written = await notificationPrefsApi.update(rows);
      /*
       * A 200 IS NOT ALL OF IT (T195). The write reports what it refused in
       * `rejected`, "so a settings screen can show what landed" - and this
       * said "Saved" over any 2xx, so a category the server would not take
       * read as kept. Anything refused is not saved.
       */
      if ((written?.rejected?.length ?? 0) > 0) {
        setSaveState("failed");
        return false;
      }
      setSaveState("saved");
      return true;
    } catch {
      setSaveState("failed");
      return false;
    }
  }, [values, emailByCategory, failed]);

  return {
    values,
    ready: ready || !signedIn,
    failed: failed && signedIn,
    set,
    save,
    saveState,
  };
}
