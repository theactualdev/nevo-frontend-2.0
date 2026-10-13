"use client";

import { ReportsViews } from "./ReportsViews";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  analyticsApi,
  type OutcomePeriod,
  type SchoolConceptMastery,
  type SchoolHealth,
  type TransformationMetrics,
} from "@/lib/api/analytics";
import { cn } from "@/lib/utils";
import { ReadFailed } from "../ReadFailed";
import { CARD, PRIMARY_BTN } from "../Roster/primitives";
import { DualTrackBars, TrendLine, type DualTrackRow, type TrendPoint } from "./charts";
import { NoAccess, failureKind } from "../NoAccess";

/**
 * D20 Cohort Analytics (SCRUM-65) - the proprietor's proof that Nevo is
 * working.
 *
 * ============================================================================
 * THE SCREEN'S HEADLINE METRIC DOES NOT EXIST, so this is not the screen D20
 * draws. That needs saying plainly rather than being discovered later.
 *
 * D20 and D15b are built on FOUR TRANSFORMATION INDICES:
 *     Self-Regulation Index · Metacognitive Calibration ·
 *     Conceptual Flexibility · Active Learning Efficiency
 * with the growth chart being "Self-Regulation Index, cohort average, week by
 * week" and the headline reading "+8 points since April".
 *
 * `GET /api/transformation-metrics`, which this screen reads, returns VOLUMES -
 * how much adapting happened, not how a cohort is growing.
 *
 * SINCE 7 OCT THREE SCHOOL-WIDE FIGURES EXIST, in the view beside this one
 * under Reports (D26, `SchoolTransformationView`; see `ReportsViews`) - and under
 * honest names, because backend computes narrower things than D26's titles:
 * the share of started lessons finished, the minutes a finished lesson took,
 * and counts of format changes. Calibration is not measurable at all. None is
 * a series, so the week-by-week growth chart D20 draws still has nothing to
 * plot.
 *
 * Inventing an index from the counters would be the worst option available: a
 * proprietor would read a number called Self-Regulation, quote it to a parent
 * or an investor, and it would mean nothing. So the four cards are ABSENT, and
 * what ships is what the school's data genuinely supports:
 *
 *   - participation and completion, as counts and as a trend
 *   - how much Nevo is adapting, labelled as volume
 *   - dual-track mastery across every concept, which is the one genuinely
 *     diagnostic thing here: where understanding runs ahead of reading, the
 *     barrier is the text
 *
 * Building the four indices needs backend to define and compute them. That is
 * the ask, and it is a product question before it is an engineering one.
 * ============================================================================
 *
 * TODO(api): D20's headline section, "Same objective · different journeys" -
 * three anonymised learners on one objective showing genuinely different
 * content sequences - is not built. Two things about it are true and one
 * sentence that used to sit here was not.
 *
 * "THE JOIN DOES NOT EXIST" WAS FALSE, and it read as the reason this was
 * impossible rather than merely unbuilt. `ConceptResponse.lessonId` plus
 * `GET /api/admin/adaptation-log?lessonId=` joins a concept to per-learner
 * adaptation rows, and `GET /api/intelligence/scaffolds/history/{id}
 * ?concept_id=` joins the other way. What survives:
 *
 *   1. There is no OBJECTIVE entity anywhere in the contract, so the panel
 *      would key on a CONCEPT (`name` + `subject`), not an objective.
 *   2. The real gap is granularity and anonymity. `AdaptationEventLogRow` has
 *      no `segmentId` and no `modality`, so the frame's per-segment route
 *      strip cannot be drawn from history; and `studentFirstName` is REQUIRED
 *      on every row, so there is no anonymised feed to build three unnamed
 *      journeys from. On this screen that second one is disqualifying by
 *      itself - AGGREGATE ONLY is the boundary, not a preference.
 *
 * So an event-level version is buildable and an anonymised segment-level one
 * is not. This is the ticket's stated headline, so it is the second ask after
 * the indices.
 *
 * TODO(api): D9 Reports - the report list with PDF/CSV export - shares this
 * route and has no endpoint at all. Still blocked.
 *
 * THREE CONTROLS SCRUM-65 LOCKS AS DECIDED ARE NOT BUILT, and this docblock -
 * exhaustive about everything else on the screen - never said so. Recorded
 * here rather than built, because each needs a parameter no deployed endpoint
 * accepts:
 *
 *   - A COHORT SELECTOR. The ticket settles it as year group or class, and
 *     every read behind this screen (`transformationMetrics`, `schoolHealth`,
 *     `conceptMastery`) is school-wide with no cohort parameter at all. There
 *     is no client-side narrowing either: the responses are already
 *     aggregated, so there are no per-learner rows to group.
 *   - A TIME RANGE. `OutcomePeriod` is the only period control anywhere in
 *     this lane, and it governs the outcomes card alone - the rest of the
 *     screen has no date filter, so a range control at the top would change
 *     one panel and silently not the others, which is worse than none.
 *   - COMPARISON AGAINST A PREVIOUS PERIOD, which needs the same thing the
 *     indices need: a series, not a point.
 *
 * All three are the same ask as the indices above rather than separate work,
 * and none is a rendering gap. What matters is that their absence is stated:
 * a proprietor looking for "how is JSS 2 doing" should not have to conclude
 * from an empty toolbar that nobody thought of it.
 *
 * AGGREGATE ONLY. Nothing on this screen names a student or can be narrowed to
 * one. That boundary is what keeps cohort analytics inside admin scope.
 */

