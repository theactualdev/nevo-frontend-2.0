"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BottomNav, Sidebar } from "@/components/shared";
import { MaybeSample } from "@/components/shared/SampleRegion";
import { AskNevo } from "@/components/student/AskNevo/AskNevo";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./NotificationBell";
import { isLessonRoute } from "./lessonRoutes";
import { useOnline } from "./TabOfflineBanner";
import { OfflineNotice } from "./OfflineScreen";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { useSessionLapse } from "@/hooks/useSessionLapse";
import { useSessionRefresh } from "@/hooks/useSessionRefresh";
import { flushPendingProgress } from "@/lib/lessons/pendingProgress";
import { flushPendingBaseline } from "@/lib/profiling/pendingBaseline";
import { arrivedWithoutSession, getSession } from "@/lib/auth/session";
import { doorAfterLostSession } from "./lostSession";
import { MOCK_STUDENT, STUDENT_NAV, STUDENT_PROFILE_HREF } from "./studentNav";
import { useAvatarTone } from "./useAvatarTone";
import { useDisplayName } from "./useDisplayName";

/**
 * Student App shell (Product Arch B.5). Wraps the daily-experience tabs in the
 * left `Sidebar` (tablet/desktop) or `BottomNav` (mobile). Full-screen flows —
 * onboarding and the immersive Lesson Player — render bare, with no chrome
 * ("no in-lesson sidebar").
 *
 * ASK NEVO IS NOT CHROME, and on the player it is not the shell's at all.
 * Frame 26 governs it: "always reachable, never interruptive". The shell
 * mounts it below, on every in-shell screen but Profile - the lesson's
 * `/summary` and `/review` included. On the player the lesson layout renders
 * it instead (`LessonAskNevo`), inside the `LessonProvider` so a question
 * carries its lesson, and only on the completion screen - IA 31 keeps it off
 * the player while it is teaching.
 *
 * NOT on the other full-screen routes, and each for its own reason. The daily
 * warm-up is a calibrated baseline activity - offering help inside it would
 * contaminate what it measures. Onboarding has no lesson to ask about and no
 * session to ask with. Feedback and Change PIN are utility screens with their
 * own way back.
 *
 * The shell is a fixed-height viewport frame: the sidebar/nav stay put while only
 * the content region scrolls.
 */
