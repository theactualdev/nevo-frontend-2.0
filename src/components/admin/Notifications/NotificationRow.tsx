"use client";

import { useRouter } from "next/navigation";
import type { Notification } from "@/lib/api/notifications";
import { rowLabel } from "./categories";
import { useCanOpen } from "../Shell/useCanOpen";
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
 * D13's FOUR AREAS, each with the frame's own glyph (backlog 72): Roster,
 * Learning support, IT & SSO and Billing. A row's area comes from its
 * category, by the map the hub approved on 27 Nov - consent to Roster,
 * billing to Billing, account ("Platform": roster sync, sign-in) to IT & SSO,
 * attention to Learning support. Anything else keeps the bell, rather than
 * being given an area nobody said it belongs to.
 */
type Area = "roster" | "senco" | "it" | "billing" | "bell";

const AREA_BY_CATEGORY: Record<string, Area> = {
  consent: "roster",
  billing: "billing",
  account: "it",
  attention: "senco",
};

export function areaOf(category: string | null | undefined): Area {
  return (category && AREA_BY_CATEGORY[category]) || "bell";
}

function AreaGlyph({ area }: { area: Area }) {
  switch (area) {
    case "roster":
      return (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
        </>
      );
    case "senco":
      return <path d="M12 20s-6.5-4.2-9-8A4.7 4.7 0 0 1 12 6.3 4.7 4.7 0 0 1 21 12c-2.5 3.8-9 8-9 8z" />;
    case "it":
      return (
        <>
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </>
      );
    case "billing":
      return (
        <>
          <rect x="2.5" y="5" width="19" height="14" rx="2.2" />
          <path d="M2.5 9.5h19" />
        </>
      );
    default:
      return (
        <>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </>
      );
  }
}

/**
 * The icon tile.
 *
 * One accent treatment exists in this design: soft violet for the row worth
 * looking at first, navy-tinted for everything else. There is no red, no
 * amber, and no exclamation glyph anywhere in the set - so "accent" here means
 * unread, not urgent.
 */
function IconTile({ accent, size, area }: { accent: boolean; size: number; area: Area }) {
  return (
    <span
      aria-hidden="true"
      data-area={area}
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
        strokeWidth={area === "bell" ? 2 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <AreaGlyph area={area} />
      </svg>
    </span>
  );
}

/**
 * Relative time, computed from a timestamp captured once by the caller rather
 * than read here - React purity, and it keeps every row on the same clock.
 *
 * IN D13's WORDS (backlog 72), where it was "2h ago" and "1d ago". The panel
 * (D13) says "2 hours ago", "Yesterday", "2 days ago"; the page (D13b) says
 * "2 hours ago", "Yesterday, 9:04 AM", and the date after that ("22 July").
 * Minutes follow the hours' pattern; neither frame draws one.
 */
export function relative(iso: string, now: number, compact = false): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  const mins = Math.round((now - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return plural(mins, "minute");
  const hours = Math.round(mins / 60);
  if (hours < 24) return plural(hours, "hour");
  const days = Math.round(hours / 24);
  const date = new Date(then);
  if (days === 1) {
    return compact
      ? "Yesterday"
      : `Yesterday, ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  if (compact && days < 7) return plural(days, "day");
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
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
  /*
   * NO LINK TO A REFUSAL - the rule the Overview's rows already keep. A
   * notice can reach an admin who can't open where it points: "A teacher
   * needs help with a learner account" goes to roster admins, but to EVERY
   * admin when a school has no roster holder (item 20, 7 Nov) - and it links
   * to the child's record, which a billing-only or IT admin can't open. Such
   * a row still says what happened; it just isn't a link.
   */
  const mayOpen = useCanOpen();
  const target =
    notification.navigatesTo && mayOpen(notification.navigatesTo)
      ? notification.navigatesTo
      : null;
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
      <IconTile accent={unread} size={compact ? 34 : 38} area={areaOf(notification.category)} />

      {/*
        * The {" "} between these lines is a space nobody sees - white space
        * between blocks collapses - that keeps them apart as TEXT. Drawn on
        * separate lines, they still ran together wherever the row's raw text
        * is read or copied: "PlatformRoster sync could not run", and the
        * title into its description (TO-DO 14).
        */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[7px]">
          {/* The category's name (backend B34, 1 Oct), or nothing - never
              the raw type. See `categoryLabel`. */}
          {rowLabel(notification) ? (
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-nevo-near-black/45">
              {rowLabel(notification)}
            </span>
          ) : null}
          {unread ? (
            <span
              aria-label="Unread"
              className="size-[7px] flex-none rounded-full bg-nevo-violet"
            />
          ) : null}
        </div>{" "}
        <p
          className={cn(
            "m-0 mt-[3px] text-nevo-near-black",
            compact ? "text-sm leading-[1.5]" : "text-[15px] leading-[1.5]",
          )}
        >
          {notification.title}
        </p>{" "}
        {notification.description && notification.description !== notification.title ? (
          <>
            <p className="m-0 mt-1 text-[13px] leading-[1.5] text-nevo-near-black/62">
              {notification.description}
            </p>{" "}
          </>
        ) : null}
        <p className="m-0 mt-1 text-xs text-nevo-near-black/50">
          {relative(notification.createdAt, now ?? Date.parse(notification.createdAt), compact)}
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
            /*
             * AND IN THE ROW ON A TABLET (SCRUM-100: "a quiet action on hover
             * (in the row on tablet)"; backlog 73). It was hover-only at every
             * width, so on a touch tablet it never appeared at all. Revealed
             * on hover only from 1280 and only where a pointer can hover.
             */
            compact
              ? "xl:[@media(hover:hover)_and_(pointer:fine)]:opacity-0 xl:[@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 xl:[@media(hover:hover)_and_(pointer:fine)]:group-focus-within:opacity-100"
              : "opacity-100",
          )}
        >
          Archive
        </button>
      ) : null}
    </div>
  );
}
