"use client";

import { X } from "lucide-react";
import { ProgressBar } from "@/components/shared";
import { useLessonExit } from "./LessonExit";

const HOME_HREF = "/student/dashboard";

/**
 * Lesson loading skeleton (Lesson Player frame) — the instant fallback while a
 * lesson streams in. A quiet skeleton of the reading column, not a blocking
 * spinner: the shell (top bar + progress) is echoed so the swap to real content
 * is calm. Wired as the route's `loading.tsx`.
 *
 * THE EXIT IS REAL. The frame keeps the player's Exit in every state, loading
 * included; this drew an inert grey square in its place. Nothing on the way in
 * has a timeout - a read that never answers is waited on rather than raced and
 * thrown away - so a stalled load left a child on a spinner with no way off it.
 * Nothing has been done yet, so there is nothing to confirm leaving: it goes
 * where "Leave for now" goes.
 */
export function LessonLoadingSkeleton() {
  const exitTo = useLessonExit();
  return (
    <div className="flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      {/* Top bar echo — exit + title placeholder */}
      <header className="flex shrink-0 flex-col gap-2.5 px-3.5 pt-2.5 pb-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Exit lesson"
            onClick={() => exitTo(HOME_HREF)}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] transition-colors hover:bg-nevo-near-black/[0.06] active:bg-nevo-near-black/[0.12]"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
          <div className="h-4 w-40 rounded-md bg-nevo-near-black/[0.08]" />
        </div>
      </header>

      <ProgressBar value={0} className="shrink-0" aria-label="Loading lesson" />

      {/* Reading-column skeleton */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-full flex-col gap-4 px-6 py-8 sm:max-w-[620px] sm:px-8 lg:max-w-[680px] lg:px-10">
          <div className="h-[22px] w-[62%] rounded-lg bg-nevo-near-black/[0.08] sm:h-[26px] lg:h-[28px]" />
          <div className="mt-2 flex flex-col gap-4">
            <div className="h-4 w-full rounded-md bg-nevo-near-black/[0.06]" />
            <div className="h-4 w-[92%] rounded-md bg-nevo-near-black/[0.06]" />
            <div className="h-4 w-[78%] rounded-md bg-nevo-near-black/[0.06]" />
          </div>
          <div className="mt-3.5 h-[150px] w-full rounded-[12px] bg-nevo-near-black/[0.06]" />

          <div className="mt-2 flex items-center justify-center gap-2.5">
            <span className="block size-5 rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:900ms]" />
            <span className="text-sm text-nevo-near-black/60">
              Getting your lesson ready…
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
