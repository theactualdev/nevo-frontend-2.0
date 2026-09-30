"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { notificationsApi, type Notification } from "@/lib/api/notifications";
import { cn } from "@/lib/utils";
import { ROW_DIVIDER } from "../Roster/primitives";
import { NotificationRow } from "./NotificationRow";

/**
 * D13.2 The panel - the quick read.
 *
 * The last handful of things, scannable in about ten seconds, with a route
 * into whatever needs doing. Anchored to the sidebar's Notifications row, not
 * to a header: the admin layer has no top chrome, and SCRUM-100 settles this
 * explicitly - "the ticket's 'header icon' wording is superseded by this
 * decision rather than the other way round".
 *
 * Geometry is the frame's: 380px wide, 520px tall at most, anchored bottom
 * left against the rail, with the list scrolling inside a fixed header and
 * footer.
 *
 * Mark-all-read SETTLES to "All read" rather than disappearing - the action
 * stays where it was so the reader is not left wondering whether they clicked
 * it.
 */

/** SCRUM-100: "Panel caps at eight with a route to the full page." */
const MAX_ROWS = 8;

/**
 * SCRUM-100 keeps this mark by name: "a 52px circle on rgba(154,156,203,0.2)
 * with a navy 26px bell glyph", and the done-criterion is "Empty state keeps
 * its bell circle, heading and body line verbatim". It had been dropped,
 * leaving two lines of text floating in an otherwise empty panel.
 */
function BellMark() {
  return (
    <span
      aria-hidden="true"
      className="mx-auto mb-4 flex size-[52px] items-center justify-center rounded-full bg-nevo-violet/20 text-nevo-navy"
    >
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    </span>
  );
}

