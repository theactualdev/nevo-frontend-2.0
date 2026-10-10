"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { notificationsApi, type Notification } from "@/lib/api/notifications";
import { getSession, getToken, onSessionChange } from "@/lib/auth/session";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { SAMPLE_NOTIFICATIONS } from "@/lib/mocks/sampleNotifications";

/**
 * Which of board 28's marks a row wears. The frame draws a book for a new
 * lesson and a speech bubble for a teacher's message; `review_due` and
 * `sign_in_changed` have no drawn mark and wear the bell's own until design
 * draws one. Matched on the closed type, not guessed from the title.
 */
export type NotificationKind = "lesson" | "message" | "other";

export interface NotificationItem {
  id: string;
  /** The headline ("A new lesson is ready"). */
  title: string;
  /** Absent on a row with no type, which wears the neutral mark. */
  kind?: NotificationKind;
  /**
   * The sentence under it. The feed carries BOTH a title and a description,
   * and this used to collapse them to `description || title` - so every
   * notification arrived with half of it discarded, and which half depended
   * on whether the backend had written a description.
   */
  text?: string;
  /** Compact age label ("2h", "1d"). */
  ago: string;
  read?: boolean;
  /** Where tapping the row goes. Nullable in the contract: a row without one
   *  is not a link and must not pretend to be. */
  href?: string | null;
}

export interface NotificationContextValue {
  unreadCount: number;
  notifications: NotificationItem[];
  /**
   * The feed could not be read. Kept apart from an empty feed: "Nothing new
   * right now" is a claim, and it is the wrong one when we simply could not
   * ask.
   */
  failed: boolean;
  /**
   * The child's feed has not answered yet. Kept apart from an empty feed for
   * the same reason as `failed`: "Nothing new right now" is a claim, and
   * while the read is in flight it is a guess.
   */
  loading: boolean;
  refresh: () => void;
  /**
   * Mark one notification read. Opening it IS reading it.
   *
   * Ported from the admin panel, which has had this since the endpoint
   * shipped. The child's bell called neither `markRead` nor `markAllRead`, so
   * a notification stayed unread for a child who had read it - the violet dot
   * never cleared, and the only thing that ever changed it was a teacher or an
   * admin opening the same row on their own screen.
   */
  markRead: (id: string) => void;
  /**
   * This bell is showing the designed demo rather than anybody's own feed.
   *
   * MARKS THE BRANCH, NOT THE ROWS, and the difference is the whole point.
   * `SAMPLE_NOTIFICATIONS` is empty today, so following the rows would mark
   * nothing - and the failure this mark exists to catch is exactly the one
   * that leaves no rows behind: a SIGNED-IN child falling into the signed-out
   * branch and being told "Nothing new right now", which is a claim about
   * their feed that nobody checked.
   *
   * That is not hypothetical. It is what the missing `useHydrated` guard did
   * on every student page until 18 Sep.
   */
  showingSamples: boolean;
}

export const NotificationContext = createContext<
  NotificationContextValue | undefined
>(undefined);


/** The frame's compact stamp: "2h", "1d". */
function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

/**
 * THE FOUR TYPES ADDRESSED TO A CHILD (backend B34, 1 Oct), and the only ones
 * this bell shows.
 *
 * `NotificationType` is a closed set, and the rest of it is teacher and admin
 * business - `attention_summary` and `modality_shift` among them, which are
 * exactly what a child must never read about themselves. The feed is scoped
 * to the recipient, so none should arrive here; this is what makes "none" true
 * on a child's screen rather than merely expected. A type added tomorrow is
 * shown once it is listed here, after someone has read what it says.
 */
const FOR_A_CHILD = new Map<string, NotificationKind>([
  ["lesson_assigned", "lesson"],
  ["review_due", "other"],
  ["teacher_replied", "message"],
  ["sign_in_changed", "other"],
]);

/**
 * THE OLD PATHS ROWS ALREADY DELIVERED STILL CARRY, AND ONLY THOSE.
 *
 * Backend now sends our own routes (B86, 8 Oct): `review_due` navigates to
 * /student/progress and `teacher_replied` to /student/connect, alongside
 * /student/lessons and /student/profile, which were always ours. Those pass
 * through `childHref` untouched.
 *
 * What stays is the fallback for rows written before that. On 5 Oct (B62)
 * backend's paths for the same two types were /student/review and
 * /student/messages, which name screens this app does not have, and a child's
 * feed keeps those rows. Without these entries their links would go nowhere:
 *
 * - /student/messages is our Connect tab, /student/connect.
 * - /student/review has no screen of its own. Reviews due are offered on a
 *   subject's page ("Ready for another look"), which Progress leads to.
 *
 * Mapped here rather than with redirect pages, so nothing else in the app
 * learns the old spelling. The path is matched exactly; whatever follows it
 * (`?thread=`) rides along.
 */
const CHILD_ROUTE: Record<string, string> = {
  "/student/messages": "/student/connect",
  "/student/review": "/student/progress",
};

/**
 * Where a child's row may take them: somewhere in the student console, or
 * nowhere. `navigatesTo` is the server's, and a path into another console
 * would land a child on a screen that is not theirs - so anything else is a
 * row with no link, which is what a null `navigatesTo` already means.
 */
