"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useLessonLibrary,
  type CardStatus,
} from "@/hooks/useLessonLibrary";
import { cn } from "@/lib/utils";

/**
 * Lesson Library (C06 / `Nevo Teacher Library` frame). Upload sits level with
 * search - for a new teacher, uploading is the first move, not searching an
 * empty shelf. Desktop: search + upload in one row, 3-column grid; tablet:
 * upload full-width below search, 2-column grid. Empty shelf and no-results
 * are distinct calm states.
 *
 * Live-first from `GET /api/content/lessons` - see `useLessonLibrary` for what
 * that endpoint does and does not carry. The subject pills are built from the
 * subjects the library actually contains: a shelf where nothing carries one
 * shows no pills, and a shelf of Biology, Chemistry and Physics shows those
 * three. Neither the row nor the filter is written from a list in this repo,
 * which is what used to make them fixture-only.
 */

const SEARCH_ICON = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4-4" />
  </svg>
);

const PLUS_ICON = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

function statusPillClass(status: CardStatus): string {
  return cn(
    "shrink-0 rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold whitespace-nowrap",
    status === "Assigned" && "bg-nevo-violet/24 text-nevo-navy",
    // Violet is the console's "worth your eye", never alarm.
    status === "Needs review" && "bg-nevo-violet/24 text-nevo-navy",
    status === "Ready" && "bg-nevo-navy/10 text-nevo-near-black/60",
    status === "Preparing" && "bg-nevo-navy/10 text-nevo-near-black/60",
    status === "Draft" && "bg-nevo-near-black/6 text-nevo-near-black/50",
    status === "Didn’t parse" && "bg-nevo-near-black/6 text-nevo-near-black/50",
  );
}

function UploadButton({ className }: { className?: string }) {
  return (
    <Link
      href="/teacher/lessons/upload"
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-[9px] rounded-[10px] bg-nevo-navy text-[15px] font-semibold text-nevo-cream transition-[filter,transform] hover:brightness-93 active:scale-[0.99]",
        className,
      )}
    >
      {PLUS_ICON}
      Upload a lesson
    </Link>
  );
}

/**
 * Bulk ingestion's secondary entry, per design (31 Aug): "Upload multiple
 * lessons", beside or below the single upload button on C06.
 *
 * The screen existed at `/teacher/lessons/upload/bulk` with nothing anywhere
 * linking to it - a whole flow reachable only by typing the URL.
 */
function BulkUploadLink({ className }: { className?: string }) {
  return (
    <Link
      href="/teacher/lessons/upload/bulk"
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[10px] border-[1.5px] border-nevo-navy/30 text-[14.5px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6",
        className,
      )}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 8V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M14 11v6M11 14h6" />
      </svg>
      Upload multiple lessons
    </Link>
  );
}

