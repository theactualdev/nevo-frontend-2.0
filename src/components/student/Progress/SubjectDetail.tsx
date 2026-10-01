"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { useDueReviews } from "@/hooks/useDueReviews";
import {
  subjectFromSlug,
  useStudentProgress,
} from "@/hooks/useStudentProgress";
import { useSubjectProgress } from "@/hooks/useSubjectProgress";
import type {
  SessionRow,
  SubjectDetail as SubjectDetailData,
} from "./progressData";
import { SessionDetailSheet } from "./SessionDetailSheet";

/** One "ready for another look" chip, openable or not. */
const DUE_CHIP =
  "rounded-full bg-nevo-navy/10 px-3 py-1.5 text-[13px] text-nevo-navy ring-1 ring-nevo-navy/20 ring-inset";

/** Smooth path through the timeline points (0–320 × 0–80 space). */
function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const cx = (points[i][0] + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  return d;
}

/**
 * Subject Detail (screen 23) — a deeper, still-calm look at one subject, reached
 * from the Progress tab. A plain-language reflection, a gentle growth line with
 * session markers (direction, not data), and the lessons behind it. No numbers,
 * no score, no comparison.
 *
 * SIGNED IN, THIS READS LIVE. `GET /api/students/{id}/progress/{subject}`
 * carries the concepts worked on and the lesson history with timestamps - the
 * two things this screen is actually made of. The invented reflection
 * ("Fractions clicked this week") has no field behind it and is simply not
 * shown rather than generated from a score.
 *
 * The growth line stays DECORATIVE and `aria-hidden`, as designed. The
 * contract gives a current understanding value per concept and no series over
 * time, so drawing a trend from it would be inventing a shape the data does
 * not have. Direction of travel, not data - the frame's own words.
 */
/**
 * "design-technology" -> "Design technology". Sentence case, because the app
 * writes to children in sentence case everywhere else, and because title-casing
 * a subject we do not have a real name for would be inventing a proper noun.
 */
