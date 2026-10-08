"use client";

import Link from "next/link";
import { useState } from "react";
import { IllustrationWrapper } from "@/components/shared/IllustrationWrapper";
import { MasteryDualTrack } from "@/components/teacher/Student/MasteryDualTrack";
import { useTeacherClasses } from "@/hooks/useTeacherClasses";
import { getClassInsights, hasGap } from "@/lib/mocks/teacherInsights";
import { MaybeSample, SampleRegion } from "@/components/shared/SampleRegion";
import { LiveClassInsights } from "./LiveClassInsights";
import { cn } from "@/lib/utils";

/**
 * C09 Insights - intelligence turned into decisions. Recommendations read as
 * things you can act on, class patterns are plain prose rather than dense
 * charts, and the class selector governs everything below it.
 *
 * Four states, from three docs:
 *  - no class selected  (C14 A3) - a different page shell: the header stops
 *    scrolling and the body centres. C09 has no frame for this at all.
 *  - populated          (C09) - summary, misconception, flags, class mastery,
 *    recommendations.
 *  - quiet week         (C14 A2) - a mature class with nothing flagged. The
 *    absence of flags is a positive state, so those sections are REMOVED
 *    rather than given empty-state copy, and a "Looking ahead" forward-look
 *    takes their place.
 *  - sparse / new class (C09) - one calm card, no sections.
 */

const SECTION_H3 =
  "mt-[26px] text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:mt-[34px] xl:text-sm";

