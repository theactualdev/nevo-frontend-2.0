"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePermissions } from "@/hooks";
import { notificationsApi, type Notification } from "@/lib/api/notifications";
import { announceReadStateChanged } from "./readState";
import { cn } from "@/lib/utils";
import { CARD, PRIMARY_BTN, ROW_DIVIDER } from "../Roster/primitives";
import { NotificationPreferences } from "./NotificationPreferences";
import { NotificationRow } from "./NotificationRow";
import { NoAccess, failureKind } from "../NoAccess";
import { WriteFailed } from "../WriteFailed";

/**
 * D13b Notifications - the record and the preferences (SCRUM-100).
 *
 * ONE ROUTE, THREE VIEWS. Archived is a FILTER, not a separate page - the
 * spec's own "done when" says so - and Preferences is a section of this page
 * reached by a text action beside the filters, rather than a fourth nav item.
 *
 * The tone rules are load-bearing here and easy to erode:
 *   - Nothing is urgent-coloured. No red, no amber, no exclamation glyph, no
 *     "action required" label.
 *   - Unread is a small violet dot beside the category label, not a bold row
 *     or a tinted background.
 *   - Mark-all-read settles to "All read" rather than vanishing.
 *   - Nothing is ever deleted. Archive tidies; Put back reverses it.
 *
 * PAGINATION IS "SHOW OLDER", not numbered pages and not infinite scroll, so
 * an admin never loses their place. It appends, and the scroll position is
 * therefore preserved for free.
 *
 * TODO(api): `GET /api/notifications` takes `archived`, `limit` and `offset`
 * and nothing else, and `NotificationResponse` carries no CATEGORY. So D13b's
 * category filter pill, its per-row category label and its category-scoped
 * "Mark these as read" have no source. Search is client-side over the loaded
 * page for the same reason - there is no `q` parameter. All three become real
 * the moment a category lands on the row.
 *
 * THE ADMIN EVENTS ARRIVE NOW (backend, 7 Sep): admin_welcome,
 * consent_action_required, roster_sync_completed, roster_sync_needs_attention,
 * invoice_issued and sso_needs_attention. This page needed no change to show
 * them - it renders whatever comes - so an admin's inbox is no longer empty on
 * day one.
 *
 * There is deliberately no per-type icon. The design has ONE accent treatment
 * (soft violet for unread, navy for the rest) and no urgency glyphs anywhere in
 * the set; picking six new icons would be inventing design rather than applying
 * it.
 *
 * TODO(api): a `category` ON THE ROW. `NotificationCategory` exists for
 * preferences, but `NotificationResponse` carries only `type` - so the category
 * filter, the per-category label and "mark these as read" still have no source.
 * Three of SCRUM-100's six admin categories (roster, SSO, teacher) have no enum
 * value either, so this needs a design and backend answer together.
 */

type Phase = "loading" | "ready" | "failed" | "denied";
type View = "inbox" | "archived" | "preferences";

const PAGE = 20;

const SEARCH_BAR =
  "flex h-[42px] w-full max-w-[320px] flex-1 items-center gap-[9px] rounded-[10px] border-[1.5px] border-nevo-near-black/10 bg-nevo-cream-elevated px-[15px] text-[14.5px] text-nevo-near-black outline-none transition-colors placeholder:text-nevo-near-black/50 focus-within:border-nevo-navy";

const FILTER_PILL =
  "flex h-[42px] cursor-pointer items-center gap-[7px] rounded-[10px] border-[1.5px] border-nevo-near-black/16 px-[14px] text-[13.5px] font-medium text-nevo-near-black/72 transition-colors hover:bg-nevo-navy/[0.06]";

function SearchIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none text-nevo-near-black/50"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4-4" />
    </svg>
  );
}

/**
 * Day headings, using the reader's own locale. `now` is passed in rather than
 * read here - React's purity rule forbids a clock read during render, and it
 * also means every row is dated against the same instant.
 */
