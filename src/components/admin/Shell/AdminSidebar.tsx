"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePermissions } from "@/hooks/usePermissions";
import { notificationsApi } from "@/lib/api/notifications";
import { cn } from "@/lib/utils";
import { NotificationsPanel } from "../Notifications/NotificationsPanel";
import { READ_STATE_EVENT, unreadFrom } from "../Notifications/readState";
import { AdminSignOutModal } from "./AdminSignOutModal";
import { activeNavLabel, navForScopes, scopeSummary } from "./adminNav";
import { SampleRegion } from "@/components/shared/SampleRegion";

/**
 * School Admin rail (`Nevo Admin Sidebar`) - imported by every admin screen,
 * never a screen itself. 248px expanded, 64px collapsed, with the group
 * headings giving way to hairline dividers on the way down.
 *
 * The nav is scope-filtered (Product Arch D.3): an admin sees the sections
 * their scopes actually grant, which is why a bursar's rail is four rows and a
 * proprietor's is eleven. Scopes come from `permissions/me` through the
 * provider the admin layout already mounts.
 *
 * IDENTITY IS THE ADMIN'S OWN NAME. The session carries only a `userId` and
 * a role, so the name comes from `GET /api/v1/users/me` (`useCurrentUser`) - never
 * the frame's fixture persona. It once said "TODO(api): a profile endpoint"
 * after that endpoint had shipped.
 *
 * THE NOTIFICATIONS INDICATOR IS A DOT, NEVER A COUNT. SCRUM-100's first rule,
 * and its "done when" goes further: no count is rendered OR EVEN FETCHED. So
 * this asks `/notifications/unread-exists` for a boolean rather than
 * `/unread-count` for a number - the surface cannot render what it never has.
 * One indicator, one place: no dot on the avatar, none on Overview, and no
 * browser-tab title change.
 */