export function LessonLibrary() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  // `live` is no longer read here: the pills used to be gated on it, and now
  // they are gated on having subjects to show, which is the honest condition.
  const { cards: lessons, sample, loading, slow } = useLessonLibrary();

  /**
   * "All", then every subject on the shelf, first-seen order.
   *
   * Not sorted and not from a list: these are the subjects teachers gave
   * their own lessons, and a lesson uploaded without one simply is not in
   * the row. A filter that cannot filter is worse than no filter, which is
   * why the row only renders when there is more than one thing to pick.
   */
  const subjects = useMemo(() => {
    const seen: string[] = ["All"];
    for (const l of lessons) {
      if (l.subject && !seen.includes(l.subject)) seen.push(l.subject);
    }
    return seen;
  }, [lessons]);

  const q = query.trim().toLowerCase();
  const shown = lessons.filter(
    (l) =>
      (filter === "All" || l.subject === filter) &&
      (!q ||
        l.title.toLowerCase().includes(q) ||
        l.meta.toLowerCase().includes(q)),
  );
  const hasQuery = q.length > 0;

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
        <h2 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
          Lesson Library
        </h2>
        {slow && (
          <p className="mt-2 max-w-[560px] text-[13px] leading-[1.5] text-nevo-near-black/55">
            Still fetching your lessons. The server is taking a moment.
          </p>
        )}
        <div className="mt-[18px] h-12 max-w-[1000px] animate-pulse rounded-[10px] bg-nevo-cream-elevated xl:mt-[22px] xl:h-[50px]" />
        <div className="mt-[18px] grid max-w-[1000px] grid-cols-2 gap-3.5 xl:grid-cols-3 xl:gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="min-h-[158px] animate-pulse rounded-[12px] bg-nevo-cream-elevated"
            />
          ))}
        </div>
      </div>
    );
  }

  // Empty shelf - real for a live teacher with nothing uploaded yet.
  if (lessons.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="flex max-w-[420px] flex-col items-center text-center">
          <div className="flex size-[88px] items-center justify-center rounded-[20px] bg-nevo-cream-elevated text-nevo-violet shadow-elevation-1">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" />
              <path d="M4 19a2 2 0 0 1 2-2h12" />
              <path d="M9 7h6" />
            </svg>
          </div>
          <h2 className="mt-[26px] text-[22px] font-semibold tracking-[-0.01em] text-nevo-near-black">
            Nothing here yet
          </h2>
          <p className="mt-3 text-base leading-[1.6] text-nevo-near-black/66">
            Upload your first lesson and Nevo will get it ready for your
            students. A PDF, Word doc or slides all work.
          </p>
          <UploadButton className="mt-6 h-[52px] px-[26px] text-[15.5px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <h2 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
        Lesson Library
      </h2>
      {sample && (
        <p className="mt-2 max-w-[560px] text-[13px] leading-[1.5] text-nevo-near-black/55 italic">
          We couldn&rsquo;t reach your lessons just now, so these are samples.
        </p>
      )}

      {/* Search + upload: one row on desktop, stacked full-width on tablet */}
      <div className="mt-[18px] max-w-[1000px] xl:mt-[22px] xl:flex xl:items-center xl:gap-3.5">
        <div className="relative flex-1">
          <span
            className={cn(
              "absolute top-1/2 left-4 -translate-y-1/2",
              hasQuery ? "text-nevo-navy" : "text-nevo-near-black/45",
            )}
          >
            {SEARCH_ICON}
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lessons"
            aria-label="Search lessons"
            className={cn(
              "h-12 w-full rounded-[10px] border-[1.5px] bg-nevo-cream-elevated px-11 text-[15px] text-nevo-near-black outline-none placeholder:text-nevo-near-black/45 xl:h-[50px] xl:text-[15.5px]",
              hasQuery ? "border-nevo-navy" : "border-nevo-near-black/14",
            )}
          />
          {hasQuery && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-4 -translate-y-1/2 cursor-pointer text-nevo-near-black/40"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </div>
        <UploadButton className="mt-3 h-12 w-full shrink-0 xl:mt-0 xl:h-[50px] xl:w-auto xl:px-[22px]" />
      </div>

      {/* Secondary, and below - design's own placement. */}
      <div className="mt-2.5 max-w-[1000px] xl:mt-3">
        <BulkUploadLink className="h-10 w-full xl:h-[42px] xl:w-auto xl:px-[18px]" />
      </div>

      {/*
        Subject pills, from the shelf itself.

        These used to render over fixtures only, on the recorded grounds that
        "a live lesson carries no subject" - true at the time, and true only
        because the upload never sent one. Now they are whatever the lessons
        in hand say they are about, in the order they first appear, with All
        in front. One subject is not a filter, so the row needs two before it
        earns its place.
      */}
      {subjects.length > 2 && (
        <div className="mt-4 flex max-w-[1000px] flex-wrap gap-2 xl:mt-[18px] xl:gap-[9px]">
          {subjects.map((label: string) => (
            <button
              key={label}
              type="button"
              onClick={() => setFilter(label)}
              className={cn(
                "cursor-pointer rounded-full px-[15px] py-2 text-[13.5px] font-medium transition-[transform,background-color] active:scale-[0.99]",
                filter === label
                  ? "bg-nevo-navy text-nevo-cream"
                  : "border border-nevo-near-black/8 bg-nevo-cream-elevated text-nevo-near-black/72",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {hasQuery && shown.length > 0 && (
        <p className="mt-[18px] text-sm text-nevo-near-black/60">
          {`${shown.length} ${shown.length === 1 ? "lesson" : "lessons"} matching “${query.trim()}”`}
        </p>
      )}

      {shown.length > 0 ? (
        <div className="mt-[18px] grid max-w-[1000px] grid-cols-2 gap-3.5 xl:grid-cols-3 xl:gap-4">
          {shown.map((lesson) => {
            /* C06's three card states. Parsing and failed are NOT links: the
               frame marks both `cursor:default`, and there is nothing on the
               other side of them - a failed lesson's detail page can only
               repeat that it could not be read. They also used to nest an
               anchor inside an anchor. */
            if (lesson.kind === "parsing") {
              return (
                <div
                  key={lesson.id}
                  className="flex min-h-[158px] cursor-default flex-col rounded-[12px] bg-nevo-cream-elevated p-5 shadow-elevation-1"
                >
                  <div className="flex items-center gap-3">
                    <span className="size-[34px] shrink-0 rounded-full border-[3px] border-nevo-navy/16 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:900ms]" />
                    <span className="text-[15.5px] leading-[1.3] font-semibold text-nevo-near-black">
                      Processing your lesson&hellip;
                    </span>
                  </div>
                  <p className="mt-[13px] text-[13.5px] leading-[1.5] text-nevo-near-black/62">
                    Nevo is getting this ready. It will appear here when
                    it&rsquo;s done.
                  </p>
                  <div className="flex-1" />
                  <div className="mt-3.5 border-t border-nevo-near-black/8 pt-3 text-[13px] text-nevo-near-black/45">
                    {lesson.footer}
                  </div>
                </div>
              );
            }

            if (lesson.kind === "failed") {
              return (
                <div
                  key={lesson.id}
                  className="flex min-h-[158px] cursor-default flex-col rounded-[12px] bg-nevo-cream-elevated p-5 shadow-elevation-1"
                >
                  <div className="flex items-start gap-3">
                    {/* Violet, never red - the frame is explicit. */}
                    <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-nevo-violet/22 text-nevo-navy">
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
                        <path d="M14 3v6h6" />
                        <path d="M9.5 13.5l5 5M14.5 13.5l-5 5" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <div className="text-[15.5px] leading-[1.35] font-semibold text-nevo-near-black">
                        This lesson couldn&rsquo;t be processed.
                      </div>
                      {/* THE REASON, WHERE THE SERVER GAVE ONE. Until 25 Sep
                          it lived on the parse run and this list has no run
                          id, so this card could only say the failure had
                          happened. Ours still stands where there is none - an
                          older deployment, or a failure with no recognised
                          cause. */}
                      <p className="mt-1 text-[13.5px] leading-[1.5] text-nevo-near-black/62">
                        {lesson.failureReason ?? "Nothing you did is lost."}
                      </p>
                      {lesson.incidentId && (
                        <p className="mt-[5px] text-[12px] leading-[1.45] text-nevo-near-black/50">
                          {"If you tell us about this, quote "}
                          <span className="font-mono text-nevo-near-black/70">
                            {lesson.incidentId}
                          </span>
                          {"."}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex-1" />
                  <Link
                    href="/teacher/lessons/upload"
                    className="mt-3.5 inline-flex cursor-pointer items-center gap-[7px] border-t border-nevo-near-black/8 pt-3 text-sm font-semibold text-nevo-navy"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 16V4M7 9l5-5 5 5" />
                      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                    Try uploading again
                  </Link>
                </div>
              );
            }

            return (
              <Link
                key={lesson.id}
                href={`/teacher/lessons/${lesson.id}`}
                className="flex min-h-[158px] cursor-pointer flex-col rounded-[12px] bg-nevo-cream-elevated p-5 shadow-elevation-1 transition-[filter,transform] hover:brightness-[0.985] active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2.5">
                  <span className="text-[16.5px] leading-[1.3] font-semibold tracking-[-0.01em] text-nevo-near-black">
                    {lesson.title}
                  </span>
                  {lesson.needsReview ? (
                    <span className="inline-flex shrink-0 items-center gap-[5px] rounded-full bg-nevo-violet/34 py-[3px] pr-[11px] pl-2 text-[11.5px] font-semibold whitespace-nowrap text-nevo-navy">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="2.6" />
                      </svg>
                      Needs review
                    </span>
                  ) : (
                    <span className={statusPillClass(lesson.status)}>
                      {lesson.status}
                    </span>
                  )}
                </div>
                <span className="mt-2 text-[13.5px] text-nevo-near-black/60">
                  {lesson.meta}
                </span>
                <div className="flex-1" />
                <div className="mt-3.5 border-t border-nevo-near-black/8 pt-3 text-[13px] text-nevo-near-black/55">
                  {lesson.footer}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        // No lessons match the search/filter
        <div className="mt-10 flex flex-col items-center p-6 text-center">
          <div className="flex size-[72px] items-center justify-center rounded-[18px] bg-nevo-cream-elevated text-nevo-violet shadow-elevation-1">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
          </div>
          <h3 className="mt-[18px] text-lg font-semibold text-nevo-near-black">
            No lessons match that
          </h3>
          <p className="mt-1.5 max-w-[340px] text-[14.5px] leading-[1.5] text-nevo-near-black/62">
            Try a different word or clear the search. You can always upload a
            new lesson.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("All");
            }}
            className="mt-[18px] cursor-pointer text-[14.5px] font-medium text-nevo-navy"
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  );
}
