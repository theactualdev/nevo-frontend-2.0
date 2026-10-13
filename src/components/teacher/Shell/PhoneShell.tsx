"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AvatarDisc } from "@/components/shared/AvatarDisc";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { SignOutModal } from "@/components/teacher/Profile/SignOutModal";
import { cn } from "@/lib/utils";
import { MOCK_TEACHER, TEACHER_NAV } from "./teacherNav";
import { OPEN_ASK_NEVO, ownsPhoneBar, phoneTitle } from "./phoneLayouts";
import { useLeaveGuard } from "./UnsavedChanges";

/**
 * C19's console shell on a phone (design, 12 Oct): an app bar with the menu
 * and the page's name, the sidebar as a drawer (C1), and Ask Nevo opened from
 * the drawer as a full sheet (C2). Shown below 768 only - the rail is the
 * shell at every other width.
 */

const MENU_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

/*
 * A SCREEN THAT DRAWS ITS OWN PHONE BAR ONLY SOMETIMES. Most do or do not by
 * route (`ownsPhoneBar`); Connect does only while a thread is open (B4), and
 * the thread is in the query, which the shell does not read. So the page says
 * so, and the shell's bar stands aside.
 */
const PageOwnsBar = createContext(false);
const SetPageOwnsBar = createContext<(owned: boolean) => void>(() => {});

export function PhoneBarProvider({ children }: { children: ReactNode }) {
  const [owned, setOwned] = useState(false);
  return (
    <SetPageOwnsBar.Provider value={setOwned}>
      <PageOwnsBar.Provider value={owned}>{children}</PageOwnsBar.Provider>
    </SetPageOwnsBar.Provider>
  );
}

/** For the page: "I am drawing the phone bar myself" while `owned`. */
export function usePhoneOwnBar(owned: boolean): void {
  const set = useContext(SetPageOwnsBar);
  useEffect(() => {
    set(owned);
    return () => set(false);
  }, [owned, set]);
}

/** Who the shell names: the teacher, the walkthrough's persona, or nobody. */
function usePhoneIdentity() {
  const hydrated = useHydrated();
  const signedIn = useHasSession();
  const identity = useCurrentUser();
  const fixture = hydrated && !signedIn;
  return {
    name: signedIn ? identity?.name : fixture ? MOCK_TEACHER.name : null,
    school: signedIn ? identity?.school : fixture ? MOCK_TEACHER.school : null,
    initials: signedIn ? identity?.initials : fixture ? MOCK_TEACHER.initials : null,
    photoUrl: signedIn ? (identity?.photoUrl ?? null) : null,
  };
}

export function PhoneShell() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const who = usePhoneIdentity();
  const onHome = pathname.startsWith("/teacher/dashboard");

  // A navigation closes the drawer behind it.
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }

  // A screen with its own back bar (C19 B2-B4) draws it in place of this one.
  const pageOwnsBar = useContext(PageOwnsBar);
  if (ownsPhoneBar(pathname) || pageOwnsBar) return null;

  return (
    <div className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-3 md:hidden">
      <button
        type="button"
        aria-label="Open the menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-nevo-navy transition-colors hover:bg-nevo-navy/6"
      >
        {MENU_ICON}
      </button>
      <span className="truncate text-[17px] font-semibold tracking-[-0.01em] text-nevo-near-black">
        {phoneTitle(pathname)}
      </span>
      {/* B1: Home carries the teacher's disc on the right. */}
      {onHome && who.initials && (
        <AvatarDisc
          photoUrl={who.photoUrl}
          className="ml-auto size-[34px] shrink-0 text-[12.5px] font-semibold"
        >
          {who.initials}
        </AvatarDisc>
      )}
      {open && <PhoneDrawer onClose={() => setOpen(false)} who={who} pathname={pathname} />}
    </div>
  );
}

