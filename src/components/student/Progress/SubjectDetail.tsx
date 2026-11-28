"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { useDueReviews } from "@/hooks/useDueReviews";
import {
  subjectFromSlug,
  subjectSlug,
  useStudentProgress,
} from "@/hooks/useStudentProgress";
import { useSubjectProgress } from "@/hooks/useSubjectProgress";
import { ReviewCard } from "@/components/student/Home/ReviewCard";
import type {
  SessionRow,
  SubjectDetail as SubjectDetailData,
} from "./progressData";
import { SubjectTexture } from "./ProgressTab";
import { EmptyArt } from "@/components/student/Shell/TabPage";
import { SessionDetailSheet } from "./SessionDetailSheet";

/** At most this many review cards at once (Lydia, 19 Nov, L11; 23b). */
const REVIEW_CARDS_SHOWN = 3;

/**
 * Subject Detail (screen 23) — a deeper, still-calm look at one subject, reached
 * from the Progress tab. A plain-language reflection, the sessions behind it as
 * markers on the subject's texture, and the lessons. No numbers, no score, no
 * comparison.
 *
 * SIGNED IN, THIS READS LIVE. `GET /api/students/{id}/progress/{subject}`
 * carries the concepts worked on and the lesson history with timestamps - the
 * two things this screen is actually made of. The invented reflection
 * ("Fractions clicked this week") has no field behind it and is simply not
 * shown rather than generated from a score.
 *
 * NO RISING LINE (design D41, 1 Oct). The markers sat on a smooth upward curve
 * - the treatment SCRUM-144 took off the Progress cards on 15 Sep, surviving
 * here alone. The contract has no series over time, so any line through them
 * is a shape the data does not have, and an upward one tells every child the
 * subject is going up. They now sit level on the subject card's own texture,
 * which is chosen from the subject's name and carries no direction.
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
  // Session Detail sheet (Subject Detail frame): tapping a session marker
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
        // This page's own address, written the way Progress links to it,
        // so a review opened from here comes back here (Olayinka, 14 Oct).
        // Re-encoded from the name: Next may hand the slug over decoded.
        here={`/student/progress/${subjectSlug(asked)}`}
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

  // One marker per session, oldest → newest left-to-right; the lessons list is
  // newest-first. Order is the only thing their position says.
  const chronological = [...subject.lessons].reverse();

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

        <div className="mx-auto w-full max-w-[680px] px-6 pb-8 sm:px-8 md:max-w-[908px] md:px-11 md:pb-11 xl:max-w-[924px] xl:px-[52px] xl:pb-[52px]">
          <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] xl:text-[32px]">
            {subject.name}
          </h1>

          <p className="mt-[18px] text-base leading-[1.65] text-nevo-near-black sm:text-[17px]">
            {subject.prose}
          </p>

          {/* Session markers, level on the subject's own texture (33a) -
              order, not direction, and no line through them. */}
          <div
            className="relative mt-7 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1"
            data-session-markers
          >
            <SubjectTexture subject={subject.name} />
            <div className="absolute inset-0 flex items-center justify-evenly px-[18px]">
              {chronological.map((s) => (
                // 44×44 hit area around the 13px marker (touch-first).
                <button
                  key={`${s.title}-${s.date}`}
                  type="button"
                  aria-label={`View session: ${s.title}, ${s.date}`}
                  onClick={() => openSession(s)}
                  className="flex size-11 cursor-pointer items-center justify-center rounded-full transition-transform active:scale-95"
                >
                  <span
                    aria-hidden
                    className="size-[13px] rounded-full bg-nevo-navy shadow-[0_0_0_4px_rgba(237,232,220,0.9)]"
                  />
                </button>
              ))}
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
      {/* A column that fills what is left, so an early subject's figure and
          line can sit centred in it, as 29 draws them. */}
      <div className="mx-auto flex w-full max-w-[680px] flex-1 flex-col px-6 pb-8 sm:px-8 md:max-w-[908px] md:px-11 md:pb-11 xl:max-w-[924px] xl:px-[52px] xl:pb-[52px]">
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
  here,
  reflection,
  concepts,
  lessons,
  lessonsFailed,
  failed,
}: {
  name: string;
  /** This page's address: where a review opened from it goes back to. */
  here: string;
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
  /*
   * A CARD FOR EACH CONCEPT THAT CAN BE STARTED (Lydia, 19 Nov, L11, and
   * 25 Nov, L61; frame 23b): Home's review card as it is, at most three, the
   * rest behind "See the rest" - "so a child with eight due does not face a
   * wall". No count anywhere: a number of what is waiting is a queue length,
   * and reads as a debt (23b).
   *
   * `playable` is the hook's own answer to which due concepts can be opened.
   * One whose schedule row carries no lesson is due but cannot be started, so
   * it is not offered as a card with a button to nowhere: it stays in the
   * list below, named, as it was.
   */
  const ready = review.due.size
    ? concepts.filter((c) => review.due.has(c.conceptId) && review.playable.has(c.conceptId))
    : [];
  const readyIds = new Set(ready.map((c) => c.conceptId));
  const rest = concepts.filter((c) => !readyIds.has(c.conceptId));
  const [allShown, setAllShown] = useState(false);
  const shown = allShown ? ready : ready.slice(0, REVIEW_CARDS_SHOWN);
  /** The first card the control was hiding: focus goes there once pressed. */
  const firstRevealed = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (allShown) firstRevealed.current?.focus();
  }, [allShown]);

  if (failed) {
    return (
      <DetailFrame>
        <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px]">
          {name}
        </h1>
        <p className="mt-4 text-[15px] leading-[1.55] text-nevo-near-black/66">
          We couldn&apos;t load this just now. Nothing is lost. Give it a
          moment and try again.
        </p>
        {/* The line asks them to try again, so the way to is here, as it is
            on this screen's lessons read (audit, 2 Nov, backlog 12). */}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 flex h-11 cursor-pointer items-center rounded-[10px] bg-nevo-navy px-6 text-[15px] font-medium text-nevo-cream"
        >
          Try again
        </button>
      </DetailFrame>
    );
  }

  return (
    <DetailFrame>
      <h1 className="text-[26px] font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] xl:text-[32px]">
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
          <div className="mt-3 flex flex-col gap-3.5">
            {shown.map((c, i) => (
              // THE ENTRANCE TO THE SPACED-RETRIEVAL LOOP. The concept
              // travels with the link, so the scheduler is told which concept
              // the review was for; and back comes to this page, where it was
              // opened (Olayinka, 14 Oct).
              <div
                key={c.conceptId}
                ref={i === REVIEW_CARDS_SHOWN ? firstRevealed : undefined}
                tabIndex={i === REVIEW_CARDS_SHOWN ? -1 : undefined}
                className="outline-none"
              >
                <ReviewCard
                  review={{
                    conceptName: c.name,
                    conceptId: c.conceptId,
                    lessonId: review.playable.get(c.conceptId)!,
                  }}
                  back={here}
                  headingId={`review-${c.conceptId}`}
                  linkLabel={`Take another look at ${c.name}`}
                  className=""
                  // Equal items, no primary among them (Lydia, 28 Nov, L94).
                  secondary
                />
              </div>
            ))}
          </div>
          {!allShown && ready.length > REVIEW_CARDS_SHOWN && (
            // 23b's control, its words Lydia's (25 Nov, L61). No count.
            <button
              type="button"
              onClick={() => setAllShown(true)}
              className="mt-3.5 flex min-h-12 w-full cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/30 bg-transparent px-4 py-3 text-[15px] leading-[1.2] font-semibold text-nevo-navy transition-transform active:scale-[0.98]"
            >
              See the rest
            </button>
          )}
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
            We couldn&apos;t load your lessons just now. Nothing is lost.
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
        <SubjectEarly name={name} />
      )}
    </DetailFrame>
  );
}

/**
 * 29 EMPTY STATES, "SUBJECT DETAIL (EARLY)" (backlog 34): the board's own
 * empty-progress figure - the Progress tab's - at 200 / 240 / 250 tall, and
 * the line under it at 16 / 17 / 17, at most 280 / 360 / 400 wide, 28px
 * under the figure on a phone and 32 from a tablet. Centred in what is left
 * under the subject's name. It drew the line alone, with no figure.
 */
export function SubjectEarly({ name }: { name: string }) {
  return (
    <div
      data-subject-early
      className="flex flex-1 flex-col items-center justify-center pt-6 text-center"
    >
      <EmptyArt
        src="/illustrations/empty-progress.png"
        className="h-[200px] shrink-0 md:h-[240px] xl:h-[250px]"
      />
      <p className="mt-7 max-w-[280px] text-base leading-[1.55] text-nevo-near-black/70 md:mt-8 md:max-w-[360px] md:text-[17px] xl:max-w-[400px]">
        You&apos;re just getting started in {name}. Check back after a few
        more lessons.
      </p>
    </div>
  );
}
