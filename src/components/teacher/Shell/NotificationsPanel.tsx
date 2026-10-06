"use client";

import Link from "next/link";
import { useEffect } from "react";
import type {
  NotificationKind,
  TeacherNotification,
} from "@/lib/mocks/teacherNotifications";
import { cn } from "@/lib/utils";

/**
 * C13 Notifications - a calm reverse-chronological popover from the sidebar
 * bell. A badge dot, never a count; each line is one brief sentence; unread
 * carries a soft violet tint, not bold shouting.
 *
 * Positioned fixed at the frame's own coordinates (the rail clips absolute
 * children). Rows are not clickable - the frame gives them no destination.
 */

const KIND_ICON: Record<NotificationKind, React.ReactNode> = {
  flag: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7l5 4 4-3 4 5 5-6" />
    </svg>
  ),
  message: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12z" />
    </svg>
  ),
  done: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  support: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </svg>
  ),
  klass: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    </svg>
  ),
};

export function NotificationsPanel({
  notes,
  failed = false,
  loading = false,
  onRetry,
  onOpen,
  onArchive,
  onUndoArchive,
  lastArchived,
  onMarkAllRead,
  onClose,
}: {
  notes: TeacherNotification[];
  /** The feed could not be read. Not the same as having nothing to show. */
  failed?: boolean;
  /** The feed has not answered yet. Not the same as having nothing either. */
  loading?: boolean;
  /** Read the feed again, from the failed state. */
  onRetry?: () => void;
  /** Marks the row read; the row navigates itself. */
  onOpen?: (id: string) => void;
  onArchive?: (id: string) => void;
  onUndoArchive?: () => void;
  /** Present only while an archive can still be undone. */
  lastArchived?: { id: string; text: string } | null;
  onMarkAllRead: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasUnread = notes.some((n) => n.unread);
  const empty = notes.length === 0;

  return (
    <>
      <div aria-hidden onClick={onClose} className="fixed inset-0 z-40" />
      <div
        role="dialog"
        aria-label="Notifications"
        className="fixed bottom-20 left-[88px] z-50 w-[360px] overflow-hidden rounded-[12px] bg-nevo-cream shadow-[0_8px_32px_rgba(0,0,0,0.16)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150 xl:bottom-24 xl:left-[200px] xl:w-[380px]"
      >
        <div
          className={cn(
            "border-b border-nevo-near-black/8 px-5 pt-[18px] pb-3.5",
            !empty && "flex items-center justify-between",
          )}
        >
          <h3 className="text-base font-semibold text-nevo-near-black">
            Notifications
          </h3>
          {/* The empty frame's head carries no action. */}
          {!empty && hasUnread && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="cursor-pointer text-[13px] font-medium text-nevo-navy transition-colors hover:text-nevo-navy/80"
            >
              Mark all read
            </button>
          )}
        </div>

        {loading ? (
          /* C13 draws no loading state, so this one claims nothing: rows
             without words, until the feed answers. */
          <div aria-busy="true" aria-label="Loading notifications" className="flex flex-col gap-2.5 px-5 py-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[52px] animate-pulse rounded-[10px] bg-nevo-cream-elevated" />
            ))}
          </div>
        ) : empty && failed ? (
          <div className="flex flex-col items-center px-6 py-11 text-center">
            <div className="flex size-14 items-center justify-center rounded-[12px] bg-nevo-cream-elevated text-nevo-violet">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17.5 9.5 4 4 0 0 1 17 18" />
                <path d="M10 20.5l4-4M14 20.5l-4-4" />
              </svg>
            </div>
            <p className="mt-4 text-[15px] text-nevo-near-black/62">
              We couldn&rsquo;t load your notifications.
            </p>
            <p className="mt-1 text-[13.5px] text-nevo-near-black/50">
              This isn&rsquo;t an empty inbox. Try again in a moment.
            </p>
            {/* "Try again" with nothing to press was a sentence about a
                control that did not exist. */}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-4 h-10 cursor-pointer rounded-[10px] border-[1.5px] border-nevo-navy/35 px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
              >
                Try again
              </button>
            )}
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center px-6 py-11 text-center">
            <div className="flex size-14 items-center justify-center rounded-[12px] bg-nevo-cream-elevated text-nevo-violet">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
            </div>
            <p className="mt-4 text-[15px] text-nevo-near-black/62">
              Nothing new right now.
            </p>
          </div>
        ) : (
          <div className="max-h-[520px] overflow-y-auto">
            {notes.map((n, i) => {
              /* A row with `navigatesTo` is a link; one without is not
                 pretending to be. `navigatesTo` is nullable in the contract,
                 so some rows genuinely have nowhere to go. */
              const Row = n.href ? Link : "div";
              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-[11px] px-[18px] py-[13px] xl:gap-[13px] xl:px-5 xl:py-[15px]",
                    n.unread && "bg-nevo-violet/9",
                    i < notes.length - 1 && "border-b border-nevo-near-black/6",
                  )}
                >
                  <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px] bg-nevo-navy/10 text-nevo-navy">
                    {KIND_ICON[n.kind]}
                  </span>
                  <Row
                    href={n.href ?? "#"}
                    onClick={() => {
                      if (n.unread) onOpen?.(n.id);
                      if (n.href) onClose();
                    }}
                    className={cn(
                      "min-w-0 flex-1 text-left",
                      n.href && "cursor-pointer",
                    )}
                  >
                    <p className="text-sm leading-[1.45] font-medium text-nevo-near-black">
                      {n.text}
                    </p>
                    {n.detail && (
                      <p className="mt-[3px] text-[13px] leading-[1.45] text-nevo-near-black/62">
                        {n.detail}
                      </p>
                    )}
                    <span className="mt-[3px] block text-xs text-nevo-near-black/50">
                      {n.time}
                    </span>
                  </Row>
                  <div className="flex shrink-0 items-center gap-1.5 pt-[3px]">
                    {n.unread && (
                      <button
                        type="button"
                        aria-label="Mark as read"
                        title="Mark as read"
                        onClick={() => onOpen?.(n.id)}
                        className="inline-flex size-[26px] cursor-pointer items-center justify-center rounded-lg text-nevo-violet transition-colors hover:bg-nevo-navy/8"
                      >
                        <span className="size-2 rounded-full bg-nevo-violet" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Archive"
                      title="Archive"
                      onClick={() => onArchive?.(n.id)}
                      className="inline-flex size-[26px] cursor-pointer items-center justify-center rounded-lg text-nevo-near-black/40 transition-colors hover:bg-nevo-navy/8 hover:text-nevo-near-black/70"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <rect x="3" y="4" width="18" height="4" rx="1" />
                        <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Archived rows can never be listed again - the feed takes no
            parameters and carries no archived flag - so this inline undo is
            the ONLY way back. It has to be here, not on a page to visit. */}
        {lastArchived && (
          <div className="flex items-center gap-3 border-t border-nevo-near-black/8 px-[18px] py-3 xl:px-5">
            <span className="min-w-0 flex-1 truncate text-[13px] text-nevo-near-black/62">
              {`Archived "${lastArchived.text}"`}
            </span>
            <button
              type="button"
              onClick={onUndoArchive}
              className="shrink-0 cursor-pointer text-[13px] font-semibold text-nevo-navy"
            >
              Undo
            </button>
          </div>
        )}
      </div>
    </>
  );
}
