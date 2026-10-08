"use client";

import Link from "next/link";
import { useState } from "react";
import {
  getSectionVariants,
  VARIANT_ORIENTATION,
  VARIANT_TABS,
  type VariantTab,
} from "@/lib/mocks/teacherIntelligence";
import type { LessonDetailData, LibraryLesson } from "@/lib/mocks/teacherLibrary";
import { cn } from "@/lib/utils";

/**
 * Variant Review (SCRUM-37, drawn only in C16d) - the four variants Nevo
 * generates for one lesson section, with the C16d orientation line making
 * clear the system assigns variants, not the teacher. The base screen had
 * never been built; C16d's drawing is its only contract, so the whole
 * surface is built from it (flagged to design).
 */
export function VariantReview({
  lesson,
  sectionIndex,
}: {
  lesson: LibraryLesson & { detail: LessonDetailData };
  sectionIndex: number;
}) {
  const [tab, setTab] = useState<VariantTab>("Text");

  const section = lesson.detail.sections[sectionIndex - 1];
  const variants = getSectionVariants(
    lesson.id,
    sectionIndex,
    section.title,
    section.type,
  );

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[680px] xl:max-w-[820px]">
        <Link
          href={`/teacher/lessons/${lesson.id}`}
          className="inline-flex cursor-pointer items-center gap-[7px] text-[13px] text-nevo-near-black/55 transition-transform active:scale-[0.99] xl:text-[13.5px]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Lesson Library · Variant review
        </Link>

        <h1 className="mt-0.5 text-[22px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[26px]">
          {`${lesson.title} · Section ${sectionIndex}`}
        </h1>

        <p className="mt-4 text-[13px] leading-[1.6] text-nevo-near-black/60 italic">
          {VARIANT_ORIENTATION}
        </p>

        <div className="mt-4 flex flex-wrap gap-2 xl:flex-nowrap" role="tablist" aria-label="Lesson variants">
          {VARIANT_TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center rounded-[8px] px-[18px] text-[13px] transition-[background-color,transform] active:scale-[0.99]",
                tab === t
                  ? "bg-nevo-navy font-semibold text-nevo-cream"
                  : "bg-nevo-cream-elevated font-medium text-nevo-near-black/70 hover:bg-nevo-navy/8",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-[12px] bg-nevo-cream-elevated p-[22px] xl:p-6">
          <h3 className="text-[14px] font-semibold text-nevo-near-black xl:text-[15px]">
            {`${tab} variant`}
          </h3>
          <div className="mt-3 flex flex-col gap-2.5">
            {variants[tab].map((para) => (
              <p
                key={para}
                className="text-[13.5px] leading-[1.6] text-nevo-near-black/72"
              >
                {para}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
