"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks";

/**
 * C11 sign-out confirm. The violet glyph and the reassurance line keep it a
 * calm choice rather than a warning - staying signed in is the quiet default
 * and sits below the primary action.
 */
export function SignOutModal({ onStay }: { onStay: () => void }) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onStay();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStay, busy]);

  const signOut = () => {
    if (busy) return;
    setBusy(true);
    // Goes through AuthContext, not authApi directly: it revokes server-side,
    // clears the local session, and purges the on-device behavioural-signal
    // store (NDPA ephemerality, SCRUM-76) - calling logout() alone left both
    // the in-memory user and that store behind.
    auth.signOut();
    // A HARD navigation, not router.push. The route guard reads the `nevo.role`
    // cookie, and a client-side push raced the clearing of it: the guard still
    // saw a teacher, bounced them off /auth/teacher back into the console, and
    // the token then dropped underneath them - so signing out landed you back
    // where you started and quietly logged you out a moment later.
    // Teachers land on their own door, not the student PIN unlock.
    window.location.assign("/auth/teacher");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-nevo-near-black/50 p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      onClick={() => !busy && onStay()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign out of Nevo?"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] rounded-[16px] bg-nevo-cream p-8 text-center shadow-[0_24px_60px_rgba(0,0,0,0.3)] motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200"
      >
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-nevo-violet/22 text-nevo-navy">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </span>
        <h2 className="mt-[18px] text-xl font-semibold text-nevo-near-black">
          Sign out of Nevo?
        </h2>
        <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/62">
          You can sign back in anytime with your school email.
        </p>
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          className="mt-6 h-[50px] w-full cursor-pointer rounded-[10px] bg-nevo-navy text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-wait disabled:opacity-70"
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
        <button
          type="button"
          onClick={onStay}
          disabled={busy}
          className="mt-2 h-[46px] w-full cursor-pointer rounded-[10px] text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
