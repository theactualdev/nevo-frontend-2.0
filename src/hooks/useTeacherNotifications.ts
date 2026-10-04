"use client";

import { useCallback, useEffect, useState } from "react";
import {
  notificationsApi,
  type Notification,
} from "@/lib/api/notifications";
import { getToken } from "@/lib/auth/session";
import {
  TEACHER_NOTIFICATIONS,
  type NotificationKind,
  type TeacherNotification,
} from "@/lib/mocks/teacherNotifications";
import { useHasSession } from "./useHasSession";

/**
 * The bell's feed, from `GET /api/notifications`.
 *
 * The response carries `unreadCount` alongside the rows, so the badge is read
 * from the same call rather than polling `/unread-count`.
 *
 * `type` has no enum in the spec, so `kindOf` maps what the C13 frame drew and
 * anything unrecognised falls back to `done`'s neutral mark. A type the
 * backend adds tomorrow renders as a plain row rather than an empty square.
 *
 * Fixtures back the designed panel when there is no session; a signed-in
 * teacher whose feed fails sees an empty bell rather than invented events,
 * because a fabricated "Tunde stopped partway through a lesson" is a claim
 * about a real child.
 *
 * Design ruled on 31 Aug that rows are tappable, two-line, and carry per-row
 * read and archive - all built. `navigatesTo` is nullable, so a row without
 * one is not a link rather than a link to nowhere.
 */


/** The frame's five marks, matched on what the type string contains. */
function kindOf(type: string): NotificationKind {
  const t = type.toLowerCase();
  if (t.includes("message") || t.includes("reply")) return "message";
  if (t.includes("flag") || t.includes("alert") || t.includes("concern")) {
    return "flag";
  }
  if (t.includes("support") || t.includes("senco") || t.includes("escalat")) {
    return "support";
  }
  if (t.includes("class") || t.includes("enrol") || t.includes("roster")) {
    return "klass";
  }
  return "done";
}

function relative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
}

function toRow(n: Notification): TeacherNotification {
  return {
    id: n.notificationId,
    kind: kindOf(n.type),
    // TWO lines, per design: the title is the label and the description the
    // sentence under it. This used to collapse to `description || title`,
    // which threw away half of every notification.
    text: n.title,
    detail: n.description && n.description !== n.title ? n.description : "",
    // Nullable in the contract: a row with nowhere to go is not a link.
    href: n.navigatesTo ?? undefined,
    time: relative(n.createdAt),
    unread: !n.read,
  };
}

export interface TeacherNotificationsState {
  notes: TeacherNotification[];
  unreadCount: number;
  live: boolean;
  /** The read failed. NEVER the same thing as an empty feed. */
  failed: boolean;
  markAllRead: () => void;
  /** Marks one row read. Optimistic; a failed write is not worth a bounce. */
  markRead: (id: string) => void;
  /**
   * Takes one row out of the feed, returning an undo. Archived rows cannot be
   * listed again (see `notificationsApi.archive`), so the undo is the only way
   * back and it has to be offered here and now.
   */
  archive: (id: string) => void;
  /** Puts back the last archived row, if there is one. */
  undoArchive: () => void;
  /** The row waiting to be undone, if any. */
  lastArchived: TeacherNotification | null;
  /**
   * The first read has not answered yet. Not "nothing new" - the panel used
   * to say exactly that for the whole 1-6 seconds the feed takes.
   */
  loading: boolean;
  /** Read the feed again - on opening the bell, and from the failed state. */
  refresh: () => void;
}

