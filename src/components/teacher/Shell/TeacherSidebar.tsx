"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/constants/permissions";
import { MOCK_TEACHER, TEACHER_NAV, type TeacherNavItem } from "./teacherNav";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { MaybeSample } from "@/components/shared/SampleRegion";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTeacherNotifications } from "@/hooks/useTeacherNotifications";
import { AvatarDisc } from "@/components/shared/AvatarDisc";
// Lives under Profile/ because that page owned it first; it is generic.
import { SignOutModal } from "@/components/teacher/Profile/SignOutModal";
import { FeedbackPanel } from "./FeedbackPanel";
import { NotificationsPanel } from "./NotificationsPanel";

/**
 * Teacher nav rail (`Nevo Teacher Sidebar` frame) - 240px expanded, 64px
 * collapsed, the same rail at every size: tablet opens collapsed, desktop
 * expanded (the C-screen docs' tablet variants render `collapsed`), and the
 * chevron toggles either way. Five tabs, the notification bell with its quiet
 * violet dot, and the teacher identity row.
 *
 * Icons are the frame's own 22px strokes, ported verbatim - they are close to
 * lucide's but not identical, and the frame is the authority.
 */

const STROKE = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ICONS: Record<TeacherNavItem["name"], React.ReactNode> = {
  Home: (
    <svg {...STROKE} aria-hidden>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  ),
  Classes: (
    <svg {...STROKE} aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.5a3 3 0 0 1 0 6" />
      <path d="M17.5 20a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  ),
  Library: (
    <svg {...STROKE} aria-hidden>
      <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19a2 2 0 0 1 2-2h12" />
      <path d="M9 7h6" />
    </svg>
  ),
  Insights: (
    <svg {...STROKE} aria-hidden>
      <path d="M12 3a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z" />
      <path d="M10 20h4" />
      <path d="M10.5 17h3" />
    </svg>
  ),
  Connect: (
    <svg {...STROKE} aria-hidden>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12z" />
    </svg>
  ),
};

const BELL_ICON = (
  <svg {...STROKE} aria-hidden>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

/** Row shell shared by tabs, the bell and the collapse control. */
function rowClass(expanded: boolean, extra?: string) {
  return cn(
    "relative flex h-[46px] shrink-0 cursor-pointer items-center gap-3.5 rounded-[10px] transition-colors duration-[130ms]",
    expanded ? "px-3.5" : "justify-center px-0",
    extra,
  );
}

const GLYPH = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
  width: 18,
  height: 18,
} as const;

/** C11 avatar menu. Sign out is set apart by a divider, not by colour. */
const ACCOUNT_MENU: {
  label: string;
  href?: string;
  /** Opens a panel or modal instead of navigating. */
  opens?: "feedback" | "signout";
  divider?: boolean;
  icon: React.ReactNode;
}[] = [
  {
    label: "View profile",
    href: "/teacher/profile",
    icon: (
      <svg {...GLYPH} aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
  {
    label: "Settings",
    href: "/teacher/profile",
    icon: (
      <svg {...GLYPH} aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 2h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 22h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6A7 7 0 0 0 19 12z" />
      </svg>
    ),
  },
  {
    label: "Help & support",
    href: "/teacher/help",
    icon: (
      <svg {...GLYPH} aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3" />
        <path d="M12 17h.01" />
      </svg>
    ),
  },
  {
    label: "Share feedback",
    opens: "feedback",
    icon: (
      <svg {...GLYPH} aria-hidden>
        <path d="M21 11.5a8.4 8.4 0 0 1-11.9 7.6L3 21l1.9-5.6A8.4 8.4 0 1 1 21 11.5z" />
      </svg>
    ),
  },
  {
    label: "Sign out",
    opens: "signout",
    divider: true,
    icon: (
      <svg {...GLYPH} aria-hidden>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
    ),
  },
];

export function TeacherSidebar() {
  const pathname = usePathname();
  // C13: the bell opens a popover; the dot is a badge, never a count, and it
  // reflects live unread state, from `/api/notifications`'s own unreadCount.
  const {
    notes,
    unreadCount,
    failed: notesFailed,
    markAllRead,
    markRead,
    archive: archiveNote,
    undoArchive,
    lastArchived,
    loading: notesLoading,
    refresh: refreshNotes,
  } = useTeacherNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  /*
   * UNTIL HYDRATION, NOBODY. `useHasSession`'s server snapshot is false, so
   * the server markup and the first client frame of a signed-in teacher drew
   * the fixture persona, "Ms. Adeyemi" and "MA", and lit the unread dot off
   * the fixture notifications. The admin rail fixed the same thing on 16 Sep;
   * this is its sibling. Before the client can answer, the rail claims
   * nothing: a neutral disc, no name, no dot.
   */
  const hydrated = useHydrated();
  const hasNotifications = hydrated && unreadCount > 0;
  // Desktop opens expanded, tablet collapsed (frame: tablet variants are
  // `collapsed`); the breakpoint re-asserts the default, the chevron is free.
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  // Signed in, so the fixture persona is not who this is.
  const signedIn = useHasSession();
  const identity = useCurrentUser();
  /** The designed walkthrough's persona - only once we know nobody is here. */
  const showingFixtureIdentity = hydrated && !signedIn;
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const sync = () => setExpanded(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const collapsed = !expanded;

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden border-r border-nevo-near-black/6 bg-nevo-cream-elevated py-6 transition-[width] duration-200 ease-in-out",
        collapsed ? "w-16 px-3" : "w-60 px-4",
      )}
    >
      {/* Logo - wordmark crop expanded, icon crop collapsed (padded 1080² files) */}
      <div
        className={cn(
          "flex items-center",
          expanded ? "px-2" : "justify-center",
        )}
      >
        {expanded ? (
          <span className="relative block h-[17px] w-[58px] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo-wordmark-purple.png"
              alt="Nevo"
              className="absolute block h-[169px] w-[169px] max-w-none -translate-x-[61px] -translate-y-[81px]"
            />
          </span>
        ) : (
          <span className="relative block size-[22px] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo-icon-purple.png"
              alt="Nevo"
              className="absolute block h-[86px] w-[86px] max-w-none -translate-x-[32px] -translate-y-[35px]"
            />
          </span>
        )}
      </div>

      {/* Tabs */}
      <nav className="mt-8 flex flex-1 flex-col gap-1">
        {TEACHER_NAV.map((item) => {
          const on = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              title={item.name}
              aria-current={on ? "page" : undefined}
              className={cn(
                rowClass(expanded),
                on ? "bg-nevo-navy/8" : "hover:bg-nevo-navy/5",
              )}
            >
              {on && (
                <span className="absolute inset-y-[9px] left-0 w-[3px] rounded-full bg-nevo-violet" />
              )}
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-[10px]",
                  on
                    ? "bg-nevo-navy text-nevo-cream"
                    : "text-nevo-near-black/72",
                )}
              >
                {ICONS[item.name]}
              </span>
              {expanded && (
                <span
                  className={cn(
                    "text-[15px] tracking-[-0.005em]",
                    on
                      ? "font-semibold text-nevo-near-black"
                      : "font-medium text-nevo-near-black/78",
                  )}
                >
                  {item.name}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Notifications - opens the C13 popover */}
      <button
        type="button"
        title="Notifications"
        aria-haspopup="dialog"
        aria-expanded={notifOpen}
        onClick={() => {
          // Opening the bell is asking "what's new" - so it reads again.
          if (!notifOpen) refreshNotes();
          setNotifOpen((v) => !v);
        }}
        className={cn(
          rowClass(expanded),
          "cursor-pointer hover:bg-nevo-navy/5",
          notifOpen && "bg-nevo-navy/5",
        )}
      >
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-[10px] text-nevo-near-black/72">
          {BELL_ICON}
          {hasNotifications && (
            <span
              className={cn(
                "absolute top-[9px] size-2 rounded-full border-2 border-nevo-cream-elevated bg-nevo-violet",
                expanded ? "left-9" : "left-1/2",
              )}
            />
          )}
        </span>
        {expanded && (
          <span className="text-[15px] font-medium text-nevo-near-black/78">
            Notifications
          </span>
        )}
      </button>

      {feedbackOpen && <FeedbackPanel onClose={() => setFeedbackOpen(false)} />}

      {signOutOpen && <SignOutModal onStay={() => setSignOutOpen(false)} />}

      {notifOpen && (
        <NotificationsPanel
          notes={notes}
          failed={notesFailed}
          loading={notesLoading}
          onRetry={refreshNotes}
          onMarkAllRead={markAllRead}
          onOpen={markRead}
          onArchive={archiveNote}
          onUndoArchive={undoArchive}
          lastArchived={lastArchived}
          onClose={() => setNotifOpen(false)}
        />
      )}

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        className={cn(rowClass(expanded), "hover:bg-nevo-navy/6")}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-nevo-near-black/55">
          <svg {...STROKE} strokeWidth={2} aria-hidden>
            {expanded ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
          </svg>
        </span>
        {expanded && (
          <span className="text-[15px] font-medium text-nevo-near-black/68">
            Collapse
          </span>
        )}
      </button>

      <div className="mx-1 mt-2.5 h-px shrink-0 bg-nevo-near-black/8" />

      {/* Teacher identity - opens the avatar menu (C11) */}
      <div className="relative mt-2.5 shrink-0">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Account menu"
          onClick={() => setMenuOpen((v) => !v)}
          className={cn(
            "flex w-full cursor-pointer items-center gap-3 rounded-[10px] py-2 transition-colors duration-[130ms] hover:bg-nevo-navy/5",
            expanded ? "px-2.5" : "justify-center px-0",
            menuOpen && "bg-nevo-navy/5",
          )}
        >
          <MaybeSample
            showing={showingFixtureIdentity}
            kind="teacher:sidebar-identity"
          >
          <AvatarDisc
            photoUrl={signedIn ? identity?.photoUrl : null}
            className="size-9 text-[13px] font-semibold tracking-[0.02em]"
          >
            {signedIn && identity?.initials ? (
              identity.initials
            ) : !showingFixtureIdentity ? (
              // No name means no initials; a neutral glyph beats a blank disc.
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20a8 8 0 0 1 16 0" />
              </svg>
            ) : (
              MOCK_TEACHER.initials
            )}
          </AvatarDisc>
          {expanded && (
            <span className="flex min-w-0 flex-col text-left">
              {(showingFixtureIdentity || (signedIn && identity?.name)) && (
                <span className="truncate text-sm font-semibold text-nevo-near-black">
                  {signedIn ? identity?.name : MOCK_TEACHER.name}
                </span>
              )}
              {/*
                THE REAL ROLE, or nothing.
                
                This read `MOCK_TEACHER.role` unconditionally - the only
                ungated use of that fixture in the repo - while the initials
                and the name immediately above it were both correctly gated on
                `signedIn`. It went unnoticed because the literal "Teacher" is
                accidentally right for everyone who can reach this console:
                `proxy.ts` admits only `teacher`. Accidentally correct is still
                not read from the session.
                
                `roleLabel` returns null for a role it does not recognise, so an
                unfamiliar value shows nothing rather than a guess.
              */}
              {(signedIn
                ? roleLabel(identity?.role)
                : showingFixtureIdentity && MOCK_TEACHER.role) && (
                <span
                  className={
                    signedIn && !identity?.name
                      ? "text-sm font-semibold whitespace-nowrap text-nevo-near-black"
                      : "text-xs whitespace-nowrap text-nevo-near-black/55"
                  }
                >
                  {signedIn ? roleLabel(identity?.role) : MOCK_TEACHER.role}
                </span>
              )}
            </span>
          )}
          </MaybeSample>
        </button>

        {menuOpen && (
          <>
            <div
              aria-hidden
              className="fixed inset-0 z-30"
              onClick={() => setMenuOpen(false)}
            />
            <div
              role="menu"
              className="absolute bottom-[calc(100%+8px)] left-0 z-40 w-[232px] rounded-[12px] bg-nevo-cream p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.16)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150"
            >
              {ACCOUNT_MENU.map((m) => {
                const body = (
                  <>
                    <span className="shrink-0 text-nevo-near-black/70">
                      {m.icon}
                    </span>
                    <span className="text-sm text-nevo-near-black/80">
                      {m.label}
                    </span>
                  </>
                );
                const rowCls = cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-[9px] px-3 py-[11px] text-left transition-colors hover:bg-nevo-navy/8",
                  m.divider &&
                    "mt-1 border-t border-nevo-near-black/8 pt-[13px]",
                );
                return m.href ? (
                  <Link
                    key={m.label}
                    role="menuitem"
                    href={m.href}
                    onClick={() => setMenuOpen(false)}
                    className={rowCls}
                  >
                    {body}
                  </Link>
                ) : (
                  <button
                    key={m.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      if (m.opens === "feedback") setFeedbackOpen(true);
                      if (m.opens === "signout") setSignOutOpen(true);
                    }}
                    className={rowCls}
                  >
                    {body}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
