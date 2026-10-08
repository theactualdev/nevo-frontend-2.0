"use client";

import Link from "next/link";
import { NevoLockup } from "./NevoLockup";
import {
  sessionEndCopy,
  type SessionEndReason,
} from "@/lib/auth/sessionEndReason";

/**
 * `Nevo Session Expired` - the shared teacher/admin console screen for a
 * session that timed out. One frame serves both consoles; only the door
 * behind "Sign in" differs, which is why the route carries it rather than the
 * component guessing from a session that has just been cleared.
 *
 * It exists because dropping someone straight onto a sign-in form tells them
 * nothing: they typed a password five minutes ago and the console simply
 * vanished. The frame's third line does the real work - saying the timeout
 * was deliberate and why - so an expiry does not read as a fault.
 *
 * Values are the frame's own: 76px violet-tint tile at /20, 34px padlock,
 * 30px heading, 17px body capped at 420px, a 52px navy button, and the
 * security note at 13.5px / 50% on a 360px measure.
 */
export function ConsoleSessionExpired({
  signInHref,
  /**
   * Which of the four states this is. Defaults to the ordinary one, so any
   * caller that has not been taught about reasons keeps its current behaviour.
   */
  reason = "expired",
}: {
  signInHref: string;
  reason?: SessionEndReason;
}) {
  const copy = sessionEndCopy(reason);
  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      <div className="absolute top-9 left-11">
        {/* priority: it is the only mark on an otherwise empty screen. */}
        <NevoLockup priority />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-10 text-center">
        <span className="flex size-[76px] shrink-0 items-center justify-center rounded-[20px] bg-nevo-violet/20 text-nevo-navy">
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3.5" y="11" width="17" height="10.5" rx="2.5" />
            <path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
            <circle cx="12" cy="16" r="1.4" />
          </svg>
        </span>
        <h1 className="mt-7 text-[30px] font-semibold tracking-[-0.015em] text-nevo-near-black">
          {copy.heading}
        </h1>
        <p className="mt-[13px] max-w-[420px] text-[17px] leading-[1.55] text-nevo-near-black/70">
          {copy.body}
        </p>
        {/* A paused account offers no button: design was explicit that
            retrying does nothing, and a control that cannot work is worse
            than none. The frame it mirrors has no button either. */}
        {copy.offersSignIn && (
          <Link
            href={signInHref}
            className="mt-[30px] inline-flex h-[52px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-10 text-base font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
          >
            Sign in
          </Link>
        )}
        {copy.note && (
          <p className="mt-[22px] max-w-[360px] text-[13.5px] leading-[1.5] text-nevo-near-black/50">
            {copy.note}
          </p>
        )}
      </div>
    </div>
  );
}
