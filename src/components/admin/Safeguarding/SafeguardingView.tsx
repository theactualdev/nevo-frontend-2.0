"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { aboutAChild, categoryLabel, safetyApi, type SafetyEvent } from "@/lib/api/safety";
import { studentsApi } from "@/lib/api/students";
import { getSession } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { useLearningSupport } from "../LearningSupport/useLearningSupport";
import { NoAccess, failureKind } from "../NoAccess";
import { withBack } from "../back";

/**
 * D29 Safeguarding (SCRUM-260; design 96cd4b4, 20 Oct).
 *
 * Where the school learns that a child asked Nevo something that tripped the
 * safety check. The child has already been told Nevo can't help and to talk
 * to a trusted adult or their teacher; this is the school finding out.
 *
 * - LEARNING SUPPORT HOLDERS ONLY, school-wide. The rail item is absent for
 *   anyone else (`learningSupportOnly`); arriving by URL without the role is
 *   met by the console's ordinary refusal.
 * - AN ENTRY IS THE CHILD, WHEN, AND THE CATEGORY. Never what the child wrote,
 *   and no space kept for it (Lydia, 20 Oct): nothing is coming later.
 * - ACKNOWLEDGING RECORDS THAT IT WAS SEEN. It closes nothing; the entry stays,
 *   showing who saw it and when.
 * - THE ONE DELIBERATE BREAK FROM CALM: an entry nobody has seen carries
 *   weight through navy, position and space - never the error palette.
 * - NO COUNTS. The server sends none, so the screen states none.
 */

const PAGE = 100;

type Phase = "loading" | "ready" | "failed" | "denied";

/** "18 October 2026 · 2:14 PM" */
function whenFlagged(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
  return `${day} · ${time}`;
}