export function NotificationsPanel({
  onClose,
  onReadStateChanged,
}: {
  onClose: () => void;
  /** Lets the rail drop its dot the moment the last unread is cleared. */
  onReadStateChanged: () => void;
}) {
  const [rows, setRows] = useState<Notification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [allRead, setAllRead] = useState(false);
  const [now, setNow] = useState(0);
  const panel = useRef<HTMLDivElement>(null);

  /*
   * Its own callback so the failure state can offer a retry. It used to live
   * inside the mount effect, so "Reopen the panel to try again" was the only
   * recovery on offer - an instruction to close the thing you are reading and
   * open it again, where the spec asks plainly for a button.
   */
  const load = useCallback(() => {
    notificationsApi
      .list({ limit: MAX_ROWS, offset: 0 })
      .then((feed) => {
        setRows(feed.notifications);
        setAllRead(feed.unreadCount === 0);
        setNow(Date.now());
      })
      .catch(() => {
        // "You're all caught up" is a claim; a failed read is not one.
        setRows([]);
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * The retry clears back to the loading state BEFORE re-reading; `load` does
   * not, because it also runs from the mount effect and a synchronous setState
   * there is `react-hooks/set-state-in-effect` - which this file has tripped
   * before. The first render already holds exactly these values.
   */
  const retry = () => {
    setRows(null);
    setFailed(false);
    load();
  };

  // Escape and an outside press both close it; the rail's own button is
  // excluded by `data-notification-toggle` so clicking it does not close and
  // immediately reopen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (panel.current?.contains(target)) return;
      if (target.closest("[data-notification-toggle]")) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  /*
   * A FAILED WRITE PUTS THE ROWS BACK, as `onArchive` below already did. Both
   * of these painted rows read before the server answered, and on a refusal
   * mark-all reverted only its own button while every dot stayed cleared -
   * and a single row's failure was swallowed outright - so the panel showed
   * as read what the server still held unread. The full page fixed this for
   * itself; the panel had not.
   */
  const markAllRead = () => {
    const before = rows;
    setAllRead(true);
    setRows((prev) => prev?.map((n) => ({ ...n, read: true })) ?? prev);
    notificationsApi
      .markAllRead()
      .then(onReadStateChanged)
      .catch(() => {
        setAllRead(false);
        setRows(before);
      });
  };

  const onRead = (id: string) => {
    const wasUnread = rows?.some((n) => n.notificationId === id && !n.read) ?? false;
    setRows((prev) =>
      prev?.map((n) => (n.notificationId === id ? { ...n, read: true } : n)) ?? prev,
    );
    notificationsApi
      .markRead(id)
      .then(onReadStateChanged)
      .catch(() => {
        if (!wasUnread) return;
        setRows((prev) =>
          prev?.map((n) => (n.notificationId === id ? { ...n, read: false } : n)) ?? prev,
        );
      });
  };

  /*
   * Per-row archive, which SCRUM-100 adds to BOTH surfaces and which the panel
   * simply did not have - the row component already took the handler, and the
   * page passed one while the panel passed nothing, so the action existed on
   * one of the two places the same row is rendered.
   *
   * Mirrors `NotificationsView.onArchive`: the row leaves the list, because
   * the list is defined by the flag just changed. A failed write puts it back,
   * rather than leaving the panel showing something the server did not accept.
   */
  const onArchive = (id: string) => {
    const before = rows;
    setRows((prev) => prev?.filter((n) => n.notificationId !== id) ?? prev);
    notificationsApi
      .archive(id)
      .then(onReadStateChanged)
      .catch(() => setRows(before));
  };

  return (
    <div
      ref={panel}
      role="dialog"
      aria-label="Notifications"
      className="fixed bottom-6 left-6 z-50 flex max-h-[520px] w-[380px] flex-col overflow-hidden rounded-2xl bg-nevo-cream shadow-[0_12px_40px_rgba(0,0,0,0.22)] motion-safe:animate-nevo-rise"
    >
      <div className="flex flex-none items-center justify-between gap-3 border-b border-nevo-near-black/8 px-5 pb-3.5 pt-[18px]">
        <span className="text-base font-semibold text-nevo-near-black">
          Notifications
        </span>
        <button
          type="button"
          onClick={markAllRead}
          disabled={allRead}
          className={cn(
            "text-[13px] font-semibold transition-opacity",
            allRead
              ? "cursor-default text-nevo-near-black/40"
              : "cursor-pointer text-nevo-navy hover:opacity-75",
          )}
        >
          {allRead ? "All read" : "Mark all read"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows === null ? (
          <div className="space-y-3 p-5">
            <div className="h-12 animate-pulse rounded-lg bg-nevo-near-black/[0.06]" />
            <div className="h-12 animate-pulse rounded-lg bg-nevo-near-black/[0.06]" />
          </div>
        ) : failed ? (
          /* SCRUM-100's fixed copy, verbatim, and its retry: "Violet line
             inside the panel, system owns it, 'Try again'." The line this
             replaced paraphrased it and offered no button - it told the
             reader to close the panel they were reading and open it again. */
          <div className="px-5 py-10 text-center">
            <p className="m-0 text-[13.5px] leading-[1.55] text-nevo-violet-text">
              We couldn&rsquo;t pull these in just now. We&rsquo;re on it.
            </p>
            <button
              type="button"
              onClick={retry}
              className="mt-3 cursor-pointer text-[13px] font-semibold text-nevo-navy hover:opacity-75"
            >
              Try again
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-[30px] py-11 text-center">
            <BellMark />
            <p className="m-0 text-base font-semibold text-nevo-near-black">
              You&rsquo;re all caught up
            </p>
            <p className="m-0 mt-2 text-[13.5px] leading-[1.55] text-nevo-near-black/62">
              Anything worth telling you - within what you look after - will
              show up here.
            </p>
          </div>
        ) : (
          rows.map((n, i) => (
            <NotificationRow
              key={n.notificationId}
              notification={n}
              archived={false}
              compact
              now={now}
              className={cn(i < rows.length - 1 && ROW_DIVIDER)}
              onRead={onRead}
              onArchive={onArchive}
            />
          ))
        )}
      </div>

      <div className="flex-none border-t border-nevo-near-black/8 px-5 py-3.5 text-center">
        <Link
          href="/admin/notifications"
          onClick={onClose}
          className="text-[13px] font-semibold text-nevo-navy hover:opacity-75"
        >
          See everything
        </Link>
      </div>
    </div>
  );
}
