"use client";

import Link from "next/link";
import { MasteryDualTrack } from "@/components/teacher/Student/MasteryDualTrack";
import { useClassInsights } from "@/hooks/useClassInsights";
import { cn } from "@/lib/utils";

/**
 * C09 Insights for a real class.
 *
 * THE WRITTEN WEEK IS LIVE (21 Sep). C09's summary and C14 A2's looking
 * ahead were recorded here as having no source; the endpoint has been
 * deployed since 15 Sep and nothing called it, so both screens that draw
 * this prose drew it from fixtures. They are the engine's words now.
 *
 * AND THE QUIET-WEEK READING IS THE ENGINE'S TOO. This screen used to be
 * handed an `empty` computed from three array lengths, which could not tell
 * a settled week from a new class - so a class having a good week was told
 * Nevo was still gathering insights about it. `state` says which, and the
 * two now read differently on purpose - in the ENGINE'S words. A line of our
 * own, "A settled week. Nothing here needs you.", sat under the engine's
 * prose and was in no frame; the contract says the engine owns that copy,
 * and C14 draws the settled wording inside it.
 *
 * THE HEADINGS ARE C09'S: "This week in {class}", "Flags" and "Where the
 * class stands" - the fixture screen next door has always used them. This
 * one had drifted to "Worth a look" and "How the class is doing", and gave
 * the written week no heading at all.
 *
 * The per-student recommendations still have no source and stay absent
 * rather than becoming invented prose about a real class.
 */

const SECTION_H =
  "mt-[26px] text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:mt-[34px] xl:text-sm";

/** C09's card chevron - desktop-only in the frame, as on the sample cards. */
const CHEVRON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

const DROP_GLYPH = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="xl:size-[13px]">
    <path d="M12 5v9" />
    <path d="M8 11l4 4 4-4" />
  </svg>
);

