"use client";

import Link from "next/link";
import { useTeacherClasses } from "@/hooks/useTeacherClasses";

/**
 * C19's back bar, in place of the menu on a screen a teacher reached from
 * one place (B2: "JSS 2A · Roster"). Phone only - at tablet and desktop the
 * page's own back link and the rail do this job.
 *
 * Takes the class and names it itself, so a loading or failed state of the
 * same screen carries the same way back as the loaded one. Without a class it
 * goes to My Classes, the same fallback the page's own link uses.
 */
export function PhoneRosterBar({ classId }: { classId?: string }) {
  const { liveClasses } = useTeacherClasses();
  const className = classId
    ? liveClasses.find((c) => c.classId === classId)?.className
    : undefined;
  const href = classId ? `/teacher/classes/${classId}` : "/teacher/classes";
  const label = className ? `${className} · Roster` : "My Classes";
  return (
    <Link
      href={href}
      className="-mx-[2px] flex items-center gap-3 pt-3 pb-3 text-nevo-near-black transition-transform active:scale-[0.99] md:hidden"
    >
      <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] text-nevo-navy">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </span>
      <span className="truncate text-[17px] font-semibold tracking-[-0.01em]">{label}</span>
    </Link>
  );
}
