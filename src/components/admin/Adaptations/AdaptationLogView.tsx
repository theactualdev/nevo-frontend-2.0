"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { classesApi, type AdminClass } from "@/lib/api/classes";
import {
  EVENT_TYPE_OPTIONS,
  eventTypeLabel,
} from "./eventTypes";
import {
  schoolIntelligenceApi,
  type AdaptationEventRow,
  type AdaptationEventType,
} from "@/lib/api/schoolIntelligence";
import { cn } from "@/lib/utils";
import { NoAccess, failureKind } from "../NoAccess";

/**
 * D21 Adaptation log - the receipts behind "adaptations this week". A
 * chronological record of what Nevo changed across the school and the plain
 * signal behind each one. Behaviour framing, never character.
 *
 * ANONYMISED LEARNERS, AND THIS IS THE IMPORTANT BIT. The frame is explicit:
 * "No diagnostic category, no confidence score, no named student." But
 * `GET /api/admin/adaptation-log` returns `studentFirstName` on every row - it
 * hands us more than the design permits. The name is deliberately never
 * rendered; each learner becomes a stable letter derived from their id, the
 * way D20's cohort journeys do it. The API being able to say more is not a
 * reason to.
 *
 * WHAT THE FRAME DRAWS THAT THE API CANNOT FILL:
 * - Before / after. Each row expands to show what the lesson looked like
 *   either side of the change; the response carries `adaptation` and `trigger`
 *   and nothing describing the prior state. The expander shows what exists.
 * - The TYPE filter. `eventType` comes back on every row but is not a query
 *   parameter, and there is no enum for it, so there is nothing to populate a
 *   filter from. The date range is real - `dateFrom` - and is offered.
 *
 * THE CLASS FILTER IS BUILT, AND WAS LISTED HERE AS IMPOSSIBLE. The marker read
 * "no endpoint lists classes, so neither filter has a source". `GET
 * /api/v1/classes` lists them and `classId` was already a declared query
 * parameter on the log endpoint - the wire had been there the whole time.
 *
 * `classId` takes a UUID, so the query param is OMITTED rather than sent empty
 * when no class is chosen; `classId: ""` is a 422 that would take the log down.
 *
 * The class list loads in its OWN effect and its failure never touches `phase`.
 * A directory read that dies must not cost an admin the log they came for - the
 * compliance-audit footer already works this way and is the precedent.
 *
 * ONE THING TO KNOW ABOUT THE LETTERS. Filtering to a small class narrows
 * "Learner A" toward a real child, because an admin who can read the roster can
 * shrink the candidate set to the class size. That was already true of lesson
 * titles and timestamps and it renders no label about anyone, so it is not a
 * blocker - but the letters are anonymisation of the DISPLAY, not a privacy
 * guarantee, and nobody should later treat them as pseudonyms that earn one.
 * Do not "improve" this by adding `studentFirstName` or a per-row class name.
 *
 * THE TYPE FILTER EXISTS NOW. It was recorded here as genuinely blocked -
 * `eventType` came back on every row as a bare string with no enum, so there
 * was nothing to populate a filter from. Backend enumerated the eight values
 * and made it a repeatable query parameter on 15 Sep. The engine's vocabulary
 * is mapped to readable labels in `eventTypes.ts`, once.
 *
 * TODO(api): a before/after pair on the event - the one thing D21 draws that
 * still has no source.
 */

const CARD = "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]";
const PAGE = 5;

/*
 * Lifted out of the range buttons unchanged so the class control can match them
 * exactly. This screen's filters are pills; the taller `FILTER_PILL` used by
 * Students and Classes belongs to those screens, and mixing the two here would
 * make the two filters on ONE row disagree with each other.
 */
const CHIP =
  "cursor-pointer rounded-full px-[13px] py-1.5 text-[12.5px] font-medium transition-[filter]";
const CHIP_OFF =
  "border border-nevo-near-black/8 bg-nevo-cream-elevated text-nevo-near-black/70 hover:brightness-[0.985]";
