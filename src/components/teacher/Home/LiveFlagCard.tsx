"use client";

import Link from "next/link";
import type { TeacherFlag } from "@/hooks/useTeacherFlags";
import { cn } from "@/lib/utils";

/**
 * One live "Worth your attention" card.
 *
 * C03's card pairs the note with a five-bar evidence sparkline, a caption
 * under it, and two actions. The flag endpoint carries none of that - no
 * series, no target - so this card keeps what is real: the accent, who it is
 * about, what Nevo noticed, when, and the one action that works.
 *
 * THE TAP IS NOT AN ACKNOWLEDGEMENT, and no longer sends one. Design ruled on
 * 2 Sep that the tap opened the profile and marked the flag seen, so it used to
 * fire `POST /api/intelligence/flags/{id}/acknowledge`. Lydia ruled on 13 Oct
 * that this let two different acts share one control:
 *
 * - a class teacher tapping a flag on their own Home means "I have read this
 *   about my student". It clears the card from THEIR view and nothing else;
 * - a Learning Support holder acknowledging a flag means "learning support has
 *   seen this and is on it". That is what produces the dated line on the
 *   profile, and only a holder can do it (the server refuses anyone else
 *   since backend ab78139).
 *
 * So the tap only opens the profile, for every teacher, holder or not. Sending
 * the acknowledgement would refuse a class teacher, and for a holder it would
 * record "learning support is on it" from a tap that meant "I've read it".
 *
 * WHAT IS NOT BUILT: clearing the card from the tapper's own view. The flag
 * read has no per-viewer "read" state and there is no call to set one, so
 * there is nothing true to filter on. Raised with backend. Until it lands the
 * card stays until the flag is acknowledged, which is the state a class
 * teacher without the role was already in.
 *
 * An earlier note here said the profile could not be linked because
 * `/teacher/students/{id}` resolved against fixtures and would 404 on a real
 * id. That is no longer true: `StudentRoute` resolves live first and falls
 * back to a fixture only when the live read fails.
 */

const DROP_GLYPH = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 5v9" />
    <path d="M8 11l4 4 4-4" />
  </svg>
);

function noticedWhen(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return "just now";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
}

export function LiveFlagCard({ flag }: { flag: TeacherFlag }) {
  return (
    <div className="relative flex gap-3.5 rounded-[12px] bg-nevo-cream-elevated py-4 pr-[18px] pl-[22px] shadow-elevation-1 transition-shadow focus-within:shadow-elevation-2 hover:shadow-elevation-2 xl:gap-[18px] xl:py-[22px] xl:pr-6 xl:pl-7">
      {/* Navy for a sudden change, violet for a pattern - C03's own rule. */}
      <span
        className={cn(
          "absolute inset-y-4 left-0 w-[3px] rounded-full",
          flag.isSudden ? "bg-nevo-navy" : "bg-nevo-violet",
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 xl:gap-[9px]">
          {flag.isSudden && (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream xl:size-[22px]">
              {DROP_GLYPH}
            </span>
          )}
          <span className="text-[15.5px] font-semibold tracking-[-0.01em] text-nevo-near-black xl:text-[16.5px]">
            {flag.name ?? "One of your students"}
          </span>
          <span className="text-[12.5px] text-nevo-near-black/50 xl:text-[13px]">
            {[flag.context, `noticed ${noticedWhen(flag.generatedAt)}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <p className="mt-[7px] text-[14.5px] leading-[1.5] text-nevo-near-black/82 xl:mt-[9px] xl:max-w-[640px] xl:text-[15.5px] xl:leading-[1.55]">
          {flag.note}
        </p>
        {/*
          * The whole card is the link, so the profile is reachable from
          * anywhere on it - which is what design described as "tapping the
          * flag card". It is stretched with a pseudo-element rather than
          * wrapping the card, because "Send them a message" is itself an
          * anchor and an anchor may not contain another one.
          */}
        <Link
          href={`/teacher/students/${flag.studentId}`}
          className="text-[13.5px] font-semibold text-nevo-navy after:absolute after:inset-0 after:rounded-[12px] after:content-[''] focus-visible:outline-none xl:text-[14.5px]"
        >
          <span className="sr-only">
            {`Open ${flag.name ?? "this student"}’s profile`}
          </span>
        </Link>
        <div className="mt-3 xl:mt-[18px]">
          {/* Above the stretched link, so it stays its own action. */}
          <Link
            /* Names the child. A bare /teacher/connect opened the thread
               list with no compose at all - the action did nothing a
               teacher could see. */
            href={`/teacher/connect?student=${flag.studentId}`}
            className="relative z-10 text-[13.5px] font-semibold text-nevo-navy transition-transform active:scale-[0.985] xl:text-[14.5px]"
          >
            Send them a message
            <span className="ml-1.5">&rarr;</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
