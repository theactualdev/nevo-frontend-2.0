"use client";

import { ReportsViews } from "./ReportsViews";
import { useCallback, useEffect, useState } from "react";
import { analyticsApi, type CohortIndicator, type CohortTransformation } from "@/lib/api/analytics";
import { schoolApi } from "@/lib/api/school";
import { cn } from "@/lib/utils";
import { NoAccess, failureKind } from "../NoAccess";
import { ReadFailed } from "../ReadFailed";
import { CARD } from "../Roster/primitives";
import { acrossLine, comparisonLine, figure } from "./transformationLines";

/**
 * D26 School Transformation, under Reports (SCRUM-163) - BUILT REDUCED, WITH
 * HONEST NAMES, and the names are RULED (Lydia, 7 Oct): "Lessons seen
 * through", "Time to finish a lesson" and "Changing format" stay. Nothing
 * here may state a quantity or a claim the backend did not send. Design is
 * taking the construct names out of the frame, so D26 will match this page.
 *
 * D26 draws four indices: Self-Regulation Index, Metacognitive Calibration,
 * Conceptual Flexibility and Active Learning Efficiency, each described as the
 * construct. Backend computes narrower things and says so in its own code -
 * each figure "is named for what it measures rather than for the construct":
 *
 *   selfRegulation  the share of lessons started that were finished
 *   efficiency      the average minutes a finished lesson took
 *   flexibility     counts of format changes (chose / took a suggestion /
 *                   stayed as they were) - format, not transfer to new contexts
 *   calibration     not measurable; returned as unavailable, with why
 *
 * Under D26's names a proprietor would read a completion rate as a measure of
 * self-regulation and quote it. So each card is named for what it measures,
 * Calibration comes off the page as D26 itself allows ("if one can't be
 * computed... it comes off the page").
 *
 * NOTHING IS COMPUTED HERE. Every figure is the server's as it came; "+3 this
 * month" would be our subtraction, so the comparison names the earlier figure
 * and the server's own better-or-behind.
 *
 * SCHOOL-WIDE ONLY, and below the reporting floor nothing at all: the server
 * nulls the figures and says why, and that sentence is shown as it stands.
 */

type Phase = "loading" | "ready" | "failed" | "denied";

export function SchoolTransformationView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<CohortTransformation | null>(null);

  const fetchAll = useCallback(
    () =>
      schoolApi
        .get()
        .then((school) => analyticsApi.getSchoolTransformation(school.id))
        .then((t) => {
          setData(t);
          setPhase("ready");
        })
        .catch((err: unknown) => setPhase(failureKind(err))),
    [],
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const retry = () => {
    setPhase("loading");
    fetchAll();
  };

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[880px]">
        <ReportsViews current="transformation" />
        <h2 className="m-0 mt-6 text-[27px] font-semibold tracking-[-0.018em] text-nevo-near-black">
          School transformation
        </h2>
        <p className="mt-2 max-w-[640px] text-[15px] leading-[1.55] text-nevo-near-black/62">
          How your school is changing, four weeks at a time. Every figure here
          is school-wide &ndash; across all your students, never a score about
          one child.
        </p>

        {phase === "loading" ? (
          <div className={cn(CARD, "mt-6 h-[260px] animate-pulse")} />
        ) : phase === "denied" ? (
          <NoAccess className="mt-6" what="your school's figures" />
        ) : phase === "failed" || !data ? (
          <ReadFailed className="mt-6" what="your school's figures" onRetry={retry} />
        ) : (
          <Figures data={data} />
        )}
      </div>
    </div>
  );
}