export function StudentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  /*
   * NO TAP OR KEYSTROKE IS LOGGED ON THE DEVICE ANY MORE. Every pointerdown
   * and keydown on every screen went to IndexedDB for a local affective
   * reader that does not exist and may not: the frontend infers no state
   * (frontend §6). Whatever an earlier build left is purged at sign-in and
   * sign-out - see `ephemeralStore`.
   */
  // Renews the session before it expires. Mounted here rather than on a tab,
  // so it covers the full-screen routes below too - a child mid-lesson is the
  // case that matters, and the one the old behaviour handled worst.
  useSessionRefresh();
  // And when that fails - offline, refused, a bad hour at the backend - say so.
  // Expiry clears the session in place, after which `report()` drops every
  // position the child reaches and no request is made to 401, so nothing else
  // in the app would ever mention it. The route guard only runs on navigation,
  // and a child reading one segment does not navigate.
  useSessionLapse();
  /*
   * And when this page arrived on a role cookie with no session behind it -
   * a token write that failed, storage cleared without its cookies - take the
   * child to the door rather than leave them in the walkthrough the server
   * already sent. `getSession` has dropped the cookie by now, so the door
   * lets them in. Once per load; the cookie is gone after the first look.
   */
  const router = useRouter();
  useEffect(() => {
    if (!arrivedWithoutSession()) return;
    const door = doorAfterLostSession(pathname);
    if (door) router.replace(door);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /*
   * Deliver anything a lesson could not save before it was closed.
   *
   * Here rather than only in the player, because a child who gave up on a
   * lesson while offline may never open that lesson again - and their position
   * still belongs in Home's "Pick up where you left off" list. Any student
   * screen is enough.
   */
  useEffect(() => {
    void flushPendingProgress();
    /*
     * And anything the daily warm-up could not save.
     *
     * `WarmUpRun` parks a refused vector and its comment claimed this was
     * "already called on every student screen". It was not: the only callers
     * were the two inside onboarding, which a returning child never runs
     * again. So a warm-up a child sat on a bad connection had no delivery path
     * at all, and the seven-day expiry - which only runs when the record is
     * read - never ran either. A named child's cognitive measurements sat on
     * the device indefinitely.
     *
     * No run id is passed, so this can only ever deliver a vector that carries
     * its owner. An anonymous onboarding vector is refused here and stays for
     * the run that created it.
     */
    void flushPendingBaseline(getSession()?.userId);
  }, []);
  /*
   * AND WHEN THE CONNECTION COMES BACK, not only on mount. The shell is a
   * layout and stays mounted across every tab, so "mount" meant once per
   * sign-in: a child who finished a lesson offline and was back on Home when
   * the signal returned had their completion sit on the device, and reopening
   * the lesson resumed from the stale place the server still had.
   */
  useEffect(() => {
    const flush = () => void flushPendingProgress();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);
  // The chrome calls the student by their own name, not the fixture's.
  const student = useDisplayName();
  // The look the child chose on Profile; the navy disc until they choose.
  const { tone } = useAvatarTone();
  const signedIn = useHasSession();
  // `useHasSession` is the server's answer until hydration, so gating on it
  // alone showed a real child the fixture's "Year 4" for a frame. Same reason
  // `useDisplayName` waits - nobody is described until we know who is looking.
  const hydrated = useHydrated();
  const online = useOnline();
  /*
   * Is the chrome showing the FIXTURE's identity rather than this child's?
   *
   * `useDisplayName` falls back to `MOCK_STUDENT` only once it can tell a
   * signed-out visitor from a signed-in child, and the sidebar's subtitle is
   * gated on the same thing - so today a signed-in child never sees "Ada" or
   * "Year 4". That gating is the whole defence, and nothing was checking it.
   *
   * The mark makes it checkable. The end-to-end test signs in and asserts no
   * sample region is on the page; if this gate ever regresses, the mark appears
   * while signed in and the suite fails. An UNMARKED fallback is invisible to
   * that test, which walks past reporting success while a real child is shown
   * another child's name.
   */
  const showingFixtureIdentity = hydrated && !signedIn;

  // Sidebar defaults collapsed (matches the server render, so no hydration
  // mismatch), then opens on desktop after mount. Tablet stays collapsed for room.
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    // Client-only media read, once on mount — the deliberate way to pick a
    // hydration-safe default (server can't know the viewport width).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(!window.matchMedia("(min-width: 1024px)").matches);
  }, []);

  if (isFullScreen(pathname)) {
    // Text Size is a reading preference, and the player is where the reading
    // happens - it applies there too, not just in the shell. The calibrated
    // activities are deliberately excluded - see `scalesWithTextSize`.
    if (!scalesWithTextSize(pathname)) return <>{children}</>;
    return (
      <div className="nevo-text-zoom">
        {/*
          Ask Nevo is rendered by the LESSON LAYOUT now, not here. As a sibling
          of `children` it sat outside that route's `LessonProvider`, so the
          lesson id it reads resolved to null and every question a child asked
          from inside a lesson arrived unattached to one.
        */}
        {children}
      </div>
    );
  }

  const within = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  // Profile is not a tab; the child's own disc is its way in, and lights up
  // like one while they are there.
  const activeHref = within(STUDENT_PROFILE_HREF)
    ? STUDENT_PROFILE_HREF
    : STUDENT_NAV.find((item) => within(item.href))?.href;

  return (
    <div className="group/shell flex h-[100dvh] bg-nevo-cream text-nevo-near-black">
      {/* Sidebar — tablet & desktop */}
      <div className="hidden shrink-0 md:block">
        <MaybeSample showing={showingFixtureIdentity} kind="student:identity">
          <Sidebar
            items={STUDENT_NAV}
            activeHref={activeHref}
            // A live student's year group has no source (`users/me` carries
            // none), so the fixture's "Year 4" is dropped rather than shown
            // under their real name. Restored when a year group exists.
            user={{
              ...MOCK_STUDENT,
              ...student,
              subtitle: showingFixtureIdentity
                ? MOCK_STUDENT.subtitle
                : undefined,
              tone,
              href: STUDENT_PROFILE_HREF,
            }}
            collapsed={collapsed}
            onToggle={setCollapsed}
          />
        </MaybeSample>
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Board 28: across the top of the tab, never in place of it - or,
            for a child with nothing to continue, the full screen over it (D50). */}
        <OfflineNotice online={online} />

        {/* Top bar — mobile only (logo + avatar) */}
        <header className="flex h-[60px] shrink-0 items-center justify-between px-5 md:hidden">
          <Image
            src="/brand/nevo-wordmark.png"
            alt="Nevo"
            width={344}
            height={116}
            priority
            className="h-[14px] w-auto"
          />
          <div className="flex items-center gap-1">
            <NotificationBell />
            <MaybeSample
              showing={showingFixtureIdentity}
              kind="student:identity"
            >
              {/*
                A LINK, not a decoration. It was an inert `span`: the one
                avatar in the app that looked like every other console's way
                into a profile and did nothing when tapped. On a phone it is
                now the ONLY way into Profile - the frames draw five tabs and
                no Profile among them.
              */}
              <Link
                href={STUDENT_PROFILE_HREF}
                aria-label="Profile"
                style={{ background: tone.background, color: tone.text }}
                className="flex size-10 cursor-pointer items-center justify-center rounded-full text-sm font-semibold transition-[filter] hover:brightness-110"
              >
                {student.initials}
              </Link>
            </MaybeSample>
          </div>
        </header>

        {/* Notifications — tablet/desktop: quiet bell top-right of the content,
            dropped below the offline banner when there is one. */}
        <div
          className={cn(
            "absolute right-5 z-30 hidden md:block",
            online ? "top-4" : "top-[60px]",
          )}
        >
          <NotificationBell />
        </div>

        {/* Only the content region scrolls; the sidebar/nav stay fixed.
            The Text Size preference zooms it through `.nevo-text-zoom`, which
            the root attribute drives from before the first paint. */}
        <main
          // The bottom padding clears the Ask Nevo trigger, which is `fixed`
          // and so lands ON this scrolling region rather than below it. #313
          // did this for the lesson player; these are the five tabs, where the
          // same trigger has sat over the bottom-right of the content since it
          // was built.
          //
          // Mobile: the nav below is py-1.5 + size-10 + gap-1.5 + a 3px
          // indicator = 61px, plus its wrapper's pb-3 = 73px. The trigger is
          // `bottom-[82px]` and 52px tall, so it occupies 82-134px off the
          // viewport - intruding 61px into this region. Desktop has no nav, so
          // this region reaches the viewport floor and the 44px pill at
          // `bottom-6` intrudes 68px. A few px of margin on each.
          className="nevo-text-zoom min-h-0 flex-1 overflow-y-auto pb-[68px] md:pb-[76px]"
        >
          {/*
            THE TAB STAYS IN FRONT OF THE CHILD OFFLINE. It was first
            unmounted, then hidden, behind a full-screen takeover - and either
            way a child part-way through a message to their teacher could not
            see it. The banner above is the whole of the offline state now.
          */}
          <div>{children}</div>
        </main>

        {/* Bottom nav — mobile only. Down while a tab's on-screen keyboard is
            docked (`data-nevo-hide-nav`, e.g. a Connect conversation), as the
            frames draw it; that keyboard only shows without a fine pointer. */}
        <div className="shrink-0 px-3 pb-3 md:hidden not-pointer-fine:group-has-[[data-nevo-hide-nav]]/shell:hidden">
          <BottomNav items={STUDENT_NAV} activeHref={activeHref} />
        </div>
      </div>

      {/* Ask Nevo (26) — always reachable from the tabs, never interruptive. */}
      {/* Except Profile: the app shell frame mounts the launcher on every tab
          `&& v !== "profile"`, a deliberate exclusion rather than an omission. */}
      {pathname !== PROFILE_HREF && <AskNevo />}
    </div>
  );
}