function PhoneDrawer({
  onClose,
  who,
  pathname,
}: {
  onClose: () => void;
  who: ReturnType<typeof usePhoneIdentity>;
  pathname: string;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const leaveGuard = useLeaveGuard();
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, { onEscape: onClose });

  const row = (on: boolean) =>
    cn(
      "flex h-[46px] w-full cursor-pointer items-center gap-3 rounded-[10px] px-3.5 text-left text-[15px] transition-colors",
      on
        ? "bg-nevo-navy/9 font-semibold text-nevo-near-black"
        : "font-medium text-nevo-near-black/72 hover:bg-nevo-navy/5",
    );
  const dot = (on: boolean) =>
    cn("size-2 shrink-0 rounded-full", on ? "bg-nevo-navy" : "bg-nevo-navy/30");

  if (signingOut) return <SignOutModal onStay={onClose} />;

  return (
    <div className="nevo-text-zoom fixed inset-0 z-50 md:hidden">
      <div
        className="absolute inset-0 bg-nevo-near-black/40 backdrop-blur-[1.5px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
        onClick={onClose}
      />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className="absolute inset-y-0 left-0 flex w-[286px] max-w-[85vw] flex-col bg-nevo-cream px-4 py-[22px] shadow-[8px_0_32px_rgba(0,0,0,0.16)] motion-safe:animate-in motion-safe:slide-in-from-left motion-safe:duration-200"
      >
        <div className="flex items-center gap-3 border-b border-nevo-near-black/8 px-1.5 pb-[18px]">
          <AvatarDisc
            photoUrl={who.photoUrl}
            className="size-[42px] shrink-0 text-sm font-semibold"
          >
            {who.initials ?? ""}
          </AvatarDisc>
          <div className="min-w-0">
            {who.name && (
              <span className="block truncate text-[15px] font-semibold text-nevo-near-black">
                {who.name}
              </span>
            )}
            {who.school && (
              <span className="block truncate text-[12.5px] text-nevo-near-black/55">
                {who.school}
              </span>
            )}
          </div>
        </div>

        <nav className="mt-3 flex flex-col gap-[3px]">
          {TEACHER_NAV.map((t) => {
            const on = pathname.startsWith(t.href);
            return (
              <Link
                key={t.name}
                href={t.href}
                aria-current={on ? "page" : undefined}
                onClick={(e) => leaveGuard?.onNavigate(e, t.href)}
                className={row(on)}
              >
                <span className={dot(on)} aria-hidden />
                {t.name}
              </Link>
            );
          })}
          {/* C1 lists Ask Nevo with the tabs: on a phone it is reached from
              here, as C2's full sheet, rather than a floating pill. */}
          <button
            type="button"
            onClick={() => {
              onClose();
              window.dispatchEvent(new Event(OPEN_ASK_NEVO));
            }}
            className={row(false)}
          >
            <span className={dot(false)} aria-hidden />
            Ask Nevo
          </button>
        </nav>

        <div className="flex-1" />

        <div className="flex flex-col gap-[3px] border-t border-nevo-near-black/8 pt-3.5">
          <Link
            href="/teacher/profile"
            onClick={(e) => leaveGuard?.onNavigate(e, "/teacher/profile")}
            className="flex h-[46px] cursor-pointer items-center rounded-[10px] px-3.5 text-[15px] text-nevo-near-black/78 transition-colors hover:bg-nevo-navy/5"
          >
            Settings
          </Link>
          <button
            type="button"
            onClick={() => setSigningOut(true)}
            className="flex h-[46px] cursor-pointer items-center rounded-[10px] px-3.5 text-left text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/5"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * C19 D1, "one drawing stands in for every teacher screen that isn't in this
 * file - never a per-screen variant."
 */
export function BiggerScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-[34px] py-10 text-center md:hidden">
      <span className="flex size-[66px] shrink-0 items-center justify-center rounded-[12px] bg-nevo-cream-elevated text-nevo-navy shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="2" y="4" width="20" height="13" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
      </span>
      <h1 className="mt-6 text-[22px] font-semibold tracking-[-0.015em] text-nevo-near-black">
        This page needs a bigger screen
      </h1>
      <p className="mt-[11px] text-[15px] leading-[1.55] text-nevo-near-black/66">
        Open Nevo on a tablet or computer to use this part of the console.
      </p>
      <Link
        href="/teacher/dashboard"
        className="mt-[26px] inline-flex h-[50px] cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/30 px-[26px] text-[15px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6"
      >
        Back to Home
      </Link>
    </div>
  );
}
