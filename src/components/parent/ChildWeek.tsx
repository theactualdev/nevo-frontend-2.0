"use client";

import { useEffect, useState } from "react";
import { parentApi, type ChildSubjectProgress } from "@/lib/api/parent";
import {
  cardCopy,
  childWords,
  localToday,
  weekCopy,
  weekKind,
  whenLabel,
  type CardCopy,
} from "./portalWeek";

/**
 * D02's portal home for one child: one card per subject, what was covered and
 * mastered this week, and the week's dates. It replaces D15d "How Amara Is
 * Growing", which design struck on 20 Sep as "a score about a named child" and
 * which was still rendering here. The states (B1-B7) and what is left off the
 * frame are in `portalWeek.ts`.
 *
 * KEYED BY `studentId` AT THE CALL SITE, so switching children remounts this
 * rather than leaving one child's week under another child's name for the
 * length of a request.
 */
export function ChildWeek({
  studentId,
  firstName,
  schoolName,
}: {
  studentId: string;
  firstName: string | null;
  schoolName: string;
}) {
  const [progress, setProgress] = useState<ChildSubjectProgress | null>(null);
  /** The day the window is judged against, captured once when the read lands. */
  const [today, setToday] = useState("");
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let cancelled = false;
    parentApi
      .subjectProgress(studentId)
      .then((p) => {
        if (cancelled) return;
        setProgress(p);
        setToday(localToday(new Date()));
        setPhase("ready");
      })
      .catch(() => {
        if (!cancelled) setPhase("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (phase === "loading") {
    return (
      <span
        role="status"
        aria-label="Loading"
        className="mx-auto block size-[22px] rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:800ms]"
      />
    );
  }

  if (phase === "failed" || !progress) {
    return (
      <div className="rounded-[14px] bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <h1 className="text-[21px] font-semibold text-nevo-near-black">
          We couldn&rsquo;t load this just now
        </h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-nevo-near-black/68">
          Please try again in a moment.
        </p>
      </div>
    );
  }

  const child = childWords(firstName);
  const kind = weekKind(progress, today);
  const copy = weekCopy(kind, child, progress.subjects.length, schoolName);
  const when = whenLabel(progress, today);

  return (
    <>
      <div className="px-1">
        <span className="text-[12.5px] font-medium text-nevo-near-black/55">
          {schoolName}
        </span>
        <h1 className="m-0 mt-1.5 text-[24px] leading-[1.25] font-semibold tracking-[-0.015em] text-nevo-near-black md:text-[28px] lg:text-[30px]">
          {copy.heading}
        </h1>
        <p className="m-0 mt-1.5 text-[14.5px] leading-normal text-pretty text-nevo-near-black/66">
          {copy.sub}
        </p>
      </div>

      {copy.panel && (
        <div className="mt-4 flex items-start gap-[11px] rounded-[10px] bg-nevo-violet/[0.14] px-[15px] py-3.5">
          <span
            aria-hidden
            className="mt-[7px] size-[7px] shrink-0 rounded-full bg-nevo-violet"
          />
          <div>
            <p className="m-0 text-[14.5px] font-semibold text-nevo-near-black">
              {copy.panel.title}
            </p>
            <p className="m-0 mt-1 text-[13.5px] leading-normal text-pretty text-nevo-near-black/72">
              {copy.panel.body}
            </p>
          </div>
        </div>
      )}

      {progress.subjects.length > 0 && (
        <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0 md:mt-5 md:grid md:grid-cols-2 md:gap-3">
          {progress.subjects.map((s) => (
            <li key={s.subjectId}>
              <SubjectCard card={cardCopy(s, kind, child)} when={when} />
            </li>
          ))}
        </ul>
      )}

      <p className="m-0 mx-1 mt-[18px] text-[12.5px] leading-normal text-nevo-near-black/50">
        Shared with you by {schoolName}.
      </p>
    </>
  );
}

/** `Nevo Parent Subject Card`: each line renders only when it has something. */
function SubjectCard({ card, when }: { card: CardCopy; when: string }) {
  return (
    <div className="flex h-full flex-col gap-[7px] rounded-xl bg-nevo-cream-elevated px-[15px] py-[13px]">
      <div className="flex items-baseline justify-between gap-2.5">
        <h2 className="m-0 min-w-0 text-[15px] font-semibold tracking-[-0.005em] text-nevo-near-black">
          {card.name}
        </h2>
        <span className="shrink-0 text-[12px] font-medium text-nevo-near-black/55">
          {when}
        </span>
      </div>
      {card.covered && (
        <p className="m-0 flex gap-2 text-[13.5px] leading-[1.45]">
          <span className="w-[68px] shrink-0 font-semibold text-nevo-near-black/55">
            Covered
          </span>
          <span className="min-w-0 flex-1 text-nevo-near-black">{card.covered}</span>
        </p>
      )}
      {card.mastered && (
        <p className="m-0 flex gap-2 text-[13.5px] leading-[1.45]">
          <span className="w-[68px] shrink-0 font-semibold text-nevo-navy">
            Mastered
          </span>
          <span className="min-w-0 flex-1 text-nevo-near-black">{card.mastered}</span>
        </p>
      )}
      {card.note && (
        <p className="m-0 text-[13.5px] leading-[1.45] text-nevo-near-black/62">
          {card.note}
        </p>
      )}
    </div>
  );
}
