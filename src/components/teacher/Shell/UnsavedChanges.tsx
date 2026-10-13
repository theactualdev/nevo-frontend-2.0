"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import {
  UnsavedRegistryContext,
  type UnsavedAbout,
  type UnsavedRegistry,
} from "@/hooks/useUnsavedGuard";

/**
 * C18 Unsaved Changes (design, 12 Oct): "shown when a teacher clicks away in
 * the sidebar mid-edit. A routine moment, not a warning. Stay on this page is
 * primary; Leave without saving is a real, pressable control - not disabled,
 * not styled as destructive. Nothing red."
 *
 * Every `useUnsavedGuard` inside the shell registers here while it holds, so
 * the sidebar can ask before a client-side navigation throws the work away -
 * the case the browser's own prompt never sees.
 */

interface LeaveGuard {
  /**
   * For a link's click: lets it go when nothing is unsaved, otherwise stops
   * it and asks. Plain clicks only - a modified click opens a new tab and
   * leaves this page's work where it is.
   */
  onNavigate: (e: MouseEvent<HTMLAnchorElement>, href: string) => void;
}

const LeaveGuardContext = createContext<LeaveGuard | null>(null);

/** Null outside the shell: a link there simply goes. */
export function useLeaveGuard(): LeaveGuard | null {
  return useContext(LeaveGuardContext);
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const held = useRef(new Map<string, UnsavedAbout>());
  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  const [about, setAbout] = useState<UnsavedAbout>("edits");

  const registry = useMemo<UnsavedRegistry>(
    () => ({
      register: (id, a) => void held.current.set(id, a),
      unregister: (id) => void held.current.delete(id),
    }),
    [],
  );

  const onNavigate = useCallback((e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (held.current.size === 0) return;
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setAbout([...held.current.values()].includes("lesson") ? "lesson" : "edits");
    setLeavingTo(href);
  }, []);

  const guard = useMemo(() => ({ onNavigate }), [onNavigate]);

  const stay = useCallback(() => setLeavingTo(null), []);
  const leave = useCallback(() => {
    const to = leavingTo;
    setLeavingTo(null);
    if (to) router.push(to);
  }, [leavingTo, router]);

  return (
    <UnsavedRegistryContext.Provider value={registry}>
      <LeaveGuardContext.Provider value={guard}>
        {children}
        {leavingTo && <UnsavedChangesDialog about={about} onStay={stay} onLeave={leave} />}
      </LeaveGuardContext.Provider>
    </UnsavedRegistryContext.Provider>
  );
}

/** C18's sentence, word for word for a lesson; three words shorter otherwise. */
export function unsavedLine(about: UnsavedAbout): string {
  return about === "lesson"
    ? "If you leave this page now, your edits to this lesson won’t be kept."
    : "If you leave this page now, your edits won’t be kept.";
}

export function UnsavedChangesDialog({
  about,
  onStay,
  onLeave,
}: {
  about: UnsavedAbout;
  onStay: () => void;
  onLeave: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onStay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStay]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);
  return (
    <div
      className="nevo-text-zoom fixed inset-0 z-50 flex items-center justify-center bg-nevo-near-black/32 p-7 backdrop-blur-[1.5px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      onClick={onStay}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-[16px] bg-nevo-cream px-7 pt-[30px] pb-[26px] shadow-[0_8px_32px_rgba(0,0,0,0.16)] motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200 xl:max-w-[440px] xl:px-[34px] xl:pt-[34px] xl:pb-[30px]"
      >
        <span className="inline-flex size-[50px] items-center justify-center rounded-full bg-nevo-violet/22 text-nevo-navy xl:size-[54px]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="xl:size-[26px]">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </span>
        <h2
          id="unsaved-title"
          className="mt-[18px] text-[20px] font-semibold tracking-[-0.01em] text-nevo-near-black xl:mt-5 xl:text-[22px]"
        >
          You have changes that aren&rsquo;t saved
        </h2>
        <p className="mt-2.5 text-[15.5px] leading-[1.55] text-nevo-near-black/68 xl:text-base">
          {unsavedLine(about)}
        </p>
        <div className="mt-6 flex flex-col gap-2.5 xl:mt-[26px]">
          <button
            type="button"
            onClick={onStay}
            className="h-[50px] w-full cursor-pointer rounded-[10px] bg-nevo-navy text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 active:scale-[0.99] xl:h-[52px] xl:text-[15.5px]"
          >
            Stay on this page
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="h-[50px] w-full cursor-pointer rounded-[10px] border-[1.5px] border-nevo-navy/32 text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 active:scale-[0.99] xl:h-[52px] xl:text-[15.5px]"
          >
            Leave without saving
          </button>
        </div>
      </div>
    </div>
  );
}
