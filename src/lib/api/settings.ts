import { api } from "./client";

/**
 * User settings.
 *
 * Two endpoints, and they are not interchangeable. `/api/settings/me` is a
 * free-form bag; `/api/v1/notification-preferences` is purpose-built for the
 * notification choices, one row per category with an in-app and an email
 * channel. The teacher console's toggles moved to the second - putting them
 * in the bag under a key of my own invention was the wrong call, made before
 * I had enumerated the surface.
 *
 * `category` is a free string with no enum, so the three below are ours and
 * should stay stable.
 *
 * The frame draws ONE switch per row, not two. It drives `inApp`, because the
 * console is where a teacher reads these. `email` is preserved from whatever
 * the server holds, and defaults to false rather than true - backend has said
 * transactional email still needs its provider configured, so switching it on
 * would promise delivery that cannot happen. Flagged to design: the API
 * supports a channel the frame has no control for.
 *
 * The contract names no keys at all (`settings` is an open object), so the
 * shape is ours to define and ours to keep stable. Everything the teacher
 * console persists lives under one top-level key, so that a shallow merge
 * cannot have the student app's preferences overwrite the teacher's.
 *
 * Accessibility preferences are deliberately NOT here: reduced motion and
 * larger text are properties of the device someone is sitting at, not of
 * their account, and they already apply instantly through the accessibility
 * context.
 */

export interface TeacherNotificationSettings {
  /** A student's pattern shifts noticeably. C11's "Something changed suddenly". */
  attention: boolean;
  /** New replies in the teacher's threads. */
  messages: boolean;
  /** The calm Monday overview. C11's "Weekly summary". */
  reports: boolean;
}

export interface SettingsBag {
  teacherNotifications?: TeacherNotificationSettings;
  [key: string]: unknown;
}

/**
 * The backend's `NotificationCategory` enum, exactly.
 *
 * These keys used to be ours - `sudden`, `messages`, `weekly` - and on
 * 1 Sep 2026 backend enumerated the field, so two of the three became a 422
 * and saving notification preferences broke outright. Our three toggles map
 * onto theirs without a gap: "Something changed suddenly" is `attention` and
 * "Weekly summary" is `reports`.
 *
 * The enum is wider than the console surfaces today (`assignments`, `consent`,
 * `billing`, `account` have no switch in C11); we send only the three the
 * frame draws, and leave the rest to whatever set them.
 */
export const NOTIFICATION_CATEGORIES = [
  "attention",
  "messages",
  "reports",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** What a WRITE answers: a summary, not the rows back. */
export interface NotificationPreferencesWritten {
  preferences: NotificationPreference[];
  savedCount: number;
  rejected?: unknown[];
}

export interface NotificationPreference {
  category: string;
  inApp: boolean;
  email: boolean;
}

export const notificationPrefsApi = {
  list: () =>
    api.get<NotificationPreference[]>("/api/v1/notification-preferences"),

  /** Replaces the rows sent; categories not included are left alone. */
  /**
   * The WRITE answers a summary, not the rows back.
   * `NotificationPreferencesWriteResponse` is `{preferences, savedCount,
   * rejected}`; this was typed as a bare array, so `savedCount` and any
   * `rejected` row were invisible. Latent rather than live - nothing consumes
   * the return today - but a caller that started to would have read
   * `undefined`.
   */
  update: (rows: NotificationPreference[]) =>
    api.put<NotificationPreferencesWritten>(
      "/api/v1/notification-preferences",
      rows,
    ),
};

/**
 * The free-form bag behind `/api/settings/me`, which the contract marks
 * superseded by `/api/v1/settings/me`.
 *
 * THE CHILD'S CHOSEN NAME NO LONGER LIVES HERE. It rode in this bag as
 * `displayName` until `users/me` gained a typed `preferredName` on 1 Oct; it
 * is read and written there now (`useDisplayName`), as the look already was.
 */
export const settingsApi = {
  get: () => api.get<{ settings: SettingsBag }>("/api/settings/me"),

  /** Merged server-side, so only the keys sent are touched. */
  update: (patch: SettingsBag) =>
    api.put<{ settings: SettingsBag }>("/api/settings/me", patch),
};
