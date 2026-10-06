"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks";
import type { NotificationKind } from "@/context/NotificationContext";
import { MaybeSample } from "@/components/shared/SampleRegion";
import { cn } from "@/lib/utils";

/**
 * Board 28's row marks, drawn with the frame's own paths: a book for a new
 * lesson, a speech bubble for a teacher's message. A kind the frame does not
 * draw - a review coming due, a change to how the child signs in - wears the
 * bell itself rather than a mark we chose for it.
 */
function KindMark({ kind }: { kind?: NotificationKind }) {
  if (kind === "lesson" || kind === "message") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="size-5"
      >
        <path
          d={
            kind === "lesson"
              ? "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"
              : "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12z"
          }
        />
      </svg>
    );
  }
  return <Bell className="size-5" strokeWidth={2} aria-hidden />;
}

/**
 * Notifications (board 28) - a quiet bell opening a calm panel: the two-line
 * feed, or the settled "Nothing new right now" empty state on a cream tile.
 *
 * Rows carry TITLE AND DESCRIPTION on two lines. The feed always had both and
 * the context collapsed them to one, discarding half of every notification.
 * A row with `navigatesTo` is a link and one without is not pretending to be -
 * the field is nullable in the contract. A panel anchored under the bell (popover on tablet/desktop, the same
 * card sized to the viewport on mobile). Never a badge count - a single dot
 * marks unread, no numbers anywhere.
 *
 * WHAT REACHES IT (backend B34, 1 Oct): the four types addressed to a child -
 * a lesson set, a review due, a teacher's reply, a change to how they sign in
 * - and nothing else; see `FOR_A_CHILD` in the context. The words are the
 * backend's, rendered as written. Each row wears the frame's mark for its
 * kind.
 */
export function NotificationBell({ className }: { className?: string }) {
  const { notifications, unreadCount, failed, loading, markRead, showingSamples } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Tap-away closes the panel (it never blocks anything).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative flex size-11 cursor-pointer items-center justify-center rounded-full text-nevo-near-black/70 transition-colors hover:bg-nevo-near-black/6"
      >
        <Bell className="size-[22px]" strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2.5 size-2 rounded-full bg-nevo-violet" />
        )}
      </button>

      {/*
        THE ONE SURFACE THE SAMPLE SWEEP COULD NOT SEE.
        
        The bell carried no mark and `StudentShell` mounts it OUTSIDE both
        `MaybeSample` wrappers, which cover the identity block and the avatar
        only. So when this bell invented "Ms Okafor sent you a message" the
        end-to-end run - whose whole job is to catch a console degrading to
        fixtures - had nothing to assert against, and the leak was found by
        reading the file instead.
        
        Marked on the BRANCH rather than the rows: see `showingSamples`.
      */}
      {open && (
        <MaybeSample showing={showingSamples} kind="student:notifications">
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute top-12 right-0 z-40 w-[320px] max-w-[calc(100vw-32px)] rounded-[12px] bg-nevo-cream p-2 shadow-[0_8px_32px_rgba(0,0,0,0.16)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-150"
        >
          <p className="px-3 pt-2 pb-1.5 text-[15px] font-semibold text-nevo-near-black">
            Notifications
          </p>
          {failed ? (
            /* Could not ask is not the same as nothing new. */
            <div className="flex flex-col items-center px-4 pt-6 pb-8 text-center">
              <span className="flex size-14 items-center justify-center rounded-[12px] bg-nevo-cream-elevated text-nevo-navy/50">
                <Bell className="size-[26px]" strokeWidth={2} />
              </span>
              <p className="mt-3.5 text-sm text-nevo-near-black/60">
                We couldn&rsquo;t load these just now
              </p>
            </div>
          ) : loading ? (
            /* Not answered yet is not "nothing new" either. */
            <div className="flex justify-center px-4 pt-8 pb-10">
              <span
                role="status"
                aria-label="Loading"
                className="block size-5 rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:800ms]"
              />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center px-4 pt-6 pb-8 text-center">
              <span className="flex size-14 items-center justify-center rounded-[12px] bg-nevo-cream-elevated text-nevo-navy/50">
                <Bell className="size-[26px]" strokeWidth={2} />
              </span>
              <p className="mt-3.5 text-sm text-nevo-near-black/60">
                Nothing new right now
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((n) => {
                const body = (
                  <>
                    {/* The frame's mark for the row, with the unread dot on
                        its shoulder the way the bell wears its own. */}
                    <span
                      className="relative mt-px size-5 shrink-0 text-nevo-navy"
                      data-kind={n.kind ?? "other"}
                    >
                      <KindMark kind={n.kind} />
                      {!n.read && (
                        <span
                          aria-label="Unread"
                          className="absolute -top-0.5 -right-1 size-2 rounded-full bg-nevo-violet ring-2 ring-nevo-cream"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-[1.4] font-medium text-nevo-near-black">
                        {n.title}
                      </span>
                      {n.text && (
                        <span className="mt-0.5 block text-[13px] leading-[1.45] text-nevo-near-black/62">
                          {n.text}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[12px] text-nevo-near-black/45">
                      {n.ago}
                    </span>
                  </>
                );
                const row =
                  "flex items-start gap-3 rounded-[10px] px-3 py-3 text-left transition-colors hover:bg-nevo-cream-elevated";
                /*
                 * OPENING IT IS READING IT, on both kinds of row.
                 *
                 * A row without `navigatesTo` still gets a button, because it
                 * now does something - it clears its own dot. It stays a plain
                 * element only while it is already read, so nothing pretends
                 * to be actionable when there is nothing left to do.
                 */
                if (n.href) {
                  return (
                    <Link
                      key={n.id}
                      href={n.href}
                      onClick={() => {
                        if (!n.read) markRead(n.id);
                        setOpen(false);
                      }}
                      className={row}
                    >
                      {body}
                    </Link>
                  );
                }
                return n.read ? (
                  <div key={n.id} className={row}>
                    {body}
                  </div>
                ) : (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markRead(n.id)}
                    className={cn(row, "w-full cursor-pointer")}
                  >
                    {body}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        </MaybeSample>
      )}
    </div>
  );
}
