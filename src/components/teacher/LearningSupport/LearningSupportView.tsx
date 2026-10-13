"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useCallback } from "react";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import { learningSupportApi, type LearningSupportHolders } from "@/lib/api/learningSupport";

/**
 * C20's Learning Support page (design, 12 Oct): "children with an open
 * flagged concern, from every class in the school", each row opening that
 * child's profile.
 *
 * THE LIST IS NOT BUILT YET, AND THE PAGE SAYS SO RATHER THAN DRAWING C20's
 * EMPTY STATE. "Nothing open right now" is a claim about the school that this
 * console cannot make: `GET /api/v1/escalations` sends a first name and no
 * class, and a teacher's own flags cover their own classes only. The
 * school-wide read is SCRUM-248's, with Teslim. Until it lands the page names
 * what it cannot show yet and offers the way that works today - a child's
 * profile, from their class - which carries the learning support record.
 *
 * Holders only. A teacher without the role is never offered the item; one
 * who arrives by address finds nothing here, as C20 has it for every absent
 * piece of this role.
 */
export function LearningSupportView() {
  const run = useCallback(() => learningSupportApi.holders(), []);
  const { data, failed, loading } = useLiveQuery<LearningSupportHolders>(run, []);

  if (data && !data.viewerHoldsIt) notFound();

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[820px]">
        <h1 className="text-[24px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[27px]">
          Learning Support
        </h1>
        <p className="mt-2 max-w-[620px] text-[14.5px] leading-[1.55] text-nevo-near-black/62 xl:text-[15px]">
          Children with an open flagged concern, from every class in the school.
        </p>

        {loading && (
          <div className="mt-8 h-[180px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
        )}

        {failed && !data && (
          <p className="mt-8 text-[14.5px] leading-[1.55] text-nevo-near-black/68">
            We couldn&rsquo;t load this just now. Try again in a moment.
          </p>
        )}

        {data?.viewerHoldsIt && (
          <div className="mx-auto mt-16 max-w-[420px] text-center xl:mt-24">
            <span className="inline-flex size-[60px] items-center justify-center rounded-full bg-nevo-violet/20 text-nevo-navy">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 20s-6.5-4.2-9-8.5A5 5 0 0 1 12 6a5 5 0 0 1 9 6.5C18.5 15.8 12 20 12 20z" />
              </svg>
            </span>
            <h2 className="mt-5 text-[19px] font-semibold text-nevo-near-black">
              The school-wide list isn&rsquo;t ready yet
            </h2>
            <p className="mt-2 text-[14.5px] leading-[1.55] text-nevo-near-black/60">
              Until it is, open a child&rsquo;s profile from their class. As
              you hold Learning Support, their record is at the foot of it.
            </p>
            <Link
              href="/teacher/classes"
              className="mt-6 inline-flex h-11 cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/30 px-5 text-[14.5px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6"
            >
              Go to My Classes
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
