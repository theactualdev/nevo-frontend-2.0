"use client";

import Link from "next/link";
import { useUnfinishedChecks } from "@/hooks/useUnfinishedChecks";

/**
 * SCRUM-231: who in this class has a check from today still to finish.
 *
 * WHY THE TEACHER. A check only resumes the same day, and the teacher is in
 * the room: "Amara, finish your check before break" is the whole thing. A
 * reminder aimed at the child would surface on a shared tablet in front of
 * someone else, so nothing here reaches a child (the ticket).
 *
 * WHAT IS DRAWN IS THE SERVER'S LIST, AS SENT
 * (`GET /api/v1/classes/{id}/unfinished-checks`): it already holds only the
 * checks still open today, in name order, and it empties itself as children
 * finish and at the day's end.
 *  - A name and a lesson, nothing more. `checkPosition` is never shown: the
 *    ticket rules out "a count of how far through each child got".
 *  - Never a failure or a concern: no flag colour, no warning mark, no count.
 *  - An empty list, a failed read and the first read draw NOTHING. None of
 *    them may say "everyone has finished", which only an answered, empty
 *    read could - and even that is not worth a line on the class page.
 *
 * No frame draws this. The words are ours, for Lydia.
 */
export function UnfinishedChecks({ classId }: { classId: string }) {
  const rows = useUnfinishedChecks(classId);
  if (!rows || rows.length === 0) return null;
  return (
    <section aria-label="Checks to finish today" className="mt-7 xl:mt-8">
      <h3 className="text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:text-sm">
        Checks to finish today
      </h3>
      <p className="mt-2 max-w-[560px] text-[13px] leading-[1.5] text-nevo-near-black/60">
        They started a check today and can pick it up where they left off.
      </p>
      <ul className="mt-3 flex list-none flex-col gap-2 p-0">
        {rows.map((row) => (
          <li
            key={`${row.studentId}:${row.lessonId}`}
            className="flex flex-wrap items-baseline gap-x-2 rounded-[12px] bg-nevo-cream-elevated px-4 py-3 shadow-elevation-1"
          >
            <Link
              href={`/teacher/students/${row.studentId}?class=${classId}`}
              className="text-[14.5px] font-semibold text-nevo-near-black underline-offset-2 hover:underline xl:text-[15px]"
            >
              {row.studentName}
            </Link>
            <span className="text-[13.5px] text-nevo-near-black/62 xl:text-[14px]">{row.lessonTitle}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