export function useTeacherNotifications(): TeacherNotificationsState {
  const [feed, setFeed] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);
  const [archived, setArchived] = useState<Notification[]>([]);
  const signedIn = useHasSession();
  /**
   * Bumped to read again.
   *
   * THE FEED WAS READ ONCE PER CONSOLE LOAD. The rail lives in the persistent
   * layout, so a teacher who kept the console open all day never saw a new
   * flag, message or reply, and the dot stayed as it was at sign-in. It is
   * read again when the bell is opened, when the tab comes back into view,
   * and from the failed state's Try again - not on a timer, because nothing
   * here is urgent enough to poll for.
   */
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  /*
   * NO RACE, NO CAP. This hook used to run the feed against a 6s timeout and
   * take whichever finished first - so a response arriving at 6.1s was
   * DISCARDED and rendered as "Nothing new right now.", with the unread dot
   * cleared, on the one surface that tells a teacher a child needs attention.
   * The backend's own ordinary range is 1.0-5.6s, so the cap sat inside the
   * normal distribution.
   *
   * That is the exact bug removed from four other hooks in PR #148, and this
   * hook - written afterwards - reintroduced it. The rule from that fix
   * stands: a slow read is still a real read, and only a FAILED one may be
   * reported as such. Failure and emptiness are different states and must
   * read differently.
   */
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void notificationsApi
      .list()
      .then((res) => {
        if (cancelled) return;
        setFeed(res.notifications);
        setUnread(res.unreadCount);
        setFailed(false);
      })
      .catch(() => {
        // Empty rather than fixtures - these rows name real children - but
        // flagged as failed so the panel can say so. A re-read that fails
        // keeps the rows it already had: they are still true, just not new.
        if (cancelled) return;
        setFeed((f) => f ?? []);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  /*
   * Every one of these does its network call OUTSIDE the state updater.
   * React invokes updaters more than once (StrictMode does it deliberately),
   * so a POST inside one fires twice - which the first version of this did,
   * sending two `restore` calls for a single Undo.
   */
  const markRead = useCallback(
    (id: string) => {
      const row = feed?.find((n) => n.notificationId === id);
      if (!row || row.read) return;
      // Optimistic: the teacher opened it, so it is read whatever the write
      // says. A failed POST is not worth bouncing the row back to unread.
      setFeed(
        (f) =>
          f?.map((n) =>
            n.notificationId === id ? { ...n, read: true } : n,
          ) ?? f,
      );
      setUnread((u) => Math.max(0, u - 1));
      if (getToken()) void notificationsApi.markRead(id).catch(() => {});
    },
    [feed],
  );

  const archive = useCallback(
    (id: string) => {
      const row = feed?.find((n) => n.notificationId === id);
      if (!row) return;
      setFeed((f) => f?.filter((n) => n.notificationId !== id) ?? f);
      setArchived((a) => [row, ...a]);
      if (!row.read) setUnread((u) => Math.max(0, u - 1));
      if (getToken()) void notificationsApi.archive(id).catch(() => {});
    },
    [feed],
  );

  const undoArchive = useCallback(() => {
    const row = archived[0];
    if (!row) return;
    setArchived((a) => a.slice(1));
    setFeed((f) =>
      f
        ? [row, ...f].sort(
            (x, y) => +new Date(y.createdAt) - +new Date(x.createdAt),
          )
        : f,
    );
    if (!row.read) setUnread((u) => u + 1);
    if (getToken())
      void notificationsApi.restore(row.notificationId).catch(() => {});
  }, [archived]);

  const markAllRead = useCallback(() => {
    if (!getToken()) {
      setFeed((f) => f?.map((n) => ({ ...n, read: true })) ?? f);
      setUnread(0);
      return;
    }
    void notificationsApi
      .markAllRead()
      .then(() => {
        setFeed((f) => f?.map((n) => ({ ...n, read: true })) ?? f);
        setUnread(0);
      })
      .catch(() => {
        // Leave the badge alone: claiming they are read when the server still
        // has them unread is worse than the dot staying put.
      });
  }, []);

  if (!signedIn) {
    const notes = TEACHER_NOTIFICATIONS;
    return {
      notes,
      unreadCount: notes.filter((n) => n.unread).length,
      live: false,
      failed: false,
      markAllRead,
      markRead,
      archive,
      undoArchive,
      lastArchived: null,
      loading: false,
      refresh,
    };
  }

  return {
    notes: (feed ?? []).map(toRow),
    unreadCount: unread,
    live: true,
    failed,
    markAllRead,
    markRead,
    archive,
    undoArchive,
    lastArchived: archived[0] ? toRow(archived[0]) : null,
    // A failure sets the feed to what it had or [], so null is only ever
    // "not answered yet".
    loading: feed === null,
    refresh,
  };
}
