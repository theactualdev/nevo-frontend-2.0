"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { studentsApi } from "@/lib/api/students";
import { accountStatus } from "@/lib/constants/accountStatus";
import { cn } from "@/lib/utils";

/**
 * C05's row menu - "View profile" and "Clear PIN" - for one child on a class
 * this teacher takes (SCRUM-216 / SCRUM-217).
 *
 * A CLEAR, NEVER A PIN. Nothing here shows, accepts or generates a PIN value;
 * the endpoint cannot, and neither can this. The child chooses the next one
 * themselves at their next sign-in, and the dialog that follows says so - and
 * says the teacher will not be able to see it, or a teacher goes looking for a
 * PIN to read out (SCRUM-217).
 *
 * IMMEDIATE, AS C05 DRAWS IT. The menu item clears; the confirmation is the
 * state AFTER. A deactivated child has no PIN to clear while the account is
 * off, so on their row the item stays pressable and explains itself in place,
 * in the frame's words. C05's "Ask an admin about this" link is not here:
 * there is no endpoint for it to send to, and a link that sends nothing would
 * tell a teacher their admin had been told.
 */
export function RosterRowMenu({
  studentId,
  firstName,
  status,
  profileHref,
  open,
  up = false,
  onToggle,
  onClose,
  onCleared,
}: {
  studentId: string;
  firstName: string;
  status: string | null | undefined;
  profileHref: string;
  open: boolean;
  /** Open upward, for the last rows of a long list (C05). */
  up?: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Called only once the server says the PIN is cleared. */
  onCleared: () => void;
}) {
  const [explain, setExplain] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const deactivated = accountStatus(status) === "deactivated";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // Each opening starts clean: no explanation, no old failure.
  const toggle = () => {
    setExplain(false);
    setFailed(false);
    onToggle();
  };

  const clear = async () => {
    if (deactivated) {
      setExplain(true);
      return;
    }
    if (clearing) return;
    setClearing(true);
    setFailed(false);
    try {
      await studentsApi.clearPin(studentId);
      onCleared();
    } catch {
      setFailed(true);
    } finally {
      setClearing(false);
    }
  };

  const item =
    "flex h-11 w-full cursor-pointer items-center rounded-[10px] px-4 text-left text-[14.5px] font-medium text-nevo-near-black transition-colors hover:bg-nevo-cream-elevated disabled:cursor-default disabled:opacity-55";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`More options for ${firstName}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={cn(
          "flex size-10 cursor-pointer items-center justify-center rounded-[10px] transition-colors hover:bg-nevo-navy/8",
          open && "bg-nevo-navy/10",
        )}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#3b3f6e" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`Options for ${firstName}`}
          className={cn(
            "absolute right-0 z-10 w-[280px] rounded-[12px] bg-nevo-cream p-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.10)]",
            up ? "bottom-[46px]" : "top-[46px]",
          )}
        >
          <Link role="menuitem" href={profileHref} className={item}>
            View profile
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => void clear()}
            disabled={clearing}
            className={item}
          >
            {clearing ? `Clearing${"…"}` : "Clear PIN"}
          </button>
          {explain && (
            <p className="mx-1.5 mt-1 mb-1.5 rounded-[10px] bg-nevo-violet/14 px-[15px] py-[13px] text-[13.5px] leading-[1.55] text-nevo-near-black">
              {`${firstName} can${"’"}t sign in while the account is deactivated, so there${"’"}s no PIN to clear yet. Your admin manages access.`}
            </p>
          )}
          {failed && (
            <p
              role="alert"
              className="mx-1.5 mt-1 mb-1.5 rounded-[10px] bg-nevo-violet/14 px-[15px] py-[13px] text-[13.5px] leading-[1.55] text-nevo-near-black"
            >
              {`We couldn${"’"}t clear ${firstName}${"’"}s PIN just now. Nothing has changed. Try again in a moment.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * C05's confirmation, in the frame's words, once the server has cleared it.
 */
export function PinClearedDialog({
  firstName,
  onDone,
}: {
  firstName: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-nevo-near-black/28 backdrop-blur-[1.5px] p-10 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      onClick={onDone}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${firstName}${"’"}s PIN is cleared`}
        onClick={(e) => e.stopPropagation()}
        className="w-[440px] max-w-full rounded-[16px] bg-nevo-cream-elevated p-[30px] text-center shadow-[0_8px_32px_rgba(0,0,0,0.16)] xl:w-[460px] xl:p-8"
      >
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop xl:size-[52px]">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden className="xl:size-[26px]">
            <path d="M5 12.5l4.2 4.2L19 7" stroke="#f7f1e6" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h3 className="mt-5 text-[20px] font-semibold tracking-[-0.01em] text-nevo-near-black xl:mt-[22px] xl:text-[21px]">
          {`${firstName}${"’"}s PIN is cleared`}
        </h3>
        <p className="mt-[11px] text-[15px] leading-[1.6] text-pretty text-nevo-near-black/72 xl:mt-3">
          {`${firstName} chooses a new PIN at the next sign-in.`}
        </p>
        <div className="mt-4 flex items-start justify-center gap-[11px] rounded-[10px] bg-nevo-violet/14 px-[15px] py-[13px] text-left xl:mt-[18px] xl:py-3.5">
          <span className="mt-px inline-flex shrink-0 text-nevo-navy">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 3l18 18" />
              <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 8.5 4.2 9.5 7-.4 1.1-1.2 2.5-2.4 3.8" />
              <path d="M6.3 6.4C4.4 7.7 3.1 9.6 2.5 12c1 2.8 4.5 7 9.5 7 1.7 0 3.2-.5 4.5-1.2" />
              <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
            </svg>
          </span>
          <span className="text-[14.5px] leading-[1.55] text-nevo-near-black">
            {`You won${"’"}t be able to see the new PIN. Only ${firstName} will know it.`}
          </span>
        </div>
        <div className="mt-[22px] flex justify-center xl:mt-6">
          <button
            type="button"
            onClick={onDone}
            className="inline-flex cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy px-[30px] py-3 text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-108"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
