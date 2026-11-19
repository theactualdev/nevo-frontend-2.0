"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks";

/**
 * Sign-out confirm for the admin console (SCRUM-39: sidebar footer, a calm
 * confirm overlay, never an immediate logout).
 *
 * The admin console shipped without any way to end a session. The Bearer token
 * is mirrored to localStorage and survives a tab close until the backend's
 * `expiresAt`, so on a shared school machine the next person to open the
 * browser was signed in as the proprietor. Waiting for expiry or clearing site
 * data were the only exits.
 *
 * Deliberately NOT the same thing as D12c's "Sign out everywhere else": that
 * acts on OTHER sessions and per SCRUM-99 never signs out the current device.
 * This is the current device, and it is the only control that ends this session.
 *
 * Two details are load-bearing and copied from the teacher console's modal
 * rather than reinvented:
 *
 * 1. It goes through `AuthContext.signOut`, not `authApi.logout`. The context
 *    revokes server-side, clears the local session AND purges the on-device
 *    behavioural-signal store (NDPA ephemerality, SCRUM-76). Calling logout()
 *    alone leaves the in-memory user and that store behind.
 * 2. The navigation is HARD (`window.location.assign`), not `router.push`. The
 *    route guard in `proxy.ts` reads the `nevo.role` cookie, and a client-side
 *    push races the clearing of it - the guard still sees an admin, bounces you
 *    off the door back into the console, and the token then drops underneath
 *    you. Signing out lands you where you started and logs you out a moment
 *    later.
 *
 * Admins land on their own door, `/auth/admin`, not the teacher one.
 */
export function AdminSignOutModal({ onStay }: { onStay: () => void }) {
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
    auth.signOut();
    window.location.assign("/auth/admin");
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
        className="w-full max-w-[400px] rounded-2xl bg-nevo-cream p-8 text-center shadow-[0_24px_60px_rgba(0,0,0,0.3)] motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200"
      >
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-nevo-violet/22 text-nevo-navy">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </span>
        <h2 className="mt-[18px] text-xl font-semibold text-nevo-near-black">
          Sign out of Nevo?
        </h2>
        <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/62">
          {/* The admin frame's words (Nevo Admin Settings): "with your
              school email" is the teacher variant's line (backlog 91). */}
          You can sign back in anytime with your admin account.
        </p>
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          /*
            * HOVER LIFTS, PRESS DARKENS - and this had them the wrong way
            * round, darkening on hover and offering no pressed state at all.
            * D14 fixes both: brightness(1.1) on hover, brightness(0.93) on
            * press. A navy primary that darkens as the pointer arrives reads
            * as already-pressed, which is the one impression a sign-out
            * confirm should not give.
            */
          className="mt-6 h-[50px] w-full cursor-pointer rounded-[10px] bg-nevo-navy text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 active:brightness-93 disabled:cursor-wait disabled:opacity-70"
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
