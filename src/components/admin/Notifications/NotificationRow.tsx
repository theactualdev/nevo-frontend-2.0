"use client";

import { useRouter } from "next/navigation";
import type { Notification } from "@/lib/api/notifications";
import { categoryLabel } from "./categories";
import { cn } from "@/lib/utils";

/**
 * One notification, in the panel and on the page.
 *
 * The anatomy is fixed by SCRUM-100 and two details of it are called out as
 * "do not move":
 *   - the UNREAD DOT is a 7px violet mark sitting INLINE after the category
 *     label, top-left of the row. Not at the right edge, and not a bold row or
 *     a tinted background.
 *   - the ARCHIVE action is the only thing entering the row's right edge,
 *     which is precisely why the dot lives on the left.
 *
 * On desktop the archive action is revealed on hover; on tablet it sits in the
 * row's own layout, because hover does not exist there. `group-hover` plus an
 * always-visible fallback below the lg breakpoint does both.
 *
 * A row with somewhere to go is the whole target and navigates there. A row
 * with nowhere to go - most Platform items - is not clickable and shows no
 * hover, so the surface never promises an action it does not have.
 */

/**
 * The icon tile.
 *
 * One accent treatment exists in this design: soft violet for the row worth
 * looking at first, navy-tinted for everything else. There is no red, no
 * amber, and no exclamation glyph anywhere in the set - so "accent" here means
 * unread, not urgent.
 */
function IconTile({ accent, size }: { accent: boolean; size: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex flex-none items-center justify-center rounded-[10px] text-nevo-navy",
        accent ? "bg-nevo-violet/24" : "bg-nevo-navy/10",
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size === 34 ? 16 : 18}
        height={size === 34 ? 16 : 18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    </span>
  );
}

/**
 * Relative time, computed from a timestamp captured once by the caller rather
 * than read here - React purity, and it keeps every row on the same clock.
 */
function relative(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const mins = Math.round((now - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function NotificationRow({
  notification,
  archived,
  className,
  compact = false,
  now,
  onRead,
  onArchive,
  onRestore,
}: {
  notification: Notification;
  archived: boolean;
  className?: string;
  /** The panel uses the tighter geometry; the page uses the fuller one. */
  compact?: boolean;
  now?: number;
  onRead: (id: string) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
}) {
  const router = useRouter();
  const unread = !notification.read;
  const target = notification.navigatesTo;
  const clickable = Boolean(target);

  const go = () => {
    if (unread) onRead(notification.notificationId);
    if (target) router.push(target);
  };

  return (
    <div
      className={cn(
        "group flex items-start gap-[13px]",
        compact ? "px-5 py-[15px]" : "px-[22px] py-[18px]",
        clickable && "cursor-pointer transition-colors hover:bg-nevo-navy/[0.03]",
        className,
      )}
      onClick={clickable ? go : undefined}
      role={clickable ? "link" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                go();
              }
            }
          : undefined
      }
    >
      <IconTile accent={unread} size={compact ? 34 : 38} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[7px]">
          {/* The category's name (backend B34, 1 Oct), or nothing - never
              the raw type. See `categoryLabel`. */}
          {categoryLabel(notification.category) ? (
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-nevo-near-black/45">
              {categoryLabel(notification.category)}
            </span>
          ) : null}
          {unread ? (
            <span
              aria-label="Unread"
              className="size-[7px] flex-none rounded-full bg-nevo-violet"
            />
          ) : null}
        </div>

        <p
          className={cn(
            "m-0 mt-[3px] text-nevo-near-black",
            compact ? "text-sm leading-[1.5]" : "text-[15px] leading-[1.5]",
          )}
        >
          {notification.title}
        </p>
        {notification.description && notification.description !== notification.title ? (
          <p className="m-0 mt-1 text-[13px] leading-[1.5] text-nevo-near-black/62">
            {notification.description}
          </p>
        ) : null}
        <p className="m-0 mt-1 text-xs text-nevo-near-black/50">
          {relative(notification.createdAt, now ?? Date.parse(notification.createdAt))}
        </p>
      </div>

      {archived ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRestore?.(notification.notificationId);
          }}
          className="flex-none cursor-pointer text-[13px] font-semibold text-nevo-navy transition-opacity hover:opacity-75"
        >
          Put back
        </button>
      ) : onArchive ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onArchive(notification.notificationId);
          }}
          className={cn(
            "flex-none cursor-pointer text-[13px] font-semibold text-nevo-near-black/55 transition-opacity hover:text-nevo-near-black/80",
            /*
             * HOVER IS THE PANEL'S TREATMENT, NOT THE PAGE'S, and this row
             * applied one rule to both. SCRUM-100 says of the panel row "a
             * small quiet action revealed on row hover only", and of the PAGE
             * row "the archive action always visible rather than hover-only" -
             * two sentences, one per surface. The breakpoint written here
             * honoured neither: it hid the action on the page at both designed
             * widths, and revealed it in the panel only above 1024.
             */
            compact
              ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              : "opacity-100",
          )}
        >
          Archive
        </button>
      ) : null}
    </div>
  );
}