const GLYPH = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS: Record<string, React.ReactNode> = {
  Overview: (
    <svg {...GLYPH} strokeWidth={1.9} aria-hidden>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  ),
  Classes: (
    <svg {...GLYPH} aria-hidden>
      <rect x="3" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="14" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="3" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="14" y="13.5" width="7" height="7" rx="1.6" />
    </svg>
  ),
  Teachers: (
    <svg {...GLYPH} aria-hidden>
      <circle cx="9.5" cy="8" r="3.2" />
      <path d="M3.5 20a6 6 0 0 1 12 0" />
      <path d="M16 10.5l1.8 1.8L21.5 8.5" />
    </svg>
  ),
  Students: (
    <svg {...GLYPH} aria-hidden>
      <path d="M22 9.5L12 5 2 9.5l10 4.5 10-4.5z" />
      <path d="M6 11.6V16c0 1.2 2.7 3 6 3s6-1.8 6-3v-4.4" />
    </svg>
  ),
  Invitations: (
    <svg {...GLYPH} aria-hidden>
      <path d="M22 12V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9" />
      <path d="M22 7l-10 6L2 7" />
      <path d="M19 16v6M16 19h6" />
    </svg>
  ),
  "Learning Support": (
    <svg {...GLYPH} aria-hidden>
      <path d="M12 20s-6.5-4.2-9-8A4.7 4.7 0 0 1 12 6.3 4.7 4.7 0 0 1 21 12c-2.5 3.8-9 8-9 8z" />
    </svg>
  ),
  Reports: (
    <svg {...GLYPH} aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  ),
  "Admin Team": (
    <svg {...GLYPH} aria-hidden>
      <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  Billing: (
    <svg {...GLYPH} aria-hidden>
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" />
      <path d="M2.5 9.5h19" />
      <path d="M6 14.5h4" />
    </svg>
  ),
  "IT & SSO": (
    <svg {...GLYPH} aria-hidden>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2L19 4" />
      <path d="M16 5l3 3" />
      <path d="M14 7l2.4 2.4" />
    </svg>
  ),
  Settings: (
    <svg {...GLYPH} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a1.7 1.7 0 0 0 .34 1.87l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-2.87 1.2V19a2 2 0 1 1-4 0v-.06a1.7 1.7 0 0 0-2.87-1.2l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.6 13a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.14-2.87l-.05-.05A2 2 0 1 1 8.52 3.3l.05.05A1.7 1.7 0 0 0 11 4.6a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.87 1.14l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05A1.7 1.7 0 0 0 19.4 11z" />
    </svg>
  ),
};

/** 38px square, navy-filled when the row is the current one. */
function IconWrap({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex size-[38px] shrink-0 items-center justify-center rounded-[10px]",
        on ? "bg-nevo-navy text-nevo-cream" : "text-nevo-near-black/70",
      )}
    >
      {children}
    </span>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const { scopes, resolved, status, refresh } = usePermissions();
  const identity = useCurrentUser();
  const signedIn = useHasSession();
  /*
   * `useHasSession` is the SERVER's answer until hydration, and its server
   * snapshot is hardcoded false - so gating the fixture persona on it alone
   * put "Mrs. Adebayo" in the server markup and the first client frame of a
   * genuinely signed-in admin. Every student surface added this guard for the
   * same reason; this rail had not.
   */
  const hydrated = useHydrated();
  const showingFixtureIdentity = hydrated && !signedIn;
  /*
   * Desktop opens expanded, tablet collapsed - which `AdminShell`'s docblock
   * has claimed since it was written ("tablet 1024x768 with the rail
   * collapsed") while nothing implemented it. Every admin frame is drawn at
   * 1024 with a 64px rail, so the content columns were laid out against 960px
   * and got 776px.
   *
   * The breakpoint re-asserts the DEFAULT; the chevron stays free, so an admin
   * who collapses it on a wide screen keeps their choice until the viewport
   * itself changes. Same rule, same breakpoint and same mechanism as the
   * teacher rail - a second behaviour here would be a second thing to learn.
   */
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const sync = () => setExpanded(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  /** A boolean, read whatever the body's key - see `unreadFrom`. */
  const refreshUnread = useCallback(() => {
    if (!signedIn) return;
    notificationsApi
      .unreadExists()
      .then((res) => setHasUnread(unreadFrom(res)))
      .catch(() => setHasUnread(false));
  }, [signedIn]);

  /*
   * Re-read on every navigation, and whenever another surface changes what
   * is read. It read ONCE, when the session began: a notification arriving
   * during a session never lit the dot, and reading on the full page never
   * cleared it.
   */
  useEffect(() => {
    refreshUnread();
  }, [refreshUnread, pathname]);

  useEffect(() => {
    window.addEventListener(READ_STATE_EVENT, refreshUnread);
    return () => window.removeEventListener(READ_STATE_EVENT, refreshUnread);
  }, [refreshUnread]);

  const active = activeNavLabel(pathname);
  // Until scopes land there is nothing truthful to filter by, so the rail
  // shows its chrome and no rows rather than a nav that rearranges itself
  // under the reader a moment later.
  const items = resolved ? navForScopes(scopes) : [];
  // A failed read is not an answer about this admin's access, so the footer
  // offers a retry instead of `scopeSummary`'s "No access yet" - which was a
  // claim about them produced by a broken GET.
  const scopesFailed = status === "failed";

  return (
    <aside
      aria-label="Admin"
      className={cn(
        /*
         * THE LIST SCROLLS, NOT THE RAIL - which is the frame's split and was
         * the wrong way round. With `overflow-y-auto` on the aside, a rail
         * shorter than its contents scrolled as a whole, so at 1024x768 the
         * Notifications row, the Collapse chevron and the account and sign-out
         * block all fell below the fold: every persistent control in the
         * console, reachable only by scrolling a sidebar nobody expects to
         * scroll. The nav below owns the overflow instead.
         */
        "flex h-full shrink-0 flex-col overflow-hidden border-r border-nevo-near-black/6 bg-nevo-cream-elevated py-[22px] transition-[width] duration-200 ease-in-out",
        expanded ? "w-[248px] px-3.5" : "w-16 px-3",
      )}
    >
      {/*
        * THE RAIL HAD NO LOGO AT ALL. The sidebar frame draws one at the top -
        * the wordmark when expanded, the icon when collapsed - and neither
        * this file nor `AdminShell` rendered any mark, so the admin console
        * was the one surface carrying no Nevo branding.
        *
        * Both files are the real 1080-square brand assets cropped by the same
        * offsets the frame uses and the teacher rail already uses. Never draw
        * a substitute mark.
        */}
      <div
        className={cn(
          "flex shrink-0 items-center",
          expanded ? "px-2" : "justify-center",
        )}
      >
        {expanded ? (
          <span className="flex items-center gap-2">
            <span className="relative block h-[17px] w-[58px] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/logo-wordmark-purple.png"
                alt="Nevo"
                className="absolute block h-[169px] w-[169px] max-w-none -translate-x-[61px] -translate-y-[81px]"
              />
            </span>
            {/* The frame's badge, which says which console this is. Three
                consoles share one wordmark and only this one is drawn with
                it; without the badge an admin and a teacher see the same
                mark over different products. */}
            <span className="rounded-[5px] bg-nevo-navy/10 px-[7px] py-[3px] text-[10.5px] font-semibold tracking-[0.04em] text-nevo-navy uppercase">
              Admin
            </span>
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

      <nav className="mt-7 flex min-h-0 flex-1 flex-col overflow-y-auto">
        {items.map((item, i) => {
          const on = item.label === active;
          const startsGroup = i > 0 && item.group !== items[i - 1].group;
          return (
            <div key={item.label} className="contents">
              {startsGroup &&
                (expanded ? (
                  <span className="shrink-0 px-3 pt-3.5 pb-[5px] text-[10.5px] font-semibold tracking-[0.08em] text-nevo-near-black/40 uppercase">
                    {item.group}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="mx-2 my-2 h-px shrink-0 bg-nevo-near-black/9"
                  />
                ))}
              <Link
                href={item.href}
                aria-current={on ? "page" : undefined}
                title={expanded ? undefined : item.label}
                className={cn(
                  "relative flex h-11 shrink-0 cursor-pointer items-center gap-[13px] rounded-[10px] transition-colors duration-[130ms] ease-out",
                  expanded ? "px-3" : "justify-center",
                  on ? "bg-nevo-navy/8" : "hover:bg-nevo-navy/5",
                )}
              >
                {on && (
                  <span
                    aria-hidden
                    className="absolute top-[9px] bottom-[9px] left-0 w-[3px] rounded-full bg-nevo-violet"
                  />
                )}
                <IconWrap on={on}>{ICONS[item.label]}</IconWrap>
                {expanded && (
                  <span
                    className={cn(
                      "text-[14.5px] tracking-[-0.005em] whitespace-nowrap",
                      on
                        ? "font-semibold text-nevo-near-black"
                        : "font-medium text-nevo-near-black/76",
                    )}
                  >
                    {item.label}
                  </span>
                )}
              </Link>
            </div>
          );
        })}
      </nav>

      <button
        type="button"
        data-notification-toggle
        aria-label="Notifications"
        aria-expanded={panelOpen}
        title={expanded ? undefined : "Notifications"}
        onClick={() => setPanelOpen((v) => !v)}
        className={cn(
          "relative mt-2 flex h-11 shrink-0 cursor-pointer items-center gap-[13px] rounded-[10px] transition-colors duration-[130ms] ease-out hover:bg-nevo-navy/5",
          expanded ? "px-3" : "justify-center",
          // Active and has-notifications are independent: a row can be both.
          // Active on the full page too, like every other row on its route.
          (panelOpen || pathname.startsWith("/admin/notifications")) && "bg-nevo-navy/[0.08]",
        )}
      >
        <span className="relative flex size-[38px] shrink-0 items-center justify-center rounded-[10px] text-nevo-near-black/70">
          <svg {...GLYPH} strokeWidth={1.9} aria-hidden>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {/* Collapsed rail: the dot sits on the glyph's top-right corner,
              offset so it never overlaps it. */}
          {hasUnread && !expanded ? (
            <span
              aria-hidden
              className="absolute right-1 top-1 size-[7px] rounded-full bg-nevo-violet"
            />
          ) : null}
        </span>
        {expanded && (
          <span className="text-[14.5px] font-medium text-nevo-near-black/76">
            Notifications
          </span>
        )}
        {/* Expanded: a 7px dot at the right end of the row. No number, no
            ring, no animation on arrival - appearing silently is the point. */}
        {hasUnread && expanded ? (
          <span
            aria-hidden
            className="ml-auto mr-1 size-[7px] rounded-full bg-nevo-violet"
          />
        ) : null}
      </button>

      {panelOpen ? (
        <NotificationsPanel
          onClose={() => setPanelOpen(false)}
          onReadStateChanged={refreshUnread}
        />
      ) : null}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        aria-expanded={expanded}
        className={cn(
          "flex h-11 shrink-0 cursor-pointer items-center gap-[13px] rounded-[10px] transition-colors duration-[130ms] ease-out hover:bg-nevo-navy/5",
          expanded ? "px-3" : "justify-center",
        )}
      >
        <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] text-nevo-near-black/50">
          <svg {...GLYPH} strokeWidth={2} aria-hidden>
            <path d={expanded ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
          </svg>
        </span>
        {expanded && (
          <span className="text-[14.5px] font-medium text-nevo-near-black/66">
            Collapse
          </span>
        )}
      </button>

      {/* The identity block is the sign-out control (SCRUM-39 places it in the
          sidebar footer). It was a plain div, which is why the admin console
          shipped with no way to end a session at all - see AdminSignOutModal.
          Collapsed it is just the avatar, so the accessible name carries the
          action rather than relying on the hidden label. */}
      <button
        type="button"
        onClick={() => setSignOutOpen(true)}
        aria-label="Account and sign out"
        className={cn(
          "mt-1 flex w-full shrink-0 cursor-pointer items-center gap-[13px] rounded-[10px]",
          "border-t border-nevo-near-black/8 pt-3.5 pb-1 text-left transition-colors",
          "hover:bg-nevo-navy/6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nevo-navy",
          expanded ? "px-3" : "justify-center",
        )}
      >
        {/*
          * THE WHOLE FIXTURE IDENTITY IS INSIDE THE MARK NOW, INCLUDING THE
          * DISC. It used to wrap the name block alone, and that block only
          * renders when `expanded` - so on a collapsed rail the entire
          * invented identity a viewer met was the bare initials "AA", outside
          * the mark and invisible to the E2E's `[data-nevo-sample]` count.
          * The rail collapses below 1280px and EVERY admin frame is drawn at
          * 1024, so the unmarked half was the half the console actually
          * shipped.
          *
          * It is also gated on `hydrated` now, like every student surface.
          * `useHasSession` returns its server snapshot - false - through SSR
          * and the hydration render, so a genuinely signed-in admin's first
          * frame rendered "Mrs. Adebayo - Proprietor" before settling. Until
          * the client can answer, this shows neutral chrome and claims
          * nothing: no name, no initials, no invented person.
          */}
        {showingFixtureIdentity ? (
          <SampleRegion kind="admin:sidebar-identity">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-nevo-navy text-[13px] font-semibold text-nevo-cream">
              AA
            </span>
            {expanded ? (
              <span className="flex min-w-0 flex-col text-left">
                <span className="truncate text-sm font-semibold text-nevo-near-black">
                  Mrs. Adebayo
                </span>
                <span className="truncate text-xs text-nevo-near-black/55">
                  Proprietor &middot; General oversight
                </span>
              </span>
            ) : null}
          </SampleRegion>
        ) : (
          <>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-nevo-navy text-[13px] font-semibold text-nevo-cream">
              {identity?.initials ? (
                identity.initials
              ) : (
                // No name means no initials; a neutral glyph beats a blank
                // disc. This is also the pre-hydration state, which is the
                // point: neutral rather than invented.
                <svg {...GLYPH} width={17} height={17} strokeWidth={1.9} aria-hidden>
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20a8 8 0 0 1 16 0" />
                </svg>
              )}
            </span>
            {expanded ? (
              /*
                * THE ADMIN'S OWN NAME, WHICH THIS BLOCK NEVER SHOWED.
                *
                * It rendered a generic person glyph over a scope summary, so the
                * one place in the console that says who you are said only what
                * you may do - while the teacher console, using the same hook,
                * has shown a name and initials since 1 Sep. The justification
                * recorded in this file for not doing it had already been
                * corrected elsewhere and was out of date.
                *
                * The scope line stays underneath: it is the second thing an
                * admin checks here, not the first, and it is what distinguishes
                * two admins at the same school.
                */
              <span className="flex min-w-0 flex-col text-left">
                {identity?.name ? (
                  <span className="truncate text-sm font-semibold text-nevo-near-black">
                    {identity.name}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "truncate",
                    identity?.name
                      ? "text-xs text-nevo-near-black/55"
                      : "text-sm font-semibold text-nevo-near-black",
                  )}
                >
                  {scopesFailed ? "Couldn't load your access" : scopeSummary(scopes)}
                </span>
              </span>
            ) : null}
          </>
        )}
      </button>

      {signedIn && scopesFailed && expanded && (
        /* A sibling of the account button, never a child of it: nesting a
           control inside a <button> is invalid and screen readers do not
           expose the inner one. */
        <button
          type="button"
          onClick={refresh}
          className={cn(
            "mx-3 mt-1 shrink-0 cursor-pointer rounded-[8px] px-2 py-1 text-left",
            "text-xs font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nevo-navy",
          )}
        >
          Try loading your access again
        </button>
      )}

      {signOutOpen && <AdminSignOutModal onStay={() => setSignOutOpen(false)} />}
    </aside>
  );
}