export function LiveClassInsights({
  classId,
  className,
}: {
  classId: string;
  className: string;
}) {
  const {
    misconceptions,
    concepts,
    flags,
    loading,
    failed,
    summary,
    lookingAhead,
    gathering,
    narrativeFailed,
    sectionFailed,
  } = useClassInsights(classId);
  /** The narrative failure line's own words, for a section that failed. */
  const sectionFailedLine = `We couldn${"\u2019"}t load this just now. Nothing has changed for ${className} - you can try again in a moment.`;

  if (loading) {
    return (
      <div className="mt-8 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[120px] animate-pulse rounded-[12px] bg-nevo-cream-elevated"
          />
        ))}
      </div>
    );
  }

  // A class we could not read is not a class with nothing to say. Saying
  // "still gathering insights" over three failed requests is an affirmative,
  // false claim about real children.
  if (failed) {
    return (
      <div className="mt-[26px] flex items-start gap-3.5 rounded-[12px] bg-nevo-cream-elevated p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-8 xl:max-w-[640px] xl:gap-4 xl:p-7">
        <span className="mt-px size-[22px] shrink-0 text-nevo-violet xl:size-6">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-full">
            <path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17.5 9.5 4 4 0 0 1 17 18" />
            <path d="M10 20.5l4-4M14 20.5l-4-4" />
          </svg>
        </span>
        <div>
          <h3 className="text-[17px] font-semibold text-nevo-near-black xl:text-lg">
            We couldn&rsquo;t load insights just now
          </h3>
          <p className="mt-[7px] text-[14.5px] leading-[1.55] text-nevo-near-black/68 xl:mt-2 xl:text-[15px]">
            {`This isn't about ${className} - we just couldn't reach Nevo. Try again in a moment.`}
          </p>
        </div>
      </div>
    );
  }

  if (gathering) {
    return (
      <div className="mt-[26px] flex items-start gap-3.5 rounded-[12px] bg-nevo-cream-elevated p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-8 xl:max-w-[640px] xl:gap-4 xl:p-7">
        <span className="mt-px size-[22px] shrink-0 text-nevo-violet xl:size-6">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-full">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
        <div>
          <h3 className="text-[17px] font-semibold text-nevo-near-black xl:text-lg">
            {`Still gathering insights for ${className}`}
          </h3>
          <p className="mt-[7px] text-[14.5px] leading-[1.55] text-nevo-near-black/68 xl:mt-2 xl:text-[15px]">
            Once students have a few sessions behind them, patterns and
            anything worth a look will appear here.
          </p>
        </div>
      </div>
    );
  }

  const lead = [...misconceptions].sort(
    (a, b) => b.studentCount - a.studentCount,
  )[0];

  return (
    <>
      {summary && (
        <div className="mt-[18px] rounded-[12px] bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-[22px] xl:max-w-[760px] xl:px-[26px] xl:py-6">
          <div className="flex items-center gap-2">
            {/* The lightbulb is desktop-only in the frame. */}
            <span className="hidden text-nevo-navy xl:inline-flex">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z" />
                <path d="M10 20h4" />
              </svg>
            </span>
            <h3 className="text-[13px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:text-sm">
              {`This week in ${className}`}
            </h3>
          </div>
          <p className="mt-3 text-[14.5px] leading-[1.6] text-nevo-near-black/82 xl:text-[15.5px]">
            {summary}
          </p>
        </div>
      )}

      {/* The written week failed on its own, and the sections below it did
          not. Saying nothing would let an empty screen read as a quiet
          class, which is the claim this hook exists to stop making. */}
      {/* AND WHEN THEY DID NOT (T158). This spoke only over an empty screen,
          so a failed summary above real sections simply went missing - the
          section a teacher reads first, gone without a word. */}
      {narrativeFailed && (
        <p className="mt-[18px] max-w-[660px] text-[14.5px] leading-[1.55] text-nevo-near-black/68">
          {`We couldn${"\u2019"}t load this week${"\u2019"}s summary for ${className}. Nothing has changed for the class - you can try again in a moment.`}
        </p>
      )}

      {lead && (
        <div className="mt-[18px] rounded-[12px] bg-nevo-violet/14 px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-[22px] xl:px-[26px] xl:py-6">
          <span className="text-[11px] font-bold tracking-[0.14em] text-nevo-navy uppercase">
            A shared sticking point
          </span>
          <h3 className="mt-2 text-[17px] font-semibold text-nevo-near-black xl:text-lg">
            {lead.conceptName}
          </h3>
          <p className="mt-[7px] max-w-[68ch] text-[14.5px] leading-[1.6] text-nevo-near-black/78 xl:text-[15px]">
            {lead.description}
          </p>
          <p className="mt-2 text-[13px] text-nevo-near-black/55">
            {`${lead.studentCount} ${lead.studentCount === 1 ? "student" : "students"} · ${lead.pattern}`}
          </p>
        </div>
      )}

      {/* A FAILED READ OF THE STICKING POINTS SAID NOTHING (T158), where the
          flags and mastery sections each say so under their own heading. The
          frame's own label for this section, and the same line as theirs. */}
      {misconceptions.length === 0 && sectionFailed.misconceptions && (
        <>
          <h3 className={SECTION_H}>A shared sticking point</h3>
          <p className="mt-3 max-w-[660px] text-[14.5px] leading-[1.55] text-nevo-near-black/68">
            {sectionFailedLine}
          </p>
        </>
      )}

      {misconceptions.length > 1 && (
        <div className="mt-3 flex flex-col gap-2">
          {misconceptions.slice(1).map((m) => (
            <div
              key={m.conceptId}
              className="rounded-[10px] bg-nevo-cream-elevated px-[18px] py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            >
              <span className="text-[14.5px] font-semibold text-nevo-near-black">
                {m.conceptName}
              </span>
              <span className="ml-2 text-[13px] text-nevo-near-black/55">
                {`${m.studentCount} students · ${m.pattern}`}
              </span>
              <p className="mt-1 text-[13.5px] leading-[1.5] text-nevo-near-black/72">
                {m.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {flags.length === 0 && sectionFailed.flags && (
        <>
          <h3 className={SECTION_H}>Flags</h3>
          <p className="mt-3 max-w-[660px] text-[14.5px] leading-[1.55] text-nevo-near-black/68">
            {sectionFailedLine}
          </p>
        </>
      )}

      {flags.length > 0 && (
        <>
          <h3 className={SECTION_H}>Flags</h3>
          <div className="mt-3.5 flex flex-col gap-[11px] xl:gap-2">
            {flags.map((f) => (
              /* C09's cards open the student - the frame draws them
                 cursor:pointer, and the fixture's have always been links. The
                 live ones were plain boxes a teacher could only read. */
              <Link
                key={f.id}
                href={`/teacher/students/${f.studentId}`}
                className={cn(
                  "relative flex cursor-pointer gap-3.5 rounded-[12px] bg-nevo-cream-elevated py-4 pr-[18px] pl-[22px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-[filter] hover:brightness-[0.985] xl:gap-4",
                )}
              >
                <span
                  className={cn(
                    "absolute inset-y-3.5 left-0 w-[3px] rounded-full xl:inset-y-4",
                    f.isSudden ? "bg-nevo-navy" : "bg-nevo-violet",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {f.isSudden && (
                      <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream xl:size-5">
                        {DROP_GLYPH}
                      </span>
                    )}
                    <span className="text-[15px] font-semibold text-nevo-near-black">
                      {f.name ?? "One of your students"}
                    </span>
                  </span>
                  <span className="mt-1.5 block text-sm leading-[1.5] text-nevo-near-black/78 xl:text-[14.5px]">
                    {f.note}
                  </span>
                </span>
                {/* C09's chevron (T152): the card opens the student, and the
                    live one was the only one that did not say so. */}
                <span
                  data-chevron
                  className="hidden shrink-0 self-center text-nevo-near-black/40 xl:block"
                >
                  {CHEVRON}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {concepts.length === 0 && sectionFailed.mastery && (
        <>
          <h3 className={SECTION_H}>Where the class stands</h3>
          <p className="mt-3 max-w-[660px] text-[14.5px] leading-[1.55] text-nevo-near-black/68">
            {sectionFailedLine}
          </p>
        </>
      )}

      {concepts.length > 0 && (
        <>
          <h3 className={SECTION_H}>Where the class stands</h3>
          <p className="mt-2 hidden max-w-[62ch] text-[13px] leading-[1.5] text-nevo-near-black/60 xl:block">
            Each idea, and how much the reading itself is shaping the result.
          </p>
          <div className="mt-3.5 flex flex-col gap-5 rounded-[12px] bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-4 xl:px-[26px] xl:py-6">
            {concepts.map((c) => (
              <MasteryDualTrack
                key={c.conceptId}
                concept={c.name}
                understanding={c.understanding}
                reading={c.reading}
              />
            ))}
          </div>
        </>
      )}

      {lookingAhead && (
        <>
          {/* C14 A2's forward look, in the treatment the designed screen
              gives it: violet left rule, its own heading, below the week
              it follows from. The engine writes it. */}
          <h3 className={SECTION_H}>Looking ahead</h3>
          <div className="mt-3.5 rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-cream-elevated px-5 py-[18px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-4 xl:max-w-[660px] xl:px-6 xl:py-[22px]">
            <p className="text-[14.5px] leading-[1.6] text-nevo-near-black/82 xl:text-[15.5px]">
              {lookingAhead}
            </p>
          </div>
        </>
      )}

      <div className="mt-7">
        <Link
          href={`/teacher/classes/${classId}`}
          className="text-[14.5px] font-semibold text-nevo-navy hover:underline"
        >
          Open the class &rarr;
        </Link>
      </div>
    </>
  );
}