/** The one tab the app shell frame draws without the Ask Nevo launcher. */
const PROFILE_HREF = "/student/profile";

/**
 * The immersive player, and the review session that reuses it wholesale (37d).
 *
 * Only the BARE lesson route and `/review-session` are the player; the other
 * sub-routes (`/summary`, `/review`) are ordinary in-shell screens and keep
 * the sidebar/nav.
 */
const isLesson = isLessonRoute;

/**
 * The consent hold (00d). Its other door, 05 Entry, is under onboarding and
 * full-screen already.
 *
 * A HOLD IS NOT A TAB. These rendered inside the full app chrome, so a child
 * the server said may not proceed was shown the navigation, the bell and Ask
 * Nevo around the very screen telling them to wait - and could tap straight
 * past it, and ask Ask Nevo a question, before anyone had consented. The frame
 * draws the hold bare. So it is full-screen.
 */
function isHoldRoute(pathname: string): boolean {
  return pathname === "/student/waiting";
}

/**
 * Whether the child's Text Size zoom applies to a full-screen route.
 *
 * NOT ON THE CALIBRATED ACTIVITIES. The baseline in onboarding was always
 * exempt, because its tasks are sized and timed to measure and scaling them
 * distorts what they measure. The daily warm-up runs the same tasks and was
 * not exempt - so tile and dot sizes changed with a reading preference, and a
 * child's warm-up measured differently from their own baseline.
 */
export function scalesWithTextSize(pathname: string): boolean {
  if (pathname.startsWith("/student/onboarding")) return false;
  if (pathname === "/student/warm-up") return false;
  return true;
}

/**
 * The routes that run without chrome: onboarding, the consent hold, the
 * lesson player, Feedback and Change PIN, and the daily warm-up.
 */
function isFullScreen(pathname: string): boolean {
  if (pathname.startsWith("/student/onboarding")) return true;
  if (isHoldRoute(pathname)) return true;
  if (isLesson(pathname)) return true;
  // Feedback + Change PIN are full-screen views with their own back chevron
  // (Nevo Student App: `feedback` / `changepin`).
  if (pathname === "/student/profile/feedback") return true;
  if (pathname === "/student/profile/pin") return true;
  // The daily warm-up run (SCRUM-104) has its own quiet header, no nav.
  if (pathname === "/student/warm-up") return true;
  return false;
}