function titleFromSlug(slug: string): string {
  const words = slug.replace(/-+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Progress";
}

export function SubjectDetail({
  subject,
  slug,
}: {
  /** The designed fixture, for the signed-out walkthrough. */
  subject: SubjectDetailData | null;
  /** Route slug - the live subject is matched against it. */
  slug: string;
}) {
  const signedIn = useHasSession();
  const hydrated = useHydrated();
  const live = useStudentProgress();
  // Matched on the NAME the segment carries, not on a lossy slug - two
  // subjects differing only in case used to share one.
  const asked = subjectFromSlug(slug);
  const liveSubject = live.subjects.find((s) => s.name === asked);
  // The subject's OWN reflection comes from the narrowed route; the
  // whole-student read above is about all of a child's learning and must not
  // sit under one subject's heading. Both requests fire on the same tick, so
  // waiting for this one costs max(a, b), not a + b.
  const own = useSubjectProgress(liveSubject?.name ?? null);
  // Session Detail sheet (Subject Detail frame): tapping a growth-line marker
  // opens the session behind it.
  const [session, setSession] = useState<SessionRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Hydration-safe: SSR cannot see the token, so rendering the fixtures first
  // and correcting after would show a signed-in child a frame of invented
  // reflection on their own learning. The reflection read gates on `loading`
  // only, never `failed`: a paragraph that could not be fetched leaves its
  // slot empty and must not blank the screen around it.
  if (!hydrated || (signedIn && (live.loading || own.loading))) {
    return <DetailShell />;
  }
  if (signedIn) {
    return (
      <LiveSubjectDetail
        // Falls back to the SLUG, not to `subject` - `subject` is the designed
        // fixture for the signed-out walkthrough, and a signed-in render must
        // not read from it even for a heading. The slug is what the child
        // actually asked for, so it is the honest label when the live read has
        // no subject by that name.
        name={liveSubject?.name ?? titleFromSlug(asked)}
        reflection={own.reflection}
        concepts={liveSubject?.concepts ?? []}
        /*
         * THIS SUBJECT'S LESSONS, not the child's whole history.
         *
         * This was `live.lessons` - the whole-student read - listed under one
         * subject's heading, which is the same mistake the comment above
         * describes for the reflection and was left standing for the lessons.
         * A child opening Maths was shown the English they had done. Invisible
         * while a library held one lesson; not invisible now.
         *
         * `LessonProgress` carries no subject, so this cannot be filtered
         * here: the narrowed read is the only source, and it was already being
         * made for the reflection alone.
         */
        lessons={own.lessons}
        /*
         * WHEN THAT READ FAILS, SAY SO. `own.failed` was never read, so a
         * failed narrowed read left no lesson section at all and - with no
         * concepts either - the screen said "Nothing here yet". That is a
         * failure rendered as emptiness: the child's lessons exist, we just
         * could not fetch them.
         */
        lessonsFailed={own.failed}
        failed={live.failed}
      />
    );
  }

  // Signed out with no fixture for this slug: nothing designed to show.
  if (!subject) notFound();

  // Markers run oldest → newest left-to-right; the lessons list is newest-first.
  // Map from the newest end so the most recent markers carry sessions; any
  // extra leading markers stay decorative.
  const chronological = [...subject.lessons].reverse();
  const offset = subject.timeline.length - chronological.length;
  const sessionForDot = (i: number): SessionRow | null =>
    i - offset >= 0 ? (chronological[i - offset] ?? null) : null;

  const openSession = (s: SessionRow) => {
    setSession(s);
    setSheetOpen(true);
  };

  /*
   * Everything below this line is the DESIGNED FIXTURE for the signed-out
   * walkthrough - a child's own subject is rendered by `LiveSubjectDetail`
   * above, and never reaches here.
   *
   * The mark is what makes that checkable. The planned end-to-end test signs in
   * and asserts no sample region is on the page; an UNMARKED fallback is
   * invisible to it, so the suite walks past reporting success while a real
   * child reads invented reflection on their own learning. That is the failure
   * this architecture actually has, and the one a flow test sails straight past
   * because the fixture renders exactly what the assertion looks for.
   *
   * `display: contents`, so it joins no layout and changes no pixel.
   */
  return (
    <SampleRegion kind="student:subject-detail">
      <div className="flex min-h-full flex-col">
        {/* Back to Progress */}
        <div className="flex h-14 shrink-0 items-center px-3 sm:px-5">
          <Link
            href="/student/progress"
            aria-label="Back to Progress"
            className="flex size-11 items-center justify-center rounded-[10px] transition-colors hover:bg-nevo-near-black/[0.06]"
          >
            <ChevronLeft
              className="size-6 text-nevo-near-black"
              strokeWidth={2}
            />
          </Link>
          <span className="ml-1.5 text-sm text-nevo-near-black/60 max-sm:hidden">
            Progress
          </span>
        </div>

        <div className="mx-auto w-full max-w-[680px] px-6 pb-8 sm:px-8">
          <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
            {subject.name}
          </h1>

          <p className="mt-[18px] text-base leading-[1.65] text-nevo-near-black sm:text-[17px]">
            {subject.prose}
          </p>

          {/* Growth timeline — decorative direction, not a chart of numbers */}
          <div className="mt-7 rounded-[12px] bg-nevo-cream-elevated px-[18px] py-6 shadow-elevation-1">
            <div className="relative h-20 w-full sm:h-[100px] lg:h-[110px]">
              <svg
                viewBox="0 0 320 80"
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                className="absolute inset-0 overflow-visible"
                aria-hidden
              >
                <path
                  d={smoothPath(subject.timeline)}
                  fill="none"
                  stroke="#9a9ccb"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {subject.timeline.map(([x, y], i) => {
                const dot = (
                  <span
                    aria-hidden
                    className="size-[13px] rounded-full bg-nevo-navy shadow-[0_0_0_4px_rgba(237,232,220,0.9)]"
                  />
                );
                const s = sessionForDot(i);
                return s ? (
                  // 44×44 hit area around the 13px marker (touch-first).
                  <button
                    key={i}
                    type="button"
                    aria-label={`View session: ${s.title}, ${s.date}`}
                    onClick={() => openSession(s)}
                    className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full transition-transform active:scale-95"
                    style={{
                      left: `${(x / 320) * 100}%`,
                      top: `${(y / 80) * 100}%`,
                    }}
                  >
                    {dot}
                  </button>
                ) : (
                  <span
                    key={i}
                    className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                    style={{
                      left: `${(x / 320) * 100}%`,
                      top: `${(y / 80) * 100}%`,
                    }}
                  >
                    {dot}
                  </span>
                );
              })}
            </div>
          </div>

          <h2 className="mt-7 text-base font-semibold text-nevo-near-black">
            What you&apos;ve been learning
          </h2>
          <ul className="mt-3">
            {subject.lessons.map((lesson) => (
              <li
                key={lesson.title}
                className="flex items-center justify-between border-b border-nevo-near-black/8 py-3.5"
              >
                <span className="text-[15px] text-nevo-near-black">
                  {lesson.title}
                </span>
                <span className="text-[13px] text-nevo-near-black/55">
                  {lesson.date}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <SessionDetailSheet
          session={session}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
        />
      </div>
    </SampleRegion>
  );
}

/** Chrome shared by every state of this screen. */
function DetailFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-3 sm:px-5">
        <Link
          href="/student/progress"
          aria-label="Back to Progress"
          className="flex size-11 items-center justify-center rounded-[10px] transition-colors hover:bg-nevo-near-black/[0.06]"
        >
          <ChevronLeft
            className="size-6 text-nevo-near-black"
            strokeWidth={2}
          />
        </Link>
        <span className="ml-1.5 text-sm text-nevo-near-black/60 max-sm:hidden">
          Progress
        </span>
      </div>
      <div className="mx-auto w-full max-w-[680px] px-6 pb-8 sm:px-8">
        {children}
      </div>
    </div>
  );
}

function DetailShell() {
  return (
    <DetailFrame>
      <div className="h-8 w-48 animate-pulse rounded bg-nevo-cream-elevated" />
      <div className="mt-7 h-[132px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
    </DetailFrame>
  );
}

/**
 * The child's own subject, from `progress/{subject}`.
 *
 * Concepts and lesson history are real. So, since 3 Sep, is the reflection:
 * the backend writes it about this subject in non-diagnostic language, and it
 * is rendered exactly as given in the slot the frame drew for `prose`. Null
 * while unread or unreadable, in which case the slot is simply empty - it is
 * never composed from `understanding` here. Dates come from `updatedAt`.
 */
function LiveSubjectDetail({
  name,
  reflection,
  concepts,
  lessons,
  lessonsFailed,
  failed,
}: {
  name: string;
  reflection: string | null;
  concepts: { conceptId: string; name: string }[];
  lessons: { lessonId: string; title: string; updatedAt: string }[];
  lessonsFailed: boolean;
  failed: boolean;
}) {
  // Which of these concepts the scheduler says are ready again. A failed or
  // still-running read simply leaves every concept where it was: the grouping
  // is an addition to this screen, never a precondition for rendering it.
  const review = useDueReviews();
  const ready = review.due.size
    ? concepts.filter((c) => review.due.has(c.conceptId))
    : [];
  const rest = ready.length
    ? concepts.filter((c) => !review.due.has(c.conceptId))
    : concepts;

  if (failed) {
    return (
      <DetailFrame>
        <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px]">
          {name}
        </h1>
        <p className="mt-4 text-[15px] leading-[1.55] text-nevo-near-black/66">
          We couldn&rsquo;t load this just now. Nothing is lost. Give it a
          moment and try again.
        </p>
      </DetailFrame>
    );
  }

  return (
    <DetailFrame>
      <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
        {name}
      </h1>

      {reflection?.trim() && (
        <p className="mt-[18px] text-base leading-[1.65] text-nevo-near-black sm:text-[17px]">
          {reflection}
        </p>
      )}

      {ready.length > 0 && (
        <>
          <h2 className="mt-7 text-base font-semibold text-nevo-near-black">
            Ready for another look
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {ready.map((c) => {
              // THE ENTRANCE TO THE SPACED-RETRIEVAL LOOP. The route, the
              // player variant and the schedule read all existed; nothing
              // linked them, so a child was told a concept was ready for
              // another look and given no way to take one.
              //
              // `playable` is the hook's own answer to "which of these can
              // actually be opened" - a due concept whose schedule row carries
              // no lesson is due but not openable, and stays a plain chip
              // rather than becoming a link to nowhere.
              const lessonId = review.playable.get(c.conceptId);
              return lessonId ? (
                <Link
                  key={c.conceptId}
                  // The concept travels with the link. Without it the review
                  // session cannot tell the scheduler which concept it was for,
                  // and the outcome of every review was being discarded.
                  href={`/student/lessons/${lessonId}/review-session?concept=${encodeURIComponent(c.conceptId)}`}
                  aria-label={`Take another look at ${c.name}`}
                  className={`${DUE_CHIP} cursor-pointer transition hover:bg-nevo-navy/[0.16] active:scale-[0.98]`}
                >
                  {c.name}
                </Link>
              ) : (
                <span key={c.conceptId} className={DUE_CHIP}>
                  {c.name}
                </span>
              );
            })}
          </div>
        </>
      )}

      {rest.length > 0 && (
        <>
          <h2 className="mt-7 text-base font-semibold text-nevo-near-black">
            What you&apos;ve been working on
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {rest.map((c) => (
              <span
                key={c.conceptId}
                className="rounded-full bg-nevo-violet/20 px-3 py-1.5 text-[13px] text-nevo-navy"
              >
                {c.name}
              </span>
            ))}
          </div>
        </>
      )}

      {lessonsFailed ? (
        <>
          <h2 className="mt-7 text-base font-semibold text-nevo-near-black">
            What you&apos;ve been learning
          </h2>
          <p className="mt-3 text-[15px] leading-[1.55] text-nevo-near-black/66">
            We couldn&rsquo;t load your lessons just now. Nothing is lost.
            Give it a moment and try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 flex h-11 cursor-pointer items-center rounded-[10px] bg-nevo-navy px-6 text-[15px] font-medium text-nevo-cream"
          >
            Try again
          </button>
        </>
      ) : lessons.length > 0 && (
        <>
          {/* The frame's heading. "Lessons you've done" listed every status,
              so it called unfinished lessons done. */}
          <h2 className="mt-7 text-base font-semibold text-nevo-near-black">
            What you&apos;ve been learning
          </h2>
          <ul className="mt-3">
            {lessons.map((l) => (
              <li
                key={l.lessonId}
                className="flex items-center justify-between gap-3 border-b border-nevo-near-black/8 py-3.5"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] text-nevo-near-black">
                  {l.title}
                </span>
                <span className="shrink-0 text-[13px] text-nevo-near-black/55">
                  {new Date(l.updatedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {concepts.length === 0 && lessons.length === 0 && !lessonsFailed && (
        // 29 Empty States, "Subject Detail (Early)".
        <p className="mt-6 text-[15px] leading-[1.55] text-nevo-near-black/60">
          You&apos;re just getting started in {name}. Check back after a few
          more lessons.
        </p>
      )}
    </DetailFrame>
  );
}
