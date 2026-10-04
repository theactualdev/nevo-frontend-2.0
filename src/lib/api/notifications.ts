import { api } from "./client";

/**
 * Notification endpoints.
 *
 * The list carries its own `unreadCount`, so the badge needs no second call;
 * `/unread-count` exists for surfaces that want the number without the feed.
 *
 * `navigatesTo` is a destination for the row. The C13 frame draws rows as
 * inert, so it is typed here and not yet used - flagged to design.
 *
 * `type` was a bare string when this file was written; the backend has since
 * enumerated it as `NotificationType`. It is still typed loosely here on
 * purpose - `(string & {})` keeps the known values as autocomplete without
 * making a new one a compile error, because a server-side type we have not
 * seen must never render as a blank square.
 */

/**
 * What a notification is about. Drives the icon and the navigation target.
 *
 * THE ADMIN EVENTS EXIST NOW (backend, 7 Sep). The first three are teacher and
 * student console events; the rest are the admin ones SCRUM-100 asked for. The
 * admin surfaces needed no change to receive them - they were built to render
 * whatever arrives rather than to switch on a set of types that was not there,
 * so listing them here is documentation and autocomplete, not dispatch.
 *
 * A `category` IS ON THE ROW NOW (backend B34, 1 Oct): nullable, and filled
 * from the backend's own type-to-category map, which was empty until then.
 * Typed below. Deriving one from the type here would still be an invented
 * mapping - the server's is the only one.
 *
 * THE FOUR STUDENT TYPES (backend B34, 1 Oct). A child's bell was always
 * empty because nothing was ever addressed to a child. Backend's word is that
 * none of the four is about performance (the spec describes no payload per
 * type: each is a title, a description and a nullable `navigatesTo`).
 * `sign_in_changed` is what tells a child their PIN was reset, rather than
 * leaving them at a PIN that no longer works.
 */
export type NotificationType =
  | "attention_summary"
  | "modality_shift"
  | "pin_reset_requested"
  | "admin_welcome"
  | "consent_action_required"
  | "roster_sync_completed"
  | "roster_sync_needs_attention"
  | "invoice_issued"
  | "sso_needs_attention"
  | "lesson_assigned"
  | "review_due"
  | "teacher_replied"
  | "sign_in_changed";

export interface Notification {
  notificationId: string;
  recipientId: string;
  recipientRole: string;
  type: NotificationType | (string & {});
  /**
   * The contract's full `NotificationCategory` (assignments, messages,
   * attention, reports, consent, billing, account) - wider than the three
   * preference toggles `settings.ts` types under that name, so not that type.
   * Null where the server's map has no stream for the type.
   */
  category?: string | null;
  title: string;
  description: string;
  read: boolean;
  createdAt: string;
  navigatesTo: string | null;
  /** Archived rows are excluded from the default view, never deleted. */
  archived: boolean;
  archivedAt: string | null;
}

export interface NotificationFeed {
  notifications: Notification[];
  unreadCount: number;
  /** Absent on older responses; treat undefined as "unknown", not zero. */
  total?: number;
  hasMore?: boolean;
}

export const notificationsApi = {
  /**
   * The feed, newest first, with the unread count attached.
   *
   * `archived: true` returns the archived view instead of the default one -
   * which makes D13b's Archived filter buildable. `limit`/`offset` back the
   * frame's "Show older" rather than numbered pages, so an admin never loses
   * their place.
   */
  list: (options: { archived?: boolean; limit?: number; offset?: number } = {}) =>
    api.get<NotificationFeed>("/api/notifications", {
      params: {
        archived: options.archived ? true : undefined,
        limit: options.limit,
        offset: options.offset,
      },
    }),

  /**
   * Whether anything is unread, as a boolean and deliberately not a number.
   *
   * SCRUM-100's first rule is "a dot, never a count": the indicator says
   * something is here, not how behind you are. Its "done when" goes further -
   * no count is rendered OR EVEN FETCHED - so the sidebar dot calls this and
   * never `unreadCount`.
   */
  unreadExists: () =>
    api.get<{ exists?: boolean } | boolean>("/api/v1/notifications/unread-exists"),

  /** Just the badge number. */
  unreadCount: () =>
    api.get<{ count: number }>("/api/notifications/unread-count"),

  /** 204. No per-row affordance in the frame yet; typed for when there is. */
  markRead: (id: string) => api.post<void>(`/api/notifications/${id}/read`),

  /** 204. Backs the panel's "Mark all read". */
  markAllRead: () => api.post<void>("/api/v1/notifications/read-all"),

  /**
   * 204. Takes the row out of the default feed without deleting it.
   *
   * This used to carry a note saying archived rows could never be listed
   * again, because the list route declared no parameters and the row carried
   * no archived flag. Backend has since added `archived` to both, so the
   * archived VIEW that D13b draws is now real and is built. The note is left
   * here in corrected form rather than deleted, so nobody re-derives the old
   * conclusion from an older memory of this file.
   */
  archive: (id: string) =>
    api.post<void>(`/api/v1/notifications/${id}/archive`),

  /** 204. Puts an archived row back; the only way to reverse an archive. */
  restore: (id: string) =>
    api.post<void>(`/api/v1/notifications/${id}/restore`),
};
