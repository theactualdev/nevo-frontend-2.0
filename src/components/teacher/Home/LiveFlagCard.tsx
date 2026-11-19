"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { TeacherFlag } from "@/hooks/useTeacherFlags";
import { intelligenceApi } from "@/lib/api/intelligence";
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
 * THE TEACHER'S OWN READ IS ITS OWN BUTTON, "MARK AS SEEN" (Lydia, 16 Nov).
 * It records `POST …/seen` - this viewer's read, and nobody else's - and the
 * card leaves their Home. It is not the flag resolving: the flag stays open on
 * the child's page and in the class's count until its evidence stops holding.
 * Opening the card used to record that read (SCRUM-252, #894); since the
 * 11 Nov addendum nothing but this button does.
 *
 * An earlier note here said the profile could not be linked because
 * `/teacher/students/{id}` resolved against fixtures and would 404 on a real
 * id. That is no longer true: `StudentRoute` resolves live first and falls
 * back to a fixture only when the live read fails.
 */

/** The admin console's words for the same act not landing (`WriteFailed`). */
export const SEEN_FAILED =
  "We couldn’t record that as seen just now, so nothing has changed. Try again in a moment.";

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

/**
 * NEITHER WAY OFF THE CARD MARKS THE FLAG SEEN (Lydia, 11 Nov addendum;
 * SCRUM-346). "Opening a child's profile to look is not acknowledging a flag,
 * and a teacher who taps the card to find out what it is has now cleared it
 * without acting on it. Only an explicit acknowledgement marks a flag seen."
 * Both links used to `POST …/seen` (SCRUM-252's tap-clears, #894). The
 * explicit control is "Mark as seen" (Lydia, 16 Nov): "It marks seen, not
 * resolved, and the flag stays until it resolves." C03 draws no such control,
 * so it takes the look of the one drawn for the same act on learning
 * support's concern card (D08, design fc0b7ae): the check and the words, in
 * navy, beside the card's other action.
 *
 * A READ THAT DID NOT LAND SAYS SO, in the words the admin console uses for
 * the same act, and the button stays: the card staying put with nothing said
 * would look like a press that did nothing. The card leaves only once the
 * server has the read.
 *
 * "MESSAGE {FIRST}", because "Send them a message" did not say who, and the
 * teacher is one tap from writing to a child. The message goes to the CHILD
 * (Connect's compose, the child preselected). With no name, no button: the
 * card still opens the profile, and a line that cannot say who is the one she
 * ruled out.
 */
export function LiveFlagCard({
  flag,
  onSeen,
}: {
  flag: TeacherFlag;
  /** The server has this teacher's read: the card can leave their Home. */
  onSeen?: (flagId: string) => void;
}) {
  const first = flag.name?.trim().split(/\s+/)[0] || null;
  const nameId = useId();
  const [marking, setMarking] = useState(false);
  const [seenFailed, setSeenFailed] = useState(false);

  const markSeen = () => {
    if (marking) return;
    setMarking(true);
    setSeenFailed(false);
    intelligenceApi
      .markFlagSeen(flag.id)
      .then(() => onSeen?.(flag.id))
      .catch(() => setSeenFailed(true))
      .finally(() => setMarking(false));
  };

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
          <span
            id={nameId}
            className="text-[15.5px] font-semibold tracking-[-0.01em] text-nevo-near-black xl:text-[16.5px]"
          >
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
          /* With the child's class, so the profile can show what Nevo has
             noticed and its "{class} · Roster" way back (backlog item 9). */
          href={`/teacher/students/${flag.studentId}${flag.classId ? `?class=${flag.classId}` : ""}`}
          className="text-[13.5px] font-semibold text-nevo-navy after:absolute after:inset-0 after:rounded-[12px] after:content-[''] focus-visible:outline-none xl:text-[14.5px]"
        >
          <span className="sr-only">
            {`Open ${flag.name ?? "this student"}’s profile`}
          </span>
        </Link>
        {/* Above the stretched link, so each stays its own action. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-[18px] gap-y-2 xl:mt-[18px]">
          {first && (
            <Link
              /* Names the child. A bare /teacher/connect opened the thread
                 list with no compose at all - the action did nothing a
                 teacher could see. */
              href={`/teacher/connect?student=${flag.studentId}`}
              className="relative z-10 text-[13.5px] font-semibold text-nevo-navy transition-transform active:scale-[0.985] xl:text-[14.5px]"
            >
              {`Message ${first}`}
              <span className="ml-1.5">&rarr;</span>
            </Link>
          )}
          <button
            type="button"
            onClick={markSeen}
            disabled={marking}
            /* Every card has one; the child's name says whose this is. */
            aria-describedby={nameId}
            className="relative z-10 inline-flex cursor-pointer items-center gap-1.5 text-[13.5px] text-nevo-navy transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50 xl:text-[14.5px]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {marking ? "Marking…" : "Mark as seen"}
          </button>
        </div>
        {seenFailed && (
          <p
            role="status"
            className="relative z-10 mt-2.5 rounded-[10px] bg-nevo-violet/[0.18] px-3.5 py-2.5 text-[13px] leading-[1.5] text-nevo-navy xl:text-[13.5px]"
          >
            {SEEN_FAILED}
          </p>
        )}
      </div>
    </div>
  );
}