const CHEVRON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export function InsightsView() {
  // C14 A3: nothing is selected on arrival, so this is nullable by contract.
  const [classId, setClassId] = useState<string | null>(null);
  // The selector offers the teacher's real classes, not the fixture three.
  const { options: classes, live, sample, loading } = useTeacherClasses();
  // A live class reads from the intelligence endpoints (see
  // `LiveClassInsights`); the fixtures back the designed screens only.
  //
  // `sample` and `loading` are read here because this screen was the LAST
  // consumer still deciding on `live` alone, and the two bugs that causes are
  // both live on a screen a teacher makes decisions from:
  //
  //  - while the class read is in flight, `live` is already false, so the
  //    selector offered the fixture three - JSS 2A, JSS 2B, SSS 1 - to a
  //    teacher who has none of them.
  //  - when the read FAILS, this rendered invented misconceptions, mastery and
  //    recommendations for those classes with no notice of any kind, and
  //    without a `data-nevo-sample` mark, so the signed-in end-to-end
  //    assertion could not catch it either.
  //
  // `ClassesList` carries the same guard and says the same thing; this is its
  // sibling, missed when that one was fixed because the shape here is a
  // ternary rather than an `&&`.
  const selectable = loading ? [] : classes;
  const picked = classId ? selectable.find((c) => c.id === classId) : null;
  const data =
    classId && !live && !loading ? getClassInsights(classId) : null;
  const liveClass = live && picked ? picked : null;

  const pills = (
    <div className="flex gap-2">
      {/* The fixture three are marked where they are offered, not only once
          one is picked: the landing is where the wrong choice gets made.

          NOT WHILE THE READ IS IN FLIGHT. `!live` is already true then, so
          an empty row of pills was marked as sample data - nothing invented
          on screen, and the mark said otherwise. This page draws no skeleton
          while it waits, so the signed-in sweep checked straight away and,
          whenever the backend was slow, failed every lane's run (8 Oct). */}
      <MaybeSample showing={!live && !loading} kind="teacher:insights-classes">
      {selectable.map((c) => {
        const on = c.id === classId;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => setClassId(c.id)}
            className={cn(
              "cursor-pointer rounded-full px-[13px] py-[7px] text-[12.5px] font-medium transition-[filter,background-color] xl:px-[15px] xl:py-2 xl:text-[13.5px]",
              on
                ? "bg-nevo-navy text-nevo-cream hover:brightness-[1.06]"
                : "border border-nevo-near-black/8 bg-nevo-cream-elevated text-nevo-near-black/72 hover:brightness-[0.985]",
            )}
          >
            {c.name}
          </button>
        );
      })}
      </MaybeSample>
    </div>
  );

  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-4 xl:gap-5">
      <h1 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
        Insights
      </h1>
      {pills}
    </div>
  );

  /*
   * Shown in BOTH shells. The first draft put it only in the populated return,
   * so a teacher whose class read failed and who had not yet picked a class -
   * which is the state they LAND on - saw the fixture three in the selector
   * with nothing saying they were samples. The warning has to reach the screen
   * where the wrong choice gets made.
   */
  const sampleNotice = sample ? (
    <p className="mt-3 max-w-[620px] text-[13px] leading-[1.5] text-nevo-near-black/60 italic">
      We couldn&rsquo;t reach your school just now, so these are sample classes
      and sample insights, not your week.
    </p>
  ) : null;

  // ---- C14 A3: no class selected. The shell itself changes shape - the
  // header stops scrolling and the body centres in the viewport. ----
  if (!data && !liveClass) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <div className="shrink-0 px-[38px] pt-[34px] xl:px-[52px] xl:pt-11">
          {heading}
          {sampleNotice}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-12 pb-10 text-center">
          <IllustrationWrapper
            src="/illustrations/empty-insights-select.png"
            alt="Two overlapping circles"
            width={512}
            height={512}
            className="w-[190px] xl:w-[220px]"
          />
          {/*
            "Pick one of your classes above" with no classes above: while the
            list loads, and for a teacher who has none. Loading claims
            nothing; no classes says the classes list's own sentence.
          */}
          {loading ? null : live && classes.length === 0 ? (
            <>
              <h3 className="mt-[22px] text-xl font-semibold tracking-[-0.01em] text-nevo-near-black xl:mt-6 xl:text-[21px]">
                Your classes will appear here once assigned
              </h3>
              <p className="mt-2 max-w-[360px] text-[15px] leading-[1.55] text-nevo-near-black/62 xl:text-[15.5px]">
                This usually happens before your first sign-in. If it&rsquo;s
                taking a while, your school admin can set it up.
              </p>
            </>
          ) : (
          <>
          <h3 className="mt-[22px] text-xl font-semibold tracking-[-0.01em] text-nevo-near-black xl:mt-6 xl:text-[21px]">
            Select a class to see insights
          </h3>
          <p className="mt-2 max-w-[340px] text-[15px] leading-[1.55] text-nevo-near-black/62 xl:max-w-[360px] xl:text-[15.5px]">
            <span className="xl:hidden">
              Pick one of your classes above to see how the week is going.
            </span>
            <span className="hidden xl:inline">
              Pick one of your classes above and Nevo will show you how the
              week is going.
            </span>
          </p>
          </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="xl:mx-auto xl:max-w-[920px]">
        {heading}

        {liveClass && (
          <LiveClassInsights
            key={liveClass.id}
            classId={liveClass.id}
            className={liveClass.name}
          />
        )}

        {sampleNotice}

        {/* ---- C09 sparse: one calm card, nothing else ---- */}
        {data && (
        <SampleRegion kind="teacher:insights">
        {(data.sparse ? (
          <div className="mt-8 flex max-w-[640px] items-start gap-4 rounded-[12px] bg-nevo-cream-elevated p-7 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <span className="mt-px size-[22px] shrink-0 text-nevo-violet xl:size-6">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-full">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </span>
            <div>
              <h3 className="text-[17px] font-semibold text-nevo-near-black xl:text-lg">
                {`Still gathering insights for ${data.className}`}
              </h3>
              <p className="mt-[7px] text-[14.5px] leading-[1.55] text-nevo-near-black/68 xl:mt-2 xl:text-[15px]">
                This class started recently. Once students have a few sessions
                behind them, flags, recommendations and patterns will appear
                here.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ---- This week ---- */}
            <div className="mt-[18px] rounded-[12px] bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-[22px] xl:px-[26px] xl:py-6">
              <div className="flex items-center gap-[9px]">
                {/* The lightbulb is desktop-only in the frame. */}
                <span className="hidden text-nevo-navy xl:inline-flex">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z" />
                    <path d="M10 20h4" />
                  </svg>
                </span>
                <h3 className="text-[13px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:text-sm">
                  {`This week in ${data.className}`}
                </h3>
              </div>
              <p className="mt-3 text-[14.5px] leading-[1.6] text-nevo-near-black/82 xl:hidden">
                {data.summaryTablet}
              </p>
              <p className="mt-3.5 hidden text-base leading-[1.65] text-nevo-near-black/82 xl:block">
                {data.summaryDesktop?.map((s, i) =>
                  s.strong ? (
                    <strong key={i} className="font-semibold text-nevo-near-black">
                      {s.t}
                    </strong>
                  ) : (
                    <span key={i}>{s.t}</span>
                  ),
                )}
              </p>
            </div>

            {/* ---- Misconception callout ---- */}
            {data.misconception && (
              <div className="mt-3.5 flex items-start gap-[11px] rounded-[12px] border border-nevo-violet/20 bg-nevo-violet/8 px-4 py-3.5 xl:mt-4 xl:gap-3 xl:px-[18px] xl:py-4">
                <span className="mt-px size-[17px] shrink-0 text-nevo-violet xl:size-[18px]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-full">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 11v5M12 8h.01" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-nevo-navy xl:text-[15px]">
                    {data.misconception.title}
                  </div>
                  <p className="mt-[5px] text-sm leading-[1.5] text-nevo-near-black xl:text-[14.5px] xl:leading-[1.55]">
                    <span className="xl:hidden">{data.misconception.tablet}</span>
                    <span className="hidden xl:inline">
                      {data.misconception.desktop}
                    </span>
                  </p>
                  {/* Destination is unspecified by the frame - the class
                      roster is the honest target. Flagged to design. */}
                  <Link
                    href={data.misconception.href}
                    className="mt-2 inline-block cursor-pointer text-[12.5px] font-semibold text-nevo-violet xl:mt-[9px] xl:text-[13px]"
                  >
                    View students
                  </Link>
                </div>
              </div>
            )}

            {/* ---- Flags. When nothing fired the heading goes too: per C14
                    A2 a quiet week is a positive state, not an empty one. ---- */}
            {data.flags && data.flags.length > 0 && (
              <>
                <h3 className={SECTION_H3}>Flags</h3>
                <div className="mt-3.5 flex flex-col gap-3 xl:mt-4">
                  {data.flags.map((f) => (
                    <Link
                      key={f.name}
                      href={f.href}
                      className="relative flex cursor-pointer gap-3.5 rounded-[12px] bg-nevo-cream-elevated py-4 pr-[18px] pl-[22px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-[filter,transform] hover:brightness-[0.985] active:scale-[0.99] xl:gap-4 xl:py-5 xl:pr-[22px] xl:pl-[26px]"
                    >
                      <span
                        className={cn(
                          "absolute top-3.5 bottom-3.5 left-0 w-[3px] rounded-full",
                          f.isSudden ? "bg-nevo-navy" : "bg-nevo-violet",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-[9px]">
                          {f.isSudden && (
                            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M12 5v9" />
                                <path d="M8 11l4 4 4-4" />
                              </svg>
                            </span>
                          )}
                          <span className="text-[15px] font-semibold text-nevo-near-black xl:text-base">
                            {f.name}
                          </span>
                        </span>
                        <span className="mt-1.5 block text-sm leading-[1.5] text-nevo-near-black/78 xl:mt-[7px] xl:text-[15px]">
                          {f.note}
                        </span>
                      </span>
                      {/* The chevron is desktop-only in the frame. */}
                      <span className="hidden shrink-0 self-center text-nevo-near-black/40 xl:block">
                        {CHEVRON}
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}

            {/* ---- Where the class stands ---- */}
            {data.concepts && data.concepts.length > 0 && (
              <>
                <h3 className={SECTION_H3}>Where the class stands</h3>
                <p className="mt-2 text-[13.5px] leading-[1.5] text-nevo-near-black/60 xl:max-w-[660px] xl:text-sm xl:leading-[1.55]">
                  <span className="xl:hidden">
                    Class average per concept, on two tracks. A gap points to
                    the text, not the maths.
                  </span>
                  <span className="hidden xl:inline">
                    Class average for each concept, on two tracks:
                    understanding, and the reading load underneath it. When the
                    two pull apart, it&apos;s usually the text, not the maths.
                  </span>
                </p>
                <div className="mt-3.5 flex flex-col gap-5 rounded-[12px] bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-4 xl:gap-[22px] xl:px-[26px] xl:py-6">
                  {data.concepts.map((c) => (
                    <div key={c.name}>
                      <MasteryDualTrack
                        concept={c.name}
                        understanding={c.u}
                        reading={c.r}
                        flag="none"
                      />
                      {hasGap(c) && (
                        <div className="mt-[9px] text-[12.5px] text-nevo-violet xl:mt-2.5 xl:text-[13px]">
                          {`Reading may be affecting results in ${c.name}`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ---- Recommendations ---- */}
            {data.recommendations && data.recommendations.length > 0 && (
              <>
                <h3 className={SECTION_H3}>Recommendations</h3>
                <div className="mt-3.5 flex flex-col gap-[11px] xl:mt-4 xl:grid xl:grid-cols-2 xl:gap-3.5">
                  {data.recommendations.map((r) => (
                    <Link
                      key={r.name}
                      href={r.href}
                      className="flex cursor-pointer flex-col rounded-[12px] bg-nevo-cream-elevated px-[18px] py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-[filter,transform] hover:brightness-[0.985] active:scale-[0.99] xl:px-[22px] xl:py-5"
                    >
                      <span className="text-[14.5px] font-semibold text-nevo-navy xl:text-[15px]">
                        {r.name}
                      </span>
                      <span className="mt-1.5 flex-1 text-sm leading-[1.5] text-nevo-near-black/78 xl:mt-2 xl:text-[15px]">
                        {r.text}
                      </span>
                      <span className="mt-2.5 block text-[13px] font-semibold text-nevo-navy xl:mt-3 xl:text-[13.5px]">
                        {`${r.action} →`}
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}

            {/* ---- C14 A2: the forward look on a quiet week ---- */}
            {data.lookingAhead && (
              <>
                <h3 className={SECTION_H3}>Looking ahead</h3>
                <div className="mt-3.5 rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-cream-elevated px-5 py-[18px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-4 xl:max-w-[660px] xl:px-6 xl:py-[22px]">
                  <p className="text-[14.5px] leading-[1.6] text-nevo-near-black/82 xl:text-[15.5px]">
                    <span className="xl:hidden">{data.lookingAhead.tablet}</span>
                    <span className="hidden xl:inline">
                      {data.lookingAhead.desktop}
                    </span>
                  </p>
                </div>
              </>
            )}
            </>
          ))}
        </SampleRegion>
        )}
      </div>
    </div>
  );
}