const CHIP_ON = "bg-nevo-navy text-nevo-cream";
/** Same footprint, nothing to press - "Loading classes...", "No classes yet". */
const CHIP_MUTED =
  "rounded-full border border-nevo-near-black/8 px-[13px] py-1.5 text-[12.5px] font-medium text-nevo-near-black/45";

type Phase = "loading" | "ready" | "failed" | "denied";

const RANGES = [
  { label: "This week", days: 7 },
  { label: "This month", days: 30 },
  { label: "This term", days: 120 },
] as const;

/** A stable letter per learner, so rows stay comparable without a name. */
function learnerTag(studentId: string, order: string[]): string {
  const i = order.indexOf(studentId);
  if (i === -1) return "?";
  // A..Z, then AA, AB - a school never has enough in one view to matter.
  let n = i;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Today · ${time}`;
  const yesterday = new Date(today.getTime() - 864e5);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${time}`;
}

export function AdaptationLogView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [rows, setRows] = useState<AdaptationEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [rangeIdx, setRangeIdx] = useState(0);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [classId, setClassId] = useState("");
  /*
   * MULTI-SELECT, because the parameter repeats. An empty array means "all of
   * them" and sends nothing at all - `buildUrl` drops an empty array rather
   * than sending an empty value, which would be a filter on nothing.
   */
  const [types, setTypes] = useState<AdaptationEventType[]>([]);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [classPhase, setClassPhase] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  /*
   * The footer used to end "· 0 diagnostic labels in this or any log" - a
   * hardcoded zero, on a screen that never asked. Design's build rules are
   * explicit that this number must be a real query and not cosmetic, so it
   * comes from the compliance audit. Null means we could not reach it, and
   * then the footer says nothing rather than asserting a zero we do not have.
   */
  const [labels, setLabels] = useState<number | null>(null);

  useEffect(() => {
    schoolIntelligenceApi
      .complianceAudit()
      .then((a) => setLabels(a.diagnosticLabelsStored))
      .catch(() => setLabels(null));
  }, []);

  /*
   * Its own effect, and its own failure. `setClassPhase("failed")` never
   * touches `phase`, and the catch does not clear `classes` - a retry that
   * fails after a success should leave the options the admin was using.
   */
  const loadClasses = useCallback(() => {
    classesApi
      .list()
      .then((c) => {
        setClasses(c);
        setClassPhase("ready");
      })
      .catch(() => setClassPhase("failed"));
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const range = RANGES[rangeIdx];

  /*
   * PAGED BY OFFSET, NOT BY A GROWING LIMIT.
   *
   * "Load earlier" used to raise `limit` by five and refetch everything. The
   * contract caps `limit` at 100, so the twentieth press sent `limit=105`, got
   * a 422, and the whole log was replaced by a failure card that "Try again"
   * could never clear. Now the first page is five rows and each press fetches
   * the next five at `offset = rows shown`, appended - the limit never grows.
   *
   * The window's start is fixed at the first load (`windowRef`), so later pages
   * count from the same instant and a new adaptation arriving meanwhile does
   * not shift every offset by one.
   */
  const windowRef = useRef<{
    from: string;
    cls: string;
    kinds: AdaptationEventType[];
    generation: number;
  } | null>(null);
  const generation = useRef(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  const query = (
    w: { from: string; cls: string; kinds: AdaptationEventType[] },
    offset: number,
  ) =>
    schoolIntelligenceApi.adaptationLog({
      dateFrom: w.from,
      limit: PAGE,
      offset,
      // OMITTED, not empty: `classId` is a uuid on the contract and "" is a 422.
      ...(w.cls ? { classId: w.cls } : {}),
      ...(w.kinds.length ? { eventType: w.kinds } : {}),
    });

  const load = useCallback(
    (days: number, cls: string, kinds: AdaptationEventType[]) => {
      generation.current += 1;
      const w = {
        from: new Date(Date.now() - days * 864e5).toISOString(),
        cls,
        kinds,
        generation: generation.current,
      };
      windowRef.current = w;
      query(w, 0)
        .then((log) => {
          if (w.generation !== generation.current) return;
          // Reset here, not before the request: an earlier page's failure
          // belongs to the list this one replaces.
          setMoreFailed(false);
          setRows(log.events);
          setTotal(log.total);
          setPhase("ready");
        })
        .catch((err: unknown) => {
          if (w.generation !== generation.current) return;
          setPhase(failureKind(err));
        });
    },
    [],
  );

  const loadMore = () => {
    const w = windowRef.current;
    if (!w || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    query(w, rows.length)
      .then((log) => {
        // A filter changed while this was in flight: it belongs to a list
        // that is no longer on screen.
        if (w.generation !== generation.current) return;
        setRows((prev) => [...prev, ...log.events]);
        setTotal(log.total);
      })
      // A failed page costs only itself - the rows already shown stay.
      .catch(() => {
        if (w.generation === generation.current) setMoreFailed(true);
      })
      .finally(() => setLoadingMore(false));
  };

  useEffect(() => {
    load(range.days, classId, types);
  }, [load, range.days, classId, types]);

  // Order of first appearance decides the letters, so they read A, B, C down
  // the page rather than jumping about.
  const learnerOrder = [...new Set(rows.map((r) => r.studentId))];

  /*
   * The filtered-scope clause. A chosen class whose NAME we no longer hold -
   * the list failed on a retry - still narrows the figures, so it says "in this
   * class" rather than dropping the clause and quietly presenting a filtered
   * count as the school's.
   */
  const activeClass = classId ? classes.find((c) => c.id === classId) : null;
  const scope = classId ? ` in ${activeClass ? activeClass.name : "this class"}` : "";

  const pickClass = (next: string) => {
    setClassId(next);
    setExpanded(null);
  };

  /** Clearing the kind filter, from the row of chips or from the empty state. */
  const clearTypes = () => {
    setTypes([]);
    setExpanded(null);
  };

  /*
   * Toggling a kind resets to the first page, for the same reason changing the
   * class does: the pagination here is a GROWING LIMIT, so asking for 20 rows
   * of a filter that matches three is a request for a page that is not there.
   */
  const toggleType = (kind: AdaptationEventType) => {
    setTypes((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
    );
    setExpanded(null);
  };

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[820px]">
        <Link
          href="/admin/dashboard"
          className="text-[13.5px] font-medium text-nevo-navy hover:underline"
        >
          &larr; School Overview
        </Link>

        <h2 className="mt-3 text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
          Adaptation log
        </h2>
        {phase === "ready" && (
          <p className="mt-1.5 text-[15px] text-nevo-near-black/60">
            {total === 0
              ? `No adaptations${scope} in the last ${range.days} days`
              : `${total.toLocaleString("en-GB")} adaptation${total === 1 ? "" : "s"}${scope} in the last ${range.days} days`}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              type="button"
              onClick={() => {
                setRangeIdx(i);
                setExpanded(null);
              }}
              aria-pressed={i === rangeIdx}
              className={cn(CHIP, i === rangeIdx ? CHIP_ON : CHIP_OFF)}
            >
              {r.label}
            </button>
          ))}

          <span
            aria-hidden="true"
            className="mx-1 h-4 w-px bg-nevo-near-black/12"
          />

          {classPhase === "loading" && (
            <span className={CHIP_MUTED}>Loading classes&hellip;</span>
          )}
          {classPhase === "failed" && (
            <button
              type="button"
              onClick={() => {
                setClassPhase("loading");
                loadClasses();
              }}
              className={cn(CHIP, CHIP_OFF)}
            >
              Class list didn&rsquo;t load &middot; try again
            </button>
          )}
          {classPhase === "ready" && classes.length === 0 && (
            <span className={CHIP_MUTED}>No classes yet</span>
          )}
          {classPhase === "ready" && classes.length > 0 && (
            <label className="relative inline-flex">
              <span className="sr-only">Filter by class</span>
              <select
                value={classId}
                onChange={(e) => pickClass(e.target.value)}
                className={cn(
                  CHIP,
                  classId ? CHIP_ON : CHIP_OFF,
                  "appearance-none pr-[26px]",
                )}
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute top-1/2 right-[10px] -translate-y-1/2 text-[9px]",
                  classId ? "text-nevo-cream" : "text-nevo-near-black/45",
                )}
              >
                &#9660;
              </span>
            </label>
          )}
        </div>

        {/* D21's type filter. A second row rather than more chips on the
            first: eight options beside three ranges and a class select would
            wrap unpredictably at 1024, where this console is desktop-only. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {EVENT_TYPE_OPTIONS.map((kind) => {
            const on = types.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                onClick={() => toggleType(kind)}
                aria-pressed={on}
                className={cn(CHIP, on ? CHIP_ON : CHIP_OFF)}
              >
                {eventTypeLabel(kind)}
              </button>
            );
          })}
          {types.length > 0 && (
            <button
              type="button"
              onClick={clearTypes}
              className="cursor-pointer px-1 text-[12.5px] font-semibold text-nevo-navy hover:opacity-75"
            >
              Show all kinds
            </button>
          )}
        </div>

        {phase === "loading" && (
          <div className={cn(CARD, "mt-5 h-[280px] animate-pulse")} />
        )}

        {phase === "denied" && <NoAccess what="the adaptation log" />}
        {phase === "failed" && (
          <div className={cn(CARD, "mt-5 px-[26px] py-7")}>
            <h3 className="text-[17px] font-semibold text-nevo-near-black">
              We couldn&rsquo;t load the adaptation log
            </h3>
            <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
              Nothing has changed for your students. Try again in a moment.
            </p>
            <button
              type="button"
              onClick={() => {
                setPhase("loading");
                load(range.days, classId, types);
              }}
              className="mt-5 h-[46px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-110 active:brightness-93"
            >
              Try again
            </button>
          </div>
        )}

        {phase === "ready" && rows.length === 0 && (
          /*
           * THE EMPTY STATE HAS TO NAME EVERY FILTER THAT COULD BE CAUSING IT.
           *
           * It discriminated on `classId` alone, so an admin who had narrowed
           * to one adaptation TYPE and found nothing was told "No adaptations
           * were made in the last 30 days" - a flat statement about their
           * school, produced by a control they had set two rows above - and
           * was offered no way back from it. The type filter arrived after
           * this branch was written and nothing here noticed.
           */
          <div className={cn(CARD, "mt-5 px-[26px] py-8 text-center")}>
            <h3 className="text-[17px] font-semibold text-nevo-near-black">
              {classId && types.length > 0
                ? "Nothing to show for these filters"
                : types.length > 0
                  ? "Nothing to show for this kind and range"
                  : classId
                    ? "Nothing to show for this class and range"
                    : "Nothing to show for this range"}
            </h3>
            <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-[1.55] text-nevo-near-black/62">
              {types.length > 0
                ? `No adaptations of that kind were made${scope} in the last ${range.days} days. Try a wider range, or show every kind.`
                : classId
                  ? `No adaptations were made${scope} in the last ${range.days} days. Try a wider range, or show all classes.`
                  : `No adaptations were made in the last ${range.days} days. Try a wider range, or check back once lessons are running.`}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              {classId && (
                <button
                  type="button"
                  onClick={() => pickClass("")}
                  className="h-[42px] cursor-pointer rounded-[10px] border-[1.5px] border-nevo-navy/30 px-4 text-[13.5px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                >
                  Show all classes
                </button>
              )}
              {types.length > 0 && (
                <button
                  type="button"
                  onClick={clearTypes}
                  className="h-[42px] cursor-pointer rounded-[10px] border-[1.5px] border-nevo-navy/30 px-4 text-[13.5px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                >
                  Show every kind
                </button>
              )}
            </div>
          </div>
        )}

        {phase === "ready" && rows.length > 0 && (
          <>
            <div className={cn(CARD, "mt-5 overflow-hidden")}>
              {rows.map((r, i) => {
                const open = expanded === r.id;
                return (
                  <div
                    key={r.id}
                    className={cn(
                      i < rows.length - 1 && "border-b border-nevo-near-black/7",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : r.id)}
                      aria-expanded={open}
                      className="flex w-full cursor-pointer items-start gap-4 px-[22px] py-[18px] text-left transition-[filter] hover:brightness-[0.985]"
                    >
                      <span className="w-[128px] shrink-0 text-[13px] text-nevo-near-black/55">
                        {fmtTime(r.timestamp)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-[15px] font-semibold text-nevo-near-black">
                          {/* THE LABEL, NOT THE KEY. This printed
                              `simplify_trigger` as the row's headline - the
                              engine's own vocabulary, in front of a head
                              teacher. The labels were written for the filter an
                              hour before this was caught and simply not used
                              here, which is the same fix-one-miss-the-sibling
                              this console keeps repeating.

                              A key we have no label for falls back to a
                              neutral word rather than the raw value: an
                              unreadable row is better than a leaked internal. */}
                          {eventTypeLabel(r.eventType) ?? "Adaptation"}
                        </span>
                        <span className="mt-0.5 text-[13.5px] leading-[1.5] text-nevo-near-black/66">
                          {r.adaptation}
                        </span>
                        {r.lessonTitle && (
                          <span className="mt-1 text-[12.5px] text-nevo-near-black/50">
                            {r.lessonTitle}
                          </span>
                        )}
                      </span>
                      {/* Never the name, even though the API sends one. */}
                      <span className="shrink-0 rounded-full bg-nevo-violet/24 px-[11px] py-1 text-[12px] font-semibold text-nevo-navy">
                        {`Learner ${learnerTag(r.studentId, learnerOrder)}`}
                      </span>
                    </button>
                    {open && (
                      <div className="px-[22px] pb-5 pl-[166px]">
                        <span className="text-[12.5px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase">
                          Signal behind it
                        </span>
                        <p className="mt-1.5 max-w-[62ch] text-sm leading-[1.6] text-nevo-near-black/72">
                          {r.trigger}
                        </p>
                        {/* Was "No diagnostic category, no confidence score,
                            no named student" - a guarantee about the contents
                            of `r.trigger`, which is a backend string this
                            client never inspects. What follows is true of the
                            product and of this log's own rendering, both of
                            which we can stand behind. */}
                        <p className="mt-3 max-w-[62ch] text-[13px] leading-[1.5] text-nevo-near-black/50">
                          The signal describes behaviour in the moment. Nevo
                          records no diagnostic category and no confidence
                          score, and this log never shows a learner&rsquo;s
                          name.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] text-nevo-near-black/55">
                {`Showing ${rows.length} of ${total.toLocaleString("en-GB")}`}
                {labels === null
                  ? ""
                  : labels === 0
                    ? " · the last compliance check found no diagnostic labels stored"
                    : ` · the last compliance check found ${labels} diagnostic label${labels === 1 ? "" : "s"} stored`}
              </span>
              {rows.length < total && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="h-[42px] cursor-pointer rounded-[10px] border-[1.5px] border-nevo-navy/30 px-4 text-[13.5px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-wait disabled:opacity-60"
                >
                  {loadingMore ? "Loading…" : "Load earlier adaptations"}
                </button>
              )}
            </div>
            {moreFailed ? (
              <p className="m-0 mt-2 text-right text-[13px] text-nevo-navy">
                We couldn&rsquo;t load the earlier ones just now. What&rsquo;s
                above is unchanged &ndash; try again in a moment.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