function dayLabel(iso: string, now: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const startOf = (t: number) => {
    const x = new Date(t);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const days = Math.round((startOf(now) - startOf(d.getTime())) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function NotificationsView() {
  const { scopes } = usePermissions();
  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<View>("inbox");
  const [rows, setRows] = useState<Notification[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [hasMore, setHasMore] = useState(false);
  /** The feed's own count of the view - D13b's "N archived". Undefined is unknown. */
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [olderFailed, setOlderFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allRead, setAllRead] = useState(false);
  /** What an action failed to do, in the admin's words. "" when none has. */
  const [writeFailed, setWriteFailed] = useState("");
  const [now, setNow] = useState(0);

  const archived = view === "archived";

  const load = useCallback((wantArchived: boolean) => {
    notificationsApi
      .list({ archived: wantArchived, limit: PAGE, offset: 0 })
      .then((feed) => {
        setRows(feed.notifications);
        setHasMore(Boolean(feed.hasMore));
        setTotal(typeof feed.total === "number" ? feed.total : undefined);
        setNow(Date.now());
        setAllRead(feed.unreadCount === 0);
        setPhase("ready");
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
  }, []);

  useEffect(() => {
    if (view === "preferences") return;
    load(archived);
  }, [load, archived, view]);

  const showOlder = () => {
    setOlderFailed(false);
    setLoadingMore(true);
    notificationsApi
      .list({ archived, limit: PAGE, offset: rows.length })
      .then((feed) => {
        // Append: "Show older" must never move what the reader was looking at.
        setRows((prev) => [...prev, ...feed.notifications]);
        setHasMore(Boolean(feed.hasMore));
      })
      .catch(() => {
        // Was `setHasMore(false)`, which rendered "That's everything." - a
        // failed page-read told the admin they had seen the lot. Keep
        // `hasMore` as it was so the control stays, and say what happened.
        setOlderFailed(true);
      })
      .finally(() => setLoadingMore(false));
  };

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((n) => {
      if (unreadOnly && n.read) return false;
      if (!needle) return true;
      return (
        n.title.toLowerCase().includes(needle) ||
        n.description.toLowerCase().includes(needle)
      );
    });
  }, [rows, search, unreadOnly]);

  const grouped = useMemo(() => {
    const out: { day: string; items: Notification[] }[] = [];
    for (const n of visible) {
      const day = dayLabel(n.createdAt, now);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(n);
      else out.push({ day, items: [n] });
    }
    return out;
  }, [visible, now]);

  const markAllRead = () => {
    /*
     * The rows were painted read optimistically and NEVER put back: the catch
     * reverted the button only. So a refused POST left every unread dot gone,
     * and "Unread only" then reported "You're up to date." - a failed WRITE
     * manufacturing the same false absence that PR #269 spent five fixes
     * removing from failed READS. Snapshot, and restore what was actually
     * there rather than guessing.
     */
    /*
     * Restore the READ FLAGS, not the array. `setRows(before)` was a whole
     * array overwrite, so anything that landed while the POST was in flight -
     * a "Show older" page, an archive - was thrown away with it, and the older
     * page's disappearance put "That's everything." back on a list that had
     * more. A failed write manufacturing an absence again, one level down.
     */
    const readBefore = new Map(rows.map((n) => [n.notificationId, n.read]));
    setAllRead(true);
    setWriteFailed("");
    setRows((prev) => prev.map((n) => ({ ...n, read: true })));
    notificationsApi.markAllRead().then(announceReadStateChanged, () => {
      setAllRead(false);
      setRows((prev) =>
        prev.map((n) =>
          readBefore.has(n.notificationId)
            ? { ...n, read: readBefore.get(n.notificationId) as boolean }
            : n,
        ),
      );
      setWriteFailed("mark everything as read");
    });
  };

  /*
   * Its failure was swallowed, leaving the row painted read while the server
   * still held it unread. Now it is put back and said, as mark-all does.
   */
  const onRead = (id: string) => {
    const wasUnread = rows.some((n) => n.notificationId === id && !n.read);
    setRows((prev) =>
      prev.map((n) => (n.notificationId === id ? { ...n, read: true } : n)),
    );
    notificationsApi.markRead(id).then(announceReadStateChanged, () => {
      if (!wasUnread) return;
      setRows((prev) =>
        prev.map((n) => (n.notificationId === id ? { ...n, read: false } : n)),
      );
      setWriteFailed("mark that as read");
    });
  };

  // Archive and Put back both remove the row from the view it is in, because
  // that view is defined by the flag they just changed.
  //
  // A refusal reloaded the list SILENTLY - the row came back with no word why,
  // which reads as the button not working. It now says what didn't happen.
  const onArchive = (id: string) => {
    setWriteFailed("");
    setRows((prev) => prev.filter((n) => n.notificationId !== id));
    notificationsApi.archive(id).then(announceReadStateChanged, () => {
      setWriteFailed("archive that");
      load(archived);
    });
  };

  const onRestore = (id: string) => {
    setWriteFailed("");
    setRows((prev) => prev.filter((n) => n.notificationId !== id));
    setTotal((t) => (typeof t === "number" ? Math.max(0, t - 1) : t));
    notificationsApi.restore(id).then(announceReadStateChanged, () => {
      setWriteFailed("put that back");
      load(archived);
    });
  };

  const filtering = Boolean(search.trim() || unreadOnly);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[820px]">
        <div className="flex items-start justify-between gap-6">
          <h2 className="m-0 text-[28px] font-semibold tracking-[-0.018em] text-nevo-near-black">
            Notifications
          </h2>
          <button
            type="button"
            onClick={() => setView(view === "preferences" ? "inbox" : "preferences")}
            className="cursor-pointer text-sm font-semibold text-nevo-navy transition-opacity hover:opacity-75"
          >
            {view === "preferences" ? "Back to notifications" : "Preferences"}
          </button>
        </div>

        {view === "preferences" ? (
          <NotificationPreferences scopes={scopes} />
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <label className={SEARCH_BAR}>
                <SearchIcon />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search notifications"
                  aria-label="Search notifications"
                  className="min-w-0 flex-1 border-none bg-transparent outline-none"
                />
              </label>

              <button
                type="button"
                onClick={() => setView(archived ? "inbox" : "archived")}
                aria-pressed={archived}
                className={cn(
                  FILTER_PILL,
                  archived && "border-nevo-navy bg-nevo-navy/[0.06] text-nevo-navy",
                )}
              >
                {archived ? "Archived" : "Show archived"}
              </button>

              {!archived ? (
                <button
                  type="button"
                  onClick={() => setUnreadOnly((v) => !v)}
                  aria-pressed={unreadOnly}
                  className={cn(
                    FILTER_PILL,
                    unreadOnly && "border-nevo-navy bg-nevo-navy/[0.06] text-nevo-navy",
                  )}
                >
                  Unread only
                </button>
              ) : null}

              {!archived ? (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={allRead}
                  className={cn(
                    "ml-auto cursor-pointer text-[13px] font-semibold transition-opacity",
                    allRead
                      ? "cursor-default text-nevo-near-black/40"
                      : "text-nevo-navy hover:opacity-75",
                  )}
                >
                  {allRead ? "All read" : "Mark all read"}
                </button>
              ) : null}
            </div>

            {archived ? (
              <p className="mt-4 text-[13px] leading-[1.55] text-nevo-near-black/58">
                {/* D13b's count line, from the feed's own total - never the
                    rows loaded so far, which are one page of it. */}
                {phase === "ready" && typeof total === "number" && total > 0
                  ? `${total} archived. `
                  : ""}
                Archiving only tidies your list. You can put anything back -
                nothing is ever deleted.
              </p>
            ) : null}

            {writeFailed ? (
              <WriteFailed className="mt-4" what={writeFailed} />
            ) : null}

            {phase === "loading" ? (
              <div className={cn(CARD, "mt-4 h-[320px] animate-pulse")} />
            ) : null}

            {phase === "denied" ? (
          <NoAccess what="these notifications" />
        ) : phase === "failed" ? (
              <div className={cn(CARD, "mt-4 px-[26px] py-7")}>
                <h3 className="text-[17px] font-semibold text-nevo-near-black">
                  We couldn&rsquo;t load your notifications
                </h3>
                <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
                  Nothing has been missed - this is only about showing them to
                  you. Try again in a moment.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPhase("loading");
                    load(archived);
                  }}
                  className={cn(PRIMARY_BTN, "mt-5")}
                >
                  Try again
                </button>
              </div>
            ) : null}

            {phase === "ready" && visible.length === 0 ? (
              <div className={cn(CARD, "mt-4 px-6 py-14 text-center")}>
                <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
                  {/*
                    * "You're up to date." ONLY WHEN IT IS KNOWN. Unread-only
                    * filters the rows loaded so far; with older pages not yet
                    * fetched it could claim a caught-up inbox over unread
                    * notifications it had never seen.
                    */}
                  {archived
                    ? "Nothing archived"
                    : filtering
                      ? unreadOnly && !search.trim()
                        ? hasMore
                          ? "Nothing unread among the latest"
                          : "You're up to date."
                        : "Nothing matches that"
                      : "Nothing yet"}
                </h3>
                <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-[1.6] text-nevo-near-black/62">
                  {archived
                    ? "Archive anything you've dealt with and it will wait here. Nothing is ever deleted."
                    : filtering
                      ? unreadOnly && !search.trim()
                        ? hasMore
                          ? "There are older notifications we haven't shown yet. Show them to check those too."
                          : "Everything here has been read."
                        : "Try a different search, or clear the filters."
                      : "When a parent confirms consent, a teacher joins, an invoice arrives or your sign-in needs attention, it'll show up here."}
                </p>
                {unreadOnly && !search.trim() && hasMore ? (
                  <button
                    type="button"
                    onClick={showOlder}
                    disabled={loadingMore}
                    className="mt-3 mr-4 cursor-pointer text-sm font-semibold text-nevo-navy hover:opacity-75 disabled:cursor-default disabled:opacity-50"
                  >
                    {loadingMore ? "Loading…" : "Show older"}
                  </button>
                ) : null}
                {filtering ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setUnreadOnly(false);
                    }}
                    className="mt-3 cursor-pointer text-sm font-semibold text-nevo-navy hover:opacity-75"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : null}

            {phase === "ready" && visible.length > 0 ? (
              <>
                {grouped.map((group) => (
                  <section key={group.day} className="mt-6">
                    <h3 className="m-0 mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-nevo-near-black/45">
                      {group.day}
                    </h3>
                    <div className={CARD}>
                      {group.items.map((n, i) => (
                        <NotificationRow
                          key={n.notificationId}
                          notification={n}
                          archived={archived}
                          now={now}
                          className={cn(i < group.items.length - 1 && ROW_DIVIDER)}
                          onRead={onRead}
                          onArchive={onArchive}
                          onRestore={onRestore}
                        />
                      ))}
                    </div>
                  </section>
                ))}

                <div className="mt-6 text-center">
                  {hasMore ? (
                    <>
                      <button
                        type="button"
                        onClick={showOlder}
                        disabled={loadingMore}
                        className="cursor-pointer text-sm font-semibold text-nevo-navy transition-opacity hover:opacity-75 disabled:opacity-50"
                      >
                        {loadingMore
                          ? "Loading…"
                          : olderFailed
                            ? "Try again"
                            : "Show older"}
                      </button>
                      {olderFailed && (
                        <p className="m-0 mt-1.5 text-[13px] text-nevo-near-black/55">
                          That didn&rsquo;t load - there are still older ones.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="m-0 text-[13px] text-nevo-near-black/45">
                      That&rsquo;s everything.
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