/** "20 October 2026" */
export function longDay(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function SafeguardingView() {
  const { holders: ls } = useLearningSupport();
  const [phase, setPhase] = useState<Phase>("loading");
  const [events, setEvents] = useState<SafetyEvent[]>([]);
  /** More entries may sit behind the last one read. */
  const [more, setMore] = useState(false);
  const [paging, setPaging] = useState(false);
  /** Each child's name, by id - from the roster read the console already makes. */
  const [names, setNames] = useState<Map<string, string>>(() => new Map());
  const [acking, setAcking] = useState<string | null>(null);
  const [ackFailed, setAckFailed] = useState<string | null>(null);
  const [me] = useState(() => getSession()?.userId ?? null);

  const read = useCallback(() => {
    safetyApi
      .events({ limit: PAGE })
      .then((rows) => {
        setEvents(rows);
        setMore(rows.length >= PAGE);
        setPhase("ready");
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
    // Names are a nicety on top of the record, not a condition for it: an
    // unread roster leaves the entries standing, each saying "A student".
    studentsApi
      .list({ includeInactive: true })
      .then((rows) => setNames(new Map(rows.map((r) => [r.id, r.name]))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    read();
  }, [read]);

  const retry = () => {
    setPhase("loading");
    read();
  };

  const earlier = () => {
    const last = events[events.length - 1];
    if (!last || paging) return;
    setPaging(true);
    safetyApi
      .events({ limit: PAGE, before: last.createdAt })
      .then((rows) => {
        setEvents((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]);
        setMore(rows.length >= PAGE);
      })
      .catch(() => undefined)
      .finally(() => setPaging(false));
  };

  const acknowledge = (event: SafetyEvent) => {
    if (acking) return;
    setAcking(event.id);
    setAckFailed(null);
    safetyApi
      .acknowledge(event.id)
      .then((next) => setEvents((prev) => prev.map((e) => (e.id === next.id ? next : e))))
      .catch(() => setAckFailed(event.id))
      .finally(() => setAcking(null));
  };

  /** Who saw it, in words the reader recognises; nothing when nobody can say. */
  const seenBy = (id: string | null): string | null => {
    if (!id) return null;
    if (id === me) return "you";
    return ls?.holders.find((h) => h.userId === id)?.name?.trim() || null;
  };

  const entries = useMemo(() => events.filter(aboutAChild), [events]);

  if (ls?.viewerHoldsIt === false || phase === "denied") {
    return (
      <Wrapper>
        <Heading />
        <NoAccess what="the safeguarding list" className="mt-6" />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Heading />

      {phase === "loading" ? (
        <div className="mt-6 h-[260px] animate-pulse rounded-xl bg-nevo-cream-elevated" />
      ) : phase === "failed" ? (
        <div className="mt-6 rounded-xl bg-nevo-cream-elevated px-[26px] py-7 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
            We couldn&rsquo;t load the safeguarding list
          </h3>
          <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
            Nothing has changed. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-5 h-[46px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-110"
          >
            Try again
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-xl bg-nevo-cream-elevated px-8 py-14 text-center shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <span className="flex size-[64px] items-center justify-center rounded-full bg-nevo-violet/24 text-nevo-navy">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />
            </svg>
          </span>
          <h3 className="m-0 mt-5 text-[20px] font-semibold tracking-[-0.01em] text-nevo-near-black">
            Nothing has been flagged
          </h3>
          <p className="m-0 mt-2.5 max-w-[56ch] text-[15px] leading-[1.6] text-nevo-near-black/64">
            When a child asks Nevo something that raises a safeguarding concern, Nevo tells them it
            can&rsquo;t help and to speak to a trusted adult or their teacher. Each time that happens,
            it appears here for you to see.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-2 max-w-[68ch] text-[15px] leading-[1.6] text-nevo-near-black/64">
            When a child asks Nevo something that raises a safeguarding concern, Nevo tells them it
            can&rsquo;t help and to speak to a trusted adult or their teacher. Each time that happens,
            it is listed here.
          </p>
          <div className="mt-5 flex gap-3 rounded-xl bg-nevo-violet/14 px-[18px] py-4">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 flex-none text-nevo-navy">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5" />
              <circle cx="12" cy="7.6" r="0.6" fill="currentColor" />
            </svg>
            <p className="m-0 text-[14px] leading-[1.55] text-nevo-near-black/78">
              Recording that you&rsquo;ve seen an entry notes that you&rsquo;ve read it, with your name
              and the date. It doesn&rsquo;t close or resolve anything, and the entry stays here.
              Seeing it is where your school&rsquo;s own safeguarding steps begin, not the whole of
              them.
            </p>
          </div>

          <ul className="m-0 mt-6 flex list-none flex-col gap-3.5 p-0">
            {entries.map((e) => {
              const seen = Boolean(e.acknowledgedAt);
              const name = names.get(e.studentId)?.trim() || "A student";
              const by = seenBy(e.acknowledgedBy);
              const on = longDay(e.acknowledgedAt);
              const profile = withBack(`/admin/senco/${e.studentId}`, {
                href: "/admin/safeguarding",
                label: "Safeguarding",
              });
              return (
                <li
                  key={e.id}
                  className={cn(
                    "rounded-xl",
                    seen
                      ? "bg-nevo-cream-elevated px-6 py-[22px] shadow-[0_2px_8px_rgba(0,0,0,0.05)] max-lg:px-5 max-lg:py-[18px]"
                      : "bg-nevo-navy px-7 py-6 shadow-[0_8px_32px_rgba(0,0,0,0.16)] max-lg:px-[22px] max-lg:py-5",
                  )}
                >
                  <div className="flex items-start justify-between gap-4 max-lg:flex-col max-lg:gap-2.5">
                    <div className="min-w-0">
                      <span
                        className={cn(
                          "block text-[19px] font-semibold tracking-[-0.01em] max-lg:text-[17px]",
                          seen ? "text-nevo-near-black" : "text-nevo-cream",
                        )}
                      >
                        {name}
                      </span>
                      <span
                        className={cn(
                          "mt-1.5 block text-[13.5px]",
                          seen ? "text-nevo-near-black/60" : "text-nevo-cream/72",
                        )}
                      >
                        Flagged {whenFlagged(e.createdAt)}
                      </span>
                    </div>
                    {e.categories.length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {e.categories.map((c) => (
                          <span
                            key={c}
                            className={cn(
                              "inline-flex items-center whitespace-nowrap rounded-full px-3 py-[5px] text-[12.5px] font-semibold",
                              seen ? "bg-nevo-navy/10 text-nevo-navy" : "bg-nevo-cream/16 text-nevo-cream",
                            )}
                          >
                            {categoryLabel(c)}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </div>

                  {seen ? (
                    <p className="m-0 mt-3.5 text-[13.5px] leading-[1.5] text-[#5b5e8f]">
                      {[by ? `Seen by ${by}` : "Seen", on].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    {seen ? (
                      <span className="inline-flex h-10 items-center gap-[7px] rounded-[10px] border-[1.5px] border-nevo-navy/30 px-[15px] text-[14px] font-semibold text-nevo-navy">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        Seen
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => acknowledge(e)}
                        disabled={acking === e.id}
                        className="inline-flex h-11 cursor-pointer items-center justify-center rounded-[10px] bg-nevo-cream px-5 text-[14.5px] font-semibold text-nevo-navy transition-[filter] hover:brightness-95 disabled:cursor-default disabled:opacity-70"
                      >
                        {acking === e.id ? "Recording…" : "Record that I’ve seen this"}
                      </button>
                    )}
                    <Link
                      href={profile}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-[14px] font-semibold hover:underline",
                        seen ? "text-nevo-navy" : "text-nevo-cream",
                      )}
                    >
                      Open profile
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </Link>
                  </div>
                  {ackFailed === e.id ? (
                    <p role="status" className="m-0 mt-3 text-[13.5px] leading-[1.5] text-nevo-cream/85">
                      That didn&rsquo;t go through, and nothing has changed. Try again in a moment.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {more ? (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={earlier}
                disabled={paging}
                className="h-[44px] cursor-pointer rounded-[10px] px-4 text-[14px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-default disabled:opacity-60"
              >
                {paging ? "Loading…" : "Show earlier entries"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[860px]">{children}</div>
    </div>
  );
}

function Heading() {
  return (
    <h2 className="m-0 text-[28px] font-semibold tracking-[-0.018em] text-nevo-near-black max-lg:text-[24px]">
      Safeguarding
    </h2>
  );
}
