"use client";

import { NevoSelect } from "@/components/shared/NevoSelect";
import { useCallback, useEffect, useState } from "react";
import { analyticsApi, type CohortTransformation } from "@/lib/api/analytics";
import { useMountedRef } from "@/hooks/useMountedRef";
import { classesApi } from "@/lib/api/classes";
import { yearGroupLabel, yearGroupOrder } from "@/lib/constants/yearGroups";
import { cn } from "@/lib/utils";
import { failureKind } from "../NoAccess";
import { ReadFailed } from "../ReadFailed";
import { CARD } from "../Roster/primitives";
import { FlexibilityTile, IndicatorTile } from "./SchoolTransformationView";

/**
 * D20's metric row, BY YEAR GROUP (backlog 47; Lydia, 19 Nov, L26: "Year group
 * is the only unit that answers the question Reports exists to answer"; Teslim
 * T17, live 21 Nov).
 *
 * D20's four construct-named indices and "+3 this month" are superseded by the
 * honest names (Lydia, 7 Oct): the year group gets D26's own tiles - Lessons
 * seen through, Time to finish a lesson, Changing format - with the server's
 * figures and the server's own comparison. Nothing is computed here, and
 * classes are never added up into a year group on the device: the server
 * groups the classes carrying the label.
 *
 * WITHHELD FOR SIZE, SAID (L26): a year group below the reporting floor reads
 * the server's "Too few to report" where each figure would be - never a blank,
 * never a zero - with the server's own reason under the row.
 *
 * The year groups are the ones on the school's own classes, named by the
 * school's taxonomy. None set on any class: no row.
 */

type Read<T> = { kind: "loading" } | { kind: "failed" } | { kind: "denied" } | { kind: "ready"; data: T };

const TILE_NAMES = ["Lessons seen through", "Time to finish a lesson", "Changing format"] as const;

export function YearGroupFigures() {
  const [groups, setGroups] = useState<Read<string[]>>({ kind: "loading" });
  const [chosen, setChosen] = useState<string | null>(null);
  const [figures, setFigures] = useState<Read<CohortTransformation>>({ kind: "loading" });

  /* Results only: a retry sets "loading" itself, never an effect (React's
     set-state-in-effect rule). */
  /* A read can settle after the figures unmount (a test's teardown, or the
     admin leaving the page). Setting state then is a no-op at best, and in a
     torn-down test environment it throws. */
  const mounted = useMountedRef();

  const readGroups = useCallback(() => {
    classesApi
      .list()
      .then((classes) => {
        if (!mounted.current) return;
        const seen = new Map<string, string>();
        for (const c of classes) {
          const raw = c.yearGroup?.trim();
          if (raw && !seen.has(raw.toLowerCase())) seen.set(raw.toLowerCase(), raw);
        }
        const values = [...seen.values()].sort((a, b) => yearGroupOrder(a) - yearGroupOrder(b));
        setGroups({ kind: "ready", data: values });
        setChosen((c) => (c && values.includes(c) ? c : (values[0] ?? null)));
      })
      .catch((err: unknown) => {
        if (mounted.current) setGroups({ kind: failureKind(err) });
      });
  }, [mounted]);

  useEffect(() => {
    readGroups();
  }, [readGroups]);

  const readFigures = useCallback((group: string) => {
    analyticsApi
      .getYearGroupTransformation(group)
      .then((data) => {
        if (mounted.current) setFigures({ kind: "ready", data });
      })
      .catch((err: unknown) => {
        if (mounted.current) setFigures({ kind: failureKind(err) });
      });
  }, [mounted]);

  useEffect(() => {
    if (chosen) readFigures(chosen);
  }, [chosen, readFigures]);

  if (groups.kind === "denied" || figures.kind === "denied") return null;
  if (groups.kind === "ready" && groups.data.length === 0) return null;

  const label = chosen ? (yearGroupLabel(chosen) ?? chosen) : null;

  return (
    <section aria-label="Year group" className="mt-7">
      {groups.kind === "failed" ? (
        <ReadFailed
          what="your school's year groups"
          onRetry={() => {
            setGroups({ kind: "loading" });
            readGroups();
          }}
        />
      ) : groups.kind === "loading" ? (
        <div className={cn(CARD, "h-[220px] animate-pulse")} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <NevoSelect
              aria-label="Year group"
              value={chosen ?? ""}
              onValueChange={(v) => {
                setFigures({ kind: "loading" });
                setChosen(v);
              }}
              options={groups.data.map((g) => ({ value: g, label: yearGroupLabel(g) ?? g }))}
              triggerClassName="h-[42px] rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-4 text-[15px] font-semibold text-nevo-near-black transition-colors focus:border-nevo-navy"
            />
            {/* D20's subtitle, with the window these figures actually cover. */}
            {label ? (
              <p className="m-0 text-[14px] text-nevo-near-black/58">
                {`${label} · the last four weeks · across every teacher’s classes`}
              </p>
            ) : null}
          </div>

          {figures.kind === "loading" ? (
            <div className={cn(CARD, "mt-4 h-[220px] animate-pulse")} />
          ) : figures.kind === "failed" ? (
            <ReadFailed
              className="mt-4"
              what={`${label ?? "this year group"}'s figures`}
              onRetry={() => {
                if (!chosen) return;
                setFigures({ kind: "loading" });
                readFigures(chosen);
              }}
            />
          ) : figures.kind === "ready" ? (
            <Row data={figures.data} />
          ) : null}
        </>
      )}
    </section>
  );
}

function Row({ data }: { data: CohortTransformation }) {
  if (data.suppressed) {
    const withheld = data.withheldLabel?.trim() || "Too few to report";
    return (
      <>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {TILE_NAMES.map((name) => (
            <div key={name} data-withheld className={cn(CARD, "px-[26px] py-6")}>
              <span className="text-[12px] font-semibold tracking-[0.05em] text-nevo-violet-text uppercase">
                {name}
              </span>
              <p className="m-0 mt-3 text-[17px] font-semibold text-nevo-near-black/62">{withheld}</p>
            </div>
          ))}
        </div>
        {data.message?.trim() ? (
          <p className="m-0 mt-3 max-w-[66ch] text-[13px] leading-[1.6] text-nevo-near-black/55">
            {data.message}
          </p>
        ) : null}
      </>
    );
  }
  const flexible = data.flexibility && data.flexibility.dimensions.some((d) => d.labels.length > 0);
  if (!data.selfRegulation && !data.efficiency && !flexible) {
    return (
      <div className={cn(CARD, "mt-4 px-[26px] py-6")}>
        {/* D20's own words for a cohort with too little yet. */}
        <h3 className="m-0 text-[16px] font-semibold text-nevo-near-black">
          Still gathering this cohort&rsquo;s picture
        </h3>
      </div>
    );
  }
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {data.selfRegulation ? (
        <IndicatorTile
          label="Lessons seen through"
          indicator={data.selfRegulation}
          unit="%"
          body="Of the lessons these students started in the last four weeks, the share they finished."
        />
      ) : null}
      {data.efficiency ? (
        <IndicatorTile
          label="Time to finish a lesson"
          indicator={data.efficiency}
          unit=" min"
          body="How long, on average, a lesson these students finished took them in the last four weeks."
        />
      ) : null}
      {data.flexibility && flexible ? <FlexibilityTile flexibility={data.flexibility} /> : null}
    </div>
  );
}