type Phase = "loading" | "ready" | "failed" | "denied";

/*
 * ~~const MIN_PERIODS = 3~~ - "enough of a picture to be worth drawing a
 * trend through". Removed 30 Sep: it was a sufficiency threshold this console
 * invented (architecture rule 3), and it hid a school's first two periods
 * behind "There aren't enough lessons yet to show a trend with confidence" -
 * a judgement nothing in the contract makes. The chart draws one point or two
 * perfectly well; the nothing-state is for nothing.
 */

/** How many concepts show before "Show all" - a display cap, never a ranking. */
const CONCEPTS_SHOWN = 8;

function formatPeriod(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function ReportsView() {
  const [phase, setPhase] = useState<Phase>("loading");
  // The outcomes read has its own failure: without it the trend card claims
  // the SCHOOL has not taught enough, which is a statement about them.
  const [outcomesFailed, setOutcomesFailed] = useState(false);
  const [health, setHealth] = useState<SchoolHealth | null>(null);
  const [outcomes, setOutcomes] = useState<OutcomePeriod[]>([]);
  const [mastery, setMastery] = useState<SchoolConceptMastery[]>([]);
  const [transformation, setTransformation] = useState<TransformationMetrics | null>(null);
  /*
   * Their own failures, like the outcomes read. Both were `.catch(() =>
   * undefined)`, so a failed read looked exactly like an empty one and the
   * section silently disappeared - an admin could not tell "nothing yet" from
   * "we could not ask".
   */
  const [masteryFailed, setMasteryFailed] = useState(false);
  const [transformationFailed, setTransformationFailed] = useState(false);

  const load = useCallback(() => {
    // School health answers first because it carries the schoolId the other
    // two reads need.
    analyticsApi
      .getSchoolHealth()
      .then((h) => {
        setHealth(h);
        setPhase("ready");
        setOutcomesFailed(false);
        analyticsApi
          .getOutcomes({ schoolId: h.schoolId })
          .then((o) => {
            setOutcomes(o.outcomes);
            setOutcomesFailed(false);
          })
          .catch(() => setOutcomesFailed(true));
        analyticsApi
          .getSchoolMastery(h.schoolId)
          .then((m) => {
            setMastery(m);
            setMasteryFailed(false);
          })
          .catch(() => setMasteryFailed(true));
        analyticsApi
          .getTransformationMetrics()
          .then((t) => {
            setTransformation(t);
            setTransformationFailed(false);
          })
          .catch(() => setTransformationFailed(true));
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(
    () => [...outcomes].sort((a, b) => a.period.localeCompare(b.period)),
    [outcomes],
  );

  const completionPoints: TrendPoint[] = useMemo(
    () =>
      sorted.map((p) => ({
        label: formatPeriod(p.period),
        value: p.completionRate,
        display: `${Math.round(p.completionRate * 100)}%`,
      })),
    [sorted],
  );

  const adaptationPoints: TrendPoint[] = useMemo(
    () =>
      sorted.map((p) => ({
        label: formatPeriod(p.period),
        value: p.averageAdaptations,
        display: p.averageAdaptations.toFixed(1),
      })),
    [sorted],
  );

  /*
   * THE SERVER'S ORDER, AND NOTHING RANKED. This sorted concepts by a gap it
   * computed (concept minus reading) and kept the top eight - a score and a
   * selection the console made up, which architecture rule 3 forbids. The
   * school mastery read carries no attribution; the engine has not said any
   * concept's reading is "the barrier", so the screen does not either.
   */
  const masteryRows: DualTrackRow[] = useMemo(
    () =>
      mastery.map((m) => ({
          key: m.conceptId,
          label: m.conceptName ?? "Unnamed concept",
          concept: m.masteryProbabilityConcept,
          reading: m.masteryProbabilityReading,
          meta: `${m.studentCount} ${m.studentCount === 1 ? "learner" : "learners"}`,
        })),
    [mastery],
  );

  const enoughForTrend = sorted.length > 0;
  const [allConcepts, setAllConcepts] = useState(false);
  const shownConcepts = allConcepts
    ? masteryRows
    : masteryRows.slice(0, CONCEPTS_SHOWN);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[880px]">
        <ReportsViews current="cohort" />
        <h2 className="m-0 mt-6 text-[28px] font-semibold tracking-[-0.018em] text-nevo-near-black">
          Cohort analytics
        </h2>
        <p className="mt-1.5 max-w-[62ch] text-[14.5px] leading-[1.6] text-nevo-near-black/62">
          How your school is using Nevo, and how understanding and reading
          are going, concept by concept. Everything here is school-wide - no
          individual learner appears on this screen.
        </p>

        {phase === "loading" ? (
          <div className={cn(CARD, "mt-7 h-[360px] animate-pulse")} />
        ) : null}

        {phase === "denied" ? (
          <NoAccess what="reports" />
        ) : phase === "failed" ? (
          <div className={cn(CARD, "mt-7 px-[26px] py-7")}>
            <h3 className="text-[17px] font-semibold text-nevo-near-black">
              We couldn&rsquo;t load your analytics
            </h3>
            <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
              Nothing has changed - this is only about showing them to you. Try
              again in a moment.
            </p>
            <button
              type="button"
              onClick={() => {
                setPhase("loading");
                load();
              }}
              className={cn(PRIMARY_BTN, "mt-5")}
            >
              Try again
            </button>
          </div>
        ) : null}

        {phase === "ready" && health ? (
          <>
            {/* Stat tiles: label, value, no delta - there is no prior period
                on this route to compare against. */}
            <div className="mt-7 grid grid-cols-4 gap-3.5 max-lg:grid-cols-2">
              <Stat label="Students" value={health.studentCount.toLocaleString()} />
              <Stat
                label="Active this month"
                value={health.activeStudentsLast30Days.toLocaleString()}
              />
              <Stat
                label="Lessons completed"
                value={health.completedLessonSessions.toLocaleString()}
              />
              <Stat
                label="Taking part"
                value={`${Math.round(health.participationRate * 100)}%`}
              />
            </div>

            {enoughForTrend ? (
              <>
                <div className={cn(CARD, "mt-6 px-6 py-[26px]")}>
                  <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
                    Lessons finished
                  </h3>
                  <p className="m-0 mt-1 text-[13px] text-nevo-near-black/58">
                    The share of started lessons that got finished, period by
                    period.
                  </p>
                  <div className="mt-5">
                    <TrendLine
                      points={completionPoints}
                      max={1}
                      ariaLabel="Completion rate over time"
                    />
                  </div>
                </div>

                {/* A second chart, never a second axis on the first. */}
                <div className={cn(CARD, "mt-5 px-6 py-[26px]")}>
                  <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
                    How often Nevo adapted
                  </h3>
                  <p className="m-0 mt-1 text-[13px] text-nevo-near-black/58">
                    Average adaptations per session. This is a volume, not a
                    score - more is not automatically better.
                  </p>
                  <div className="mt-5">
                    <TrendLine
                      points={adaptationPoints}
                      max={Math.max(1, ...adaptationPoints.map((p) => p.value)) * 1.15}
                      ariaLabel="Average adaptations per session over time"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className={cn(CARD, "mt-6 px-6 py-12 text-center")}>
                {outcomesFailed ? (
                  <ReadFailed
                    className="mx-auto max-w-[48ch]"
                    what="this cohort's lesson outcomes"
                    onRetry={load}
                  />
                ) : (
                  <>
                    <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
                      Still gathering this cohort&rsquo;s picture
                    </h3>
                    <p className="mx-auto mt-2 max-w-[48ch] text-sm leading-[1.6] text-nevo-near-black/62">
                      No lessons have finished yet, so there&rsquo;s nothing to
                      chart. It fills in on its own as your school starts
                      learning &ndash; nothing to set up.
                    </p>
                  </>
                )}
              </div>
            )}

            {masteryFailed ? (
              <div className={cn(CARD, "mt-5 px-6 py-[22px]")}>
                <ReadFailed what="understanding and reading by concept" onRetry={load} />
              </div>
            ) : null}
            {transformationFailed ? (
              <div className={cn(CARD, "mt-5 px-6 py-[22px]")}>
                <ReadFailed what="how much Nevo adapted" onRetry={load} />
              </div>
            ) : null}

            {masteryRows.length > 0 ? (
              <div className={cn(CARD, "mt-5 px-6 py-[26px]")}>
                {/*
                  * WAS "Where the reading is getting in the way", with "Where
                  * the two part company, the barrier is the text". That is a
                  * diagnosis, and the school mastery read carries none - it
                  * reports two tracks, not which one is in the way. The
                  * tracks stay; the verdict goes until the engine gives one.
                  */}
                <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
                  Understanding and reading, concept by concept
                </h3>
                <p className="m-0 mb-5 mt-1 max-w-[62ch] text-[13px] leading-[1.6] text-nevo-near-black/58">
                  Two tracks for each concept across the school: how well
                  learners understand the idea, and how well they handle the
                  reading the material asks of them.
                </p>
                <DualTrackBars rows={shownConcepts} />
                {masteryRows.length > CONCEPTS_SHOWN ? (
                  <button
                    type="button"
                    onClick={() => setAllConcepts((v) => !v)}
                    className="mt-5 cursor-pointer text-[13px] font-semibold text-nevo-navy hover:opacity-75"
                  >
                    {allConcepts
                      ? "Show fewer"
                      : `Show all ${masteryRows.length} concepts`}
                  </button>
                ) : null}
              </div>
            ) : null}

            {transformation ? (
              <div className={cn(CARD, "mt-5 px-6 py-[26px]")}>
                <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
                  How much Nevo adapted
                </h3>
                <p className="m-0 mt-1 text-[13px] text-nevo-near-black/58">
                  Volumes for the whole school, this period.
                </p>
                <div className="mt-5 grid grid-cols-3 gap-3.5 max-lg:grid-cols-2">
                  <Stat
                    label="Lessons transformed"
                    value={transformation.lessonsTransformed.toLocaleString()}
                    plain
                  />
                  <Stat
                    label="Adaptations applied"
                    value={transformation.adaptationsApplied.toLocaleString()}
                    plain
                  />
                  <Stat
                    label="Per session"
                    value={transformation.adaptationsPerSession.toFixed(1)}
                    plain
                  />
                </div>
              </div>
            ) : null}

            <p className="mt-6 max-w-[62ch] text-[13px] leading-[1.6] text-nevo-near-black/55">
              This screen shows the shape of a cohort - never a named student,
              never a score against a child, never a label. That boundary is
              what keeps cohort analytics inside admin scope.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  plain = false,
}: {
  label: string;
  value: string;
  plain?: boolean;
}) {
  return (
    <div className={cn(plain ? "" : CARD, plain ? "" : "px-5 py-[18px]")}>
      <div className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-nevo-navy">
        {value}
      </div>
      <div className="mt-2 text-[13px] font-medium text-nevo-near-black/62">{label}</div>
    </div>
  );
}