function Figures({ data }: { data: CohortTransformation }) {
  if (data.suppressed) {
    return (
      <div className={cn(CARD, "mt-6 px-[26px] py-6")}>
        <p className="m-0 max-w-[62ch] text-[14.5px] leading-[1.6] text-nevo-near-black/72">
          {data.message?.trim() ||
            "There aren’t enough students here yet for school-wide figures, so Nevo doesn’t show any."}
        </p>
      </div>
    );
  }

  const flexibility = data.flexibility?.dimensions.filter((d) => d.labels.length > 0) ?? [];
  const nothing = !data.selfRegulation && !data.efficiency && flexibility.length === 0;
  if (nothing) {
    // D20's own "still gathering" words: the school is not empty, the window is.
    return (
      <div className={cn(CARD, "mt-6 px-[26px] py-6")}>
        <h3 className="m-0 text-[16px] font-semibold text-nevo-near-black">
          Still gathering your school&rsquo;s picture
        </h3>
        <p className="m-0 mt-2 max-w-[62ch] text-[14px] leading-[1.6] text-nevo-near-black/66">
          There aren&rsquo;t enough lessons in the last four weeks yet. It fills
          in on its own as your students keep learning &ndash; nothing to set up.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {data.selfRegulation ? (
          <IndicatorTile
            label="Lessons seen through"
            indicator={data.selfRegulation}
            unit="%"
            body="Of the lessons your students started in the last four weeks, the share they finished."
          />
        ) : null}
        {data.efficiency ? (
          <IndicatorTile
            label="Time to finish a lesson"
            indicator={data.efficiency}
            unit=" min"
            body="How long, on average, a lesson your students finished took them in the last four weeks."
          />
        ) : null}
        {data.flexibility && flexibility.length > 0 ? (
          <div className={cn(CARD, "px-[26px] py-6")}>
            <span className="text-[12px] font-semibold tracking-[0.05em] text-nevo-violet-text uppercase">
              Changing format
            </span>
            {flexibility.map((series, i) => (
              <ul
                key={i}
                aria-label="Changing format"
                className="m-0 mt-3 flex list-none flex-col gap-2 p-0"
              >
                {series.labels.map((label, j) => (
                  <li key={label} className="flex items-baseline justify-between gap-4 text-[14.5px]">
                    <span className="text-nevo-near-black/72">{label}</span>
                    <span className="font-semibold text-nevo-navy tabular-nums">
                      {series.values[j] !== undefined ? figure(series.values[j]) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ))}
            <p className="m-0 mt-3.5 text-[14px] leading-[1.55] text-nevo-near-black/66">
              Times in the last four weeks a student changed how a lesson was
              shown, or kept it as it was.
            </p>
            <p className="m-0 mt-2 text-[12.5px] text-nevo-near-black/50">
              {acrossLine(data.flexibility.learnerCount)}
            </p>
          </div>
        ) : null}
      </div>
      <p className="m-0 mt-5 max-w-[66ch] text-[13px] leading-[1.6] text-nevo-near-black/55">
        Each comparison is with the four weeks before. With fewer than{" "}
        {figure(data.reportingFloor)} students, Nevo shows no school-wide
        figures at all.
      </p>
    </>
  );
}

function IndicatorTile({
  label,
  indicator,
  unit,
  body,
}: {
  label: string;
  indicator: CohortIndicator;
  unit: string;
  body: string;
}) {
  const compared = comparisonLine(indicator, unit);
  return (
    <div className={cn(CARD, "px-[26px] py-6")}>
      <span className="text-[12px] font-semibold tracking-[0.05em] text-nevo-violet-text uppercase">
        {label}
      </span>
      <p className="m-0 mt-3 text-[40px] leading-none font-bold tracking-[-0.02em] text-nevo-navy">
        {figure(indicator.value)}
        <span className="text-[22px] font-semibold">{unit.trim()}</span>
      </p>
      {compared ? (
        <p className="m-0 mt-2 text-[13.5px] font-semibold text-nevo-navy">{compared}</p>
      ) : null}
      <p className="m-0 mt-3.5 text-[14px] leading-[1.55] text-nevo-near-black/66">{body}</p>
      <p className="m-0 mt-2 text-[12.5px] text-nevo-near-black/50">
        {acrossLine(indicator.learnerCount)}
      </p>
    </div>
  );
}
