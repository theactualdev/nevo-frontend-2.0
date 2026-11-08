"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useCallback } from "react";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { useStudentDirectory } from "@/hooks/useStudentDirectory";
import { StudentAvatar } from "@/components/shared/StudentAvatar";
import { escalationsApi, type Escalation } from "@/lib/api/escalations";
import { learningSupportApi, type LearningSupportHolders } from "@/lib/api/learningSupport";
import { SummaryChip } from "@/components/teacher/shared/SummaryChip";
import { ReadFailed } from "@/components/teacher/shared/ReadFailed";

/**
 * C20's Learning Support page (design, 12 Oct): "children with an open
 * flagged concern, from every class in the school", each row opening that
 * child's profile.
 *
 * THE LIST IS THE SERVER'S. For a holder, `GET /api/v1/escalations` returns the
 * whole school's open escalations, and since 4 Nov each one carries the
 * child's name, their class and who raised it. So the rows are read, never
 * assembled: nothing here filters by class or matches against a roster.
 *
 * OPEN MEANS NOT YET ACKNOWLEDGED (Hub, 3 Nov, for the Flagged chip, and
 * `openOnly` is that). Two of C20's drawn rows are not that, and wait on
 * Lydia: one acknowledged concern carrying its "saw this" line, and one
 * sudden change, which is Nevo's flag rather than a concern a teacher raised.
 *
 * "Nothing open right now" is said only over a read that reached its end. A
 * list that stopped short says so instead of being counted.
 *
 * Holders only. A teacher without the role is never offered the item; one who
 * arrives by address finds nothing here, as C20 has it for every absent piece
 * of this role.
 */

interface ConcernsRead {
  holders: LearningSupportHolders;
  /** Null for a viewer without the role - their list is never asked for. */
  concerns: { open: Escalation[]; complete: boolean } | null;
}

/** One row per child, their most recent open concern. */
function byChild(open: readonly Escalation[]): Escalation[] {
  const latest = new Map<string, Escalation>();
  for (const e of open) {
    const seen = latest.get(e.studentId);
    if (!seen || Date.parse(e.generatedAt) > Date.parse(seen.generatedAt)) {
      latest.set(e.studentId, e);
    }
  }
  return [...latest.values()].sort(
    (a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt),
  );
}

function dayOf(iso: string): string | null {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? null
    : at.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

export function LearningSupportView() {
  const run = useCallback(async (): Promise<ConcernsRead> => {
    const holders = await learningSupportApi.holders();
    return {
      holders,
      concerns: holders.viewerHoldsIt ? await escalationsApi.allOpen(10) : null,
    };
  }, []);
  const { data, failed, loading } = useLiveQuery<ConcernsRead>(run, []);
  /* The child's avatar (SCRUM-317). An escalation carries none, so it is the
     look on the child's class roster, from this teacher's own classes; a
     child from another class gets an empty slot, not a look they never chose
     (asked of Teslim: the look on the escalation row itself). */
  const { students: directory } = useStudentDirectory();

  if (data && !data.holders.viewerHoldsIt) notFound();

  const rows = data?.concerns ? byChild(data.concerns.open) : [];
  const complete = data?.concerns?.complete === true;

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[820px]">
        <h1 className="text-[24px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[27px]">
          Learning Support
        </h1>
        <p className="mt-2 max-w-[620px] text-[14.5px] leading-[1.55] text-nevo-near-black/62 xl:text-[15px]">
          Children with an open flagged concern, from every class in the school.
          {rows.length > 0 &&
            " Open any profile to see their adaptation history and read the concern in full."}
        </p>

        {loading && (
          <div className="mt-8 h-[180px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
        )}

        {failed && !data && (
          <ReadFailed title="We couldn’t load the open concerns just now" className="mt-8" />
        )}

        {data?.concerns && rows.length > 0 && (
          <>
            <div className="mt-8 flex items-center gap-2.5">
              <h2 className="text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:text-sm">
                Open concerns
              </h2>
              {/* A count only of a list read to its end. */}
              {complete && (
                <span className="rounded-full bg-nevo-near-black/10 px-2 py-0.5 text-[12px] text-nevo-near-black/70 xl:px-[9px] xl:text-[12.5px]">
                  {rows.length}
                </span>
              )}
            </div>
            {!complete && (
              <p className="mt-2 text-[13.5px] leading-[1.55] text-nevo-near-black/60">
                Not every concern could be loaded just now, so this list may be missing some.
              </p>
            )}
            <ul className="mt-3.5 flex flex-col gap-3 xl:mt-4">
              {rows.map((e) => {
                const name = e.studentName?.trim() || e.studentFirstName?.trim() || "One of your school’s students";
                const day = dayOf(e.generatedAt);
                return (
                  <li key={e.studentId}>
                    <Link
                      href={`/teacher/students/${e.studentId}${e.classId ? `?class=${e.classId}` : ""}`}
                      className="flex cursor-pointer items-start gap-4 rounded-[12px] bg-nevo-cream-elevated px-[22px] py-[18px] shadow-elevation-1 transition-[filter] hover:brightness-[0.985] xl:pl-[26px]"
                    >
                      {(() => {
                        const look = directory.find((s) => s.studentId === e.studentId)?.look;
                        return look ? (
                          <StudentAvatar look={look} size={40} />
                        ) : (
                          <span aria-hidden className="size-10 shrink-0" />
                        );
                      })()}
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="text-[15.5px] font-semibold text-nevo-near-black xl:text-base">
                            {name}
                          </span>
                          {e.className && (
                            <span className="text-[13.5px] text-nevo-near-black/55">{e.className}</span>
                          )}
                          <SummaryChip state="flagged" />
                        </span>
                        {e.teacherName && (
                          <span className="mt-1.5 block text-[14px] leading-[1.5] text-nevo-near-black/72">
                            {`Raised by ${e.teacherName}`}
                          </span>
                        )}
                        {/* The teacher's own words, as C20's profile quotes them. */}
                        <span className="mt-1 line-clamp-2 block text-[14px] leading-[1.5] text-nevo-near-black/72">
                          {`“${e.note}”`}
                        </span>
                      </span>
                      {day && (
                        <span className="shrink-0 pt-0.5 text-[13px] whitespace-nowrap text-nevo-near-black/55">
                          {day}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* C20's own empty state, and only over a read that reached its end. */}
        {data?.concerns && rows.length === 0 && complete && (
          <div className="mx-auto mt-16 max-w-[420px] text-center xl:mt-24">
            <h2 className="text-[19px] font-semibold text-nevo-near-black">
              Nothing open right now
            </h2>
            <p className="mt-2 text-[14.5px] leading-[1.55] text-nevo-near-black/60">
              No child in the school has an open flagged concern. When a teacher
              raises one, they&rsquo;ll appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
