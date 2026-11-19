import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { BackLink } from "./BackLink";
import type { Back } from "./back";

/**
 * D28 RECORD NOT FOUND: a detail address that points at a record which is no
 * longer there (backlog 66, 80, 83).
 *
 * These pages used to treat the server's 404 ("Student not found", "Class not
 * found", "Teacher not found") as a passing failure, and offered Try again - a
 * retry that cannot succeed, which an admin would sit pressing. D28: "It names
 * what was looked for and offers the one thing that helps: the way back to the
 * list. No retry (it cannot succeed), no guess at why (we do not know), no
 * alarm." Every word below is D28's.
 */

/**
 * The record's OWN read answered 404. Only that read decides it: a 404 from a
 * side read (a class list, a roster) is not this record being gone.
 */
export function isRecordGone(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

const WORDS = {
  student: { list: "/admin/students", listName: "Students", all: "students" },
  class: { list: "/admin/classes", listName: "Classes", all: "classes" },
  teacher: { list: "/admin/teachers", listName: "Teachers", all: "teachers" },
} as const;

export function RecordGone({
  what,
  back,
}: {
  what: keyof typeof WORDS;
  /** Where the page was opened from, for the link at its top. */
  back?: Back | null;
}) {
  const w = WORDS[what];
  return (
    <div data-record-gone className="flex min-h-[60vh] flex-col">
      <BackLink back={back} fallback={{ href: w.list, label: w.listName }} />
      <div className="flex flex-1 items-center justify-center py-10">
        <div className="max-w-[360px] text-center xl:max-w-[400px]">
          <span className="inline-flex size-[76px] items-center justify-center rounded-full bg-nevo-cream-elevated text-nevo-navy shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </span>
          <h2 className="mt-5 text-[21px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:mt-[22px] xl:text-[24px]">
            {`We couldn’t find that ${what}`}
          </h2>
          <p className="mt-2.5 text-[14.5px] leading-[1.55] text-nevo-near-black/64 xl:mt-[11px] xl:text-[15.5px] xl:leading-[1.6]">
            {`The ${what} you opened isn’t here. Your other records are unaffected.`}
          </p>
          {/* The list itself, as D28 draws it - "all", not wherever the
              admin came from, which may be the record's own class. */}
          <Link
            href={w.list}
            className="mt-[22px] inline-flex cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy px-5 py-[11px] text-[14px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 xl:mt-[26px] xl:px-[22px] xl:py-3 xl:text-[14.5px]"
          >
            {`Back to all ${w.all}`}
          </Link>
        </div>
      </div>
    </div>
  );
}