export function childHref(target: string | null): string | null {
  if (!target || !/^\/student(\/|\?|#|$)/.test(target)) return null;
  const cut = target.search(/[?#]/);
  const path = cut === -1 ? target : target.slice(0, cut);
  const ours = CHILD_ROUTE[path.replace(/\/+$/, "")];
  return ours ? ours + (cut === -1 ? "" : target.slice(cut)) : target;
}

function toItem(n: Notification): NotificationItem {
  return {
    id: n.notificationId,
    // Both, on two lines - see `NotificationItem.text`. A description equal to
    // the title is not a second line, it is the same line twice.
    title: n.title,
    kind: FOR_A_CHILD.get(n.type),
    text: n.description && n.description !== n.title ? n.description : undefined,
    ago: ago(n.createdAt),
    read: n.read,
    href: childHref(n.navigatesTo),
  };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const signedIn = useHasSession();
  const hydrated = useHydrated();
  const [feed, setFeed] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);
  /** Bumped by `refresh` to re-run the fetch. */
  const [nonce, setNonce] = useState(0);
  /**
   * Whose feed this is. The provider is mounted once at the root, so it used
   * to read the feed when the app loaded and never again: a child who signed
   * in afterwards got no bell at all, and the next child on the tablet could
   * open the last child's. Tracked here, the feed empties and reloads the
   * moment the account changes.
   */
  const [owner, setOwner] = useState<string | null>(null);
  /** `undefined` until the first read, so the first read always lands. */
  const ownerRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const read = () => {
      const next = getSession()?.userId ?? null;
      if (ownerRef.current === next) return; // a token refresh: same child
      ownerRef.current = next;
      // A different child, or nobody: nothing of the last one survives.
      setFeed(null);
      setUnread(0);
      setFailed(false);
      setOwner(next);
    };
    // Post-mount read of an external store.
    read();
    return onSessionChange(read);
  }, []);

  useEffect(() => {
    if (!owner || !getToken()) return;
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
        // Never the fixtures - but not a silent empty bell either. The panel
        // says it could not load rather than claiming there is nothing new.
        if (!cancelled) {
          setFeed([]);
          setUnread(0);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nonce, owner]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  /*
   * Optimistic, then reconciled by the next read - the child is looking at the
   * row either way, and a dot that lingers while the request is in flight
   * reads as the tap not having worked.
   *
   * REVERTED ON FAILURE rather than left cleared. An unread notification shown
   * as read is a message the child never sees again; the reverse is only a dot
   * that comes back, which is the truthful state of a write that did not land.
   */
  const markRead = useCallback((id: string) => {
    if (!getToken()) return;
    let wasUnread = false;
    setFeed((cur) => {
      if (!cur) return cur;
      wasUnread = cur.some((n) => n.notificationId === id && !n.read);
      return cur.map((n) =>
        n.notificationId === id ? { ...n, read: true } : n,
      );
    });
    setUnread((u) => Math.max(0, u - 1));

    void notificationsApi.markRead(id).catch(() => {
      setFeed(
        (cur) =>
          cur?.map((n) =>
            n.notificationId === id ? { ...n, read: !wasUnread } : n,
          ) ?? cur,
      );
      if (wasUnread) setUnread((u) => u + 1);
    });
  }, []);

  const value = useMemo<NotificationContextValue>(() => {
    /*
     * NOTHING UNTIL THE CLIENT CAN SEE THE TOKEN, and this is the half that
     * made the fixtures reach real children.
     *
     * `useHasSession` reads localStorage, which no server can see, so its
     * server snapshot is hardcoded false. This provider is mounted in the root
     * layout, so EVERY student page's server markup and first client frame ran
     * the signed-out branch - for a genuinely signed-in child. The violet
     * unread dot rendered with nothing behind it, and opening the bell in that
     * window listed rows about a teacher who had sent nothing.
     *
     * Every other student surface added this guard and says so in a comment;
     * the provider was missed because it returns a VALUE rather than a screen,
     * so there was no skeleton branch to hang it on. The nothing-state is the
     * skeleton here.
     */
    if (!hydrated) {
      return {
        notifications: [],
        unreadCount: 0,
        failed: false,
        loading: true,
        refresh,
        markRead,
        // Not a sample: a deliberate blank while the client works out who is
        // here. Marking it would put the attribute on every page for everyone
        // for a frame, which makes the mark mean nothing.
        showingSamples: false,
      };
    }
    if (!signedIn) {
      return {
        notifications: SAMPLE_NOTIFICATIONS,
        unreadCount: SAMPLE_NOTIFICATIONS.filter((n) => !n.read).length,
        failed: false,
        loading: false,
        refresh,
        markRead,
        showingSamples: true,
      };
    }
    // Only what is addressed to a child - see `FOR_A_CHILD`. A row this bell
    // does not show must not light its dot either.
    const rows = feed ?? [];
    const mine = rows.filter((n) => FOR_A_CHILD.has(n.type));
    const hiddenUnread = rows.filter(
      (n) => !FOR_A_CHILD.has(n.type) && !n.read,
    ).length;
    return {
      notifications: mine.map(toItem),
      unreadCount: Math.max(0, unread - hiddenUnread),
      failed,
      loading: feed === null && !failed,
      refresh,
      markRead,
      showingSamples: false,
    };
  }, [hydrated, signedIn, feed, unread, failed, refresh, markRead]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
