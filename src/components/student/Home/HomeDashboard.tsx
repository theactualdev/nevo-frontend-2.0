"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isOpenToStudent, unavailableReason } from "@/lib/lessons/availability";
import { lessonHref } from "@/lib/lessons/lessonHref";
import { segmentPlace, type SegmentPlace } from "@/lib/lessons/segmentPlace";
import { BookOpen, ChevronRight, Clock, Play, Shapes } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { IllustrationWrapper } from "@/components/shared";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { useHydrated } from "@/hooks/useHydrated";
import type { DashboardProgressRow } from "@/lib/api/students";
import { useDisplayName } from "@/components/student/Shell/useDisplayName";
import { useHasSession } from "@/hooks/useHasSession";
import { useStudentDashboard } from "@/hooks/useStudentDashboard";
import { TodaysWarmUpCard } from "@/components/student/Profiling/WarmUpCard";
import { LessonPreviewSheet } from "@/components/student/Lessons/LessonPreviewSheet";
import type { LessonSummary } from "@/components/student/Lessons/lessonCatalog";

/** One unfinished lesson on "Pick up where you left off" (SCRUM-146). */
interface PickUp {
  /**
   * React key - the assignment it came from, the lesson for one started from
   * the library, or the fixture's own id.
   */
  key: string;
  title: string;
  /** Omitted when the lesson carries none - never a guessed subject. */
  subject?: string;
  /**
   * HOW FAR IN, AS A RING AND NEVER IN WORDS (design D19 and D21, backend B51).
   *
   * The ring is back because the true fraction is on the wire: B51 said
   * `segmentPosition` is a zero-based cursor and `segmentCount` is every
   * segment, and put both on the progress row. Until then the two were
   * unexplained and a ring drawn from them was an amount we composed. Absent
   * when the row does not say, and then the card wears the plain mark.
   *
   * STILL NO PHRASE. This once cut the fraction at one third and two thirds
   * ("Just getting started", "About halfway in", "Almost there") - a threshold
   * we chose, which rule 3 forbids. The backend sends no phrase, so the card
   * shows none (D19).
   */
  place?: SegmentPlace;
  href: string;
}

/** One of Today's lessons. A tap opens the preview, as on the Lessons tab. */
interface TodayLesson {
  key: string;
  icon: LucideIcon;
  lesson: LessonSummary;
}

// ── Signed-out fixtures ─────────────────────────────────────────────────────
// The designed screen's own content (Nevo Home Frame, SCRUM-146), and ONLY for
// a visitor with no session. A signed-in child's lessons come from
// `useStudentDashboard` below.
const MOCK_LESSON_ID = "photosynthesis";
const MOCK_HREF = `/student/lessons/${MOCK_LESSON_ID}`;

const fixtureToday = (
  id: string,
  title: string,
  timeEstimate: string,
  icon: LucideIcon,
): TodayLesson => ({
  key: id,
  icon,
  lesson: {
    id,
    lessonId: MOCK_LESSON_ID,
    title,
    timeEstimate,
    status: "not_started",
  },
});

const TODAY: TodayLesson[] = [
  fixtureToday("telling-the-time", "Telling the Time", "About 10 min", Clock),
  fixtureToday("the-lighthouse", "The Lighthouse", "About 15 min", BookOpen),
  fixtureToday("shapes-around-us", "Shapes Around Us", "About 8 min", Shapes),
];

// The frame's rings, from positions like a real row's, and no phrase: the
// walkthrough is what a real child's card looks like, and it must not model
// the pattern D19 retired.
const fixturePlace = (segmentPosition: number, segmentCount: number) =>
  segmentPlace({ segmentPosition, segmentCount }) ?? undefined;

const PICKUP: PickUp[] = [
  {
    key: "adding-fractions",
    title: "Adding Fractions",
    subject: "Mathematics",
    place: fixturePlace(5, 9),
    href: MOCK_HREF,
  },
  {
    key: "the-water-cycle",
    title: "The Water Cycle",
    subject: "Science",
    place: fixturePlace(2, 11),
    href: MOCK_HREF,
  },
  {
    key: "punctuation-marks",
    title: "Punctuation Marks",
    subject: "English",
    place: fixturePlace(6, 7),
    href: MOCK_HREF,
  },
];

/**
 * The frame's caught-up note. It shows where the frame's caught-up state
 * does - nothing left part-way - and, by design's D99 (6 Oct), where nothing
 * new is waiting and the only work is a lesson part-way: "the part-way lesson
 * appears in continue-where-you-left-off, and the slot below shows the
 * caught-up state. A child with one unfinished lesson is not empty-handed."
 */
const CAUGHT_UP = "You're all caught up. Nice and steady - come back any time.";

/** At most five on "Pick up where you left off", by design (SCRUM-146). */
const PICKUP_MAX = 5;

/**
 * The dated eyebrow depends on the viewer's local clock, which only the client
 * knows — computing it during render would mismatch the server HTML on
 * hydration. Resolve it after mount instead. (The greeting itself is fixed:
 * time-of-day greetings were removed by the v1 build lock.)
 */
function useLocalDate() {
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    // Client-only clock read, once on mount — keeps SSR + hydration in agreement.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDate(
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    );
  }, []);
  return date;
}

/**
 * ZERO AND ABSENT BOTH MEAN "NO ESTIMATE" - the same rule `useStudentLessons`
 * applies to the Lessons tab's cards, so one lesson reads the same on both.
 * Today's cards used to say "Due 3 Oct" here instead; the frame draws the time
 * and SCRUM-146 keeps dates off Home altogether.
 */
function timeEstimate(lesson: {
  estimatedMinutes?: number;
  segmentCount: number;
}): string {
  const minutes = lesson.estimatedMinutes;
  if (minutes && minutes > 0) return `About ${minutes} min`;
  const count = lesson.segmentCount;
  return `${count} ${count === 1 ? "section" : "sections"}`;
}

/**
 * Home Dashboard (screen 19, SCRUM-146). Today's lessons first, then up to five
 * unfinished lessons under "Pick up where you left off" - each with its subject,
 * never a date. When nothing is outstanding that section is absent entirely,
 * and a quiet note says so. Reduced-motion aware; a settled empty state
 * when nothing has been set yet.
 */
export function HomeDashboard() {
  const { name: displayName } = useDisplayName();
  const date = useLocalDate();
  const signedIn = useHasSession();
  const hydrated = useHydrated();
  const { data: live, failed, loading } = useStudentDashboard();
  const [preview, setPreview] = useState<LessonSummary | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  let today: TodayLesson[] = TODAY;
  let pickup: PickUp[] = PICKUP;
  /** Something has been set for this child, even if it is all done now. */
  let everSet = true;

  if (signedIn) {
    if (live) {
      // Newest row per lesson wins; the feed is not guaranteed to be ordered.
      const latest = new Map<string, DashboardProgressRow>();
      for (const row of live.recentProgress) {
        const held = latest.get(row.lessonId);
        if (!held || Date.parse(row.updatedAt) > Date.parse(held.updatedAt)) {
          latest.set(row.lessonId, row);
        }
      }

      /*
       * FILTERED ONCE, HERE, BECAUSE THIS SCREEN BUILDS TWO LISTS FROM IT.
       *
       * Cancelled, not open yet, and finished all leave here. A cancelled
       * lesson a child had already started used to be promoted onto the
       * biggest card on the screen, because only one of the two lists was
       * filtered. And `completed` - real in the enum since 25 Sep - was
       * treated as open, so a finished lesson stayed in Today's list and was
       * counted in its "N ready".
       */
      const open = live.assignments.filter((a) => isOpenToStudent(a));

      // `exited` counts as part-way. A child who deliberately left a lesson is
      // still partway through it - the status records HOW they left, not
      // whether they are done. `useStudentLessons` folds the two the same way.
      const partWay = (lessonId: string) => {
        const status = latest.get(lessonId)?.status;
        return status === "in_progress" || status === "exited";
      };

      const assigned = open
        .filter((a) => partWay(a.lesson.id))
        .map((a) => {
          const row = latest.get(a.lesson.id)!;
          const subject = a.lesson.subject?.trim();
          const place = segmentPlace(row);
          return {
            at: row.updatedAt,
            item: {
              key: a.id,
              title: a.lesson.title,
              ...(subject ? { subject } : {}),
              ...(place ? { place } : {}),
              // Straight back in, with the assignment riding the link - a
              // lesson the child is already in needs no preview.
              href: lessonHref(a.lesson.id, a.id),
            },
          };
        });

      /*
       * AND THE ONES THEY STARTED FROM THE LIBRARY (backend B52, 5 Oct).
       *
       * The progress row carries the lesson's own title and subject now, so a
       * lesson no teacher set can sit here beside the set ones. A lesson ANY
       * assignment names is not one of these, whatever that assignment's
       * state: a cancelled or not-yet-open one was filtered out above on
       * purpose, and must not come back in through this door. A row with no
       * title is left off - a card with no name is not a lesson a child can
       * recognise, and we will not write one for it. No assignment, so the
       * link carries none (`lessonHref`).
       */
      const setWork = new Set(live.assignments.map((a) => a.lesson.id));
      const library = [...latest.values()]
        .filter((row) => !setWork.has(row.lessonId) && partWay(row.lessonId))
        .flatMap((row) => {
          const title = row.title?.trim();
          if (!title) return [];
          const subject = row.subject?.trim();
          const place = segmentPlace(row);
          return [
            {
              at: row.updatedAt,
              item: {
                key: `library-${row.lessonId}`,
                title,
                ...(subject ? { subject } : {}),
                ...(place ? { place } : {}),
                href: lessonHref(row.lessonId),
              },
            },
          ];
        });

      // Most recently touched first, whichever door the lesson came in by.
      pickup = [...assigned, ...library]
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, PICKUP_MAX)
        .map((p) => p.item);

      /*
       * TODAY'S LESSONS CARRIES ONLY WORK NOT YET STARTED (SCRUM-146).
       *
       * Any progress row at all takes a lesson out: part-way ones moved to the
       * list below, and a completed row is finished even when the assignment's
       * own status has not caught up.
       */
      today = open
        .filter((a) => !latest.has(a.lesson.id))
        .map((a) => {
          const subject = a.lesson.subject?.trim();
          const description = a.lesson.description?.trim();
          return {
            key: a.id,
            icon: BookOpen,
            lesson: {
              id: a.id,
              lessonId: a.lesson.id,
              assignmentId: a.id,
              title: a.lesson.title,
              timeEstimate: timeEstimate(a.lesson),
              status: "not_started" as const,
              ...(subject ? { subject } : {}),
              ...(description ? { description } : {}),
            },
          };
        });

      // Finished work is still work that was set: a child who has done
      // everything is caught up, not waiting on a first lesson.
      everSet =
        today.length > 0 ||
        pickup.length > 0 ||
        live.assignments.some(
          (a) =>
            unavailableReason(a) === null &&
            (a.status === "completed" ||
              latest.get(a.lesson.id)?.status === "completed"),
        );
    } else {
      today = [];
      pickup = [];
      everSet = false;
    }
  }
  const nothingSet = signedIn && Boolean(live) && !everSet;

  /*
   * THE NOTE IS THE FRAME'S CAUGHT-UP LINE, OR NOTHING - signed in or not.
   *
   * Every child used to read "Go at your own pace - Nevo keeps up with you",
   * which no frame draws. The frame's line for work outstanding ("You've been
   * showing up this week") was a claim about the child that nothing here
   * verifies, and design took it out (D98, 6 Oct): Home shows no note while
   * new lessons AND part-way ones are both waiting. The signed-out
   * walkthrough follows the same rule, since it is what a real child's Home
   * looks like. The caught-up line states only what this screen can see, and
   * needs a read to see it.
   *
   * With nothing new today it shows even beside a part-way lesson (D99).
   */
  const note =
    (!signedIn || live) && (pickup.length === 0 || today.length === 0)
      ? CAUGHT_UP
      : null;

  const openPreview = (lesson: LessonSummary) => {
    setPreview(lesson);
    setPreviewOpen(true);
  };

  // NOT HYDRATED IS NOT SIGNED OUT. `useHasSession()` is false on the server,
  // so without this the SSR pass and the first client render take the fixture
  // branch below - and a signed-in child gets a frame of another child's
  // dashboard before hydration swaps it out. Home and Lessons were the two
  // surfaces still missing this gate; Progress, Subject Detail, Connect and
  // Downloads all had it. Found by marking the fixture branch with
  // `SampleRegion` and then seeing `student:home` in the server markup for a
  // request that carried a student's cookie.
  if (!hydrated || (signedIn && loading)) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-5 py-2 pb-8 sm:px-8 sm:py-6 lg:max-w-[860px]">
        <div className="mt-2 h-9 w-64 animate-pulse rounded bg-nevo-cream-elevated" />
        <div className="mt-7 grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[150px] animate-pulse rounded-[12px] bg-nevo-cream-elevated"
            />
          ))}
        </div>
      </div>
    );
  }

  if (signedIn && failed) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-5 py-2 pb-8 sm:px-8 sm:py-6 lg:max-w-[860px]">
        <h1 className="mt-2 text-[28px] font-semibold leading-[1.12] tracking-[-0.02em] text-nevo-near-black sm:text-[34px]">
          Welcome back{displayName ? `, ${displayName}` : ""}
        </h1>
        {/* The warm-up does not wait on the lessons read (D18). */}
        <TodaysWarmUpCard />
        <div className="mt-8 rounded-[16px] bg-nevo-cream-elevated p-[22px] shadow-elevation-1">
          <p className="text-[17px] font-semibold text-nevo-near-black">
            We couldn&rsquo;t load your lessons just now
          </p>
          <p className="mt-1.5 text-[15px] leading-[1.5] text-nevo-near-black/68">
            Nothing is lost. Give it a moment and try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 flex h-[48px] cursor-pointer items-center rounded-[12px] bg-nevo-navy px-7 text-[15px] font-medium text-nevo-cream"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ONE BODY, TWO MEANINGS. Everything above fills `today` and `pickup` from
  // the live read when there is a session, and from the fixtures when there is
  // not, so this markup is the child's own dashboard OR the designed
  // walkthrough depending only on who is looking. The mark has to go on the
  // second, and this used to wrap both: a signed-in child whose read SUCCEEDED
  // fell through to here and had their real data stamped `student:home`. That
  // is the sample mark lying in the more dangerous direction - the end-to-end
  // assertion it exists for ("no sample marks once signed in") would have
  // failed on a perfectly healthy Home, and the obvious way to make that test
  // pass is to delete the mark.
  const body = (
    <div className="mx-auto w-full max-w-[720px] px-5 py-2 pb-8 sm:px-8 sm:py-6 lg:max-w-[860px]">
      {/* Greeting */}
      <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
        <span className="flex h-4 items-center font-mono text-[11px] tracking-[0.14em] text-nevo-near-black/60 uppercase">
          {date ?? ""}
        </span>
        <h1 className="mt-2 text-[28px] font-semibold leading-[1.12] tracking-[-0.02em] text-nevo-near-black sm:text-[34px]">
          Welcome back{displayName ? `, ${displayName}` : ""}
        </h1>
      </div>

      {/* The daily warm-up opens the session (SCRUM-104) - a quick
          calibration presented as a game, never an assessment. Above the
          lessons rather than among them: it shows whether or not any are
          queued (D18, 1 Oct). */}
      <TodaysWarmUpCard />

      {nothingSet ? (
        // 29 Empty States, "Home (No lessons)": the illustration and one line.
        // It used to praise the child ("Nice work staying on top of things")
        // for having nothing, which is not something they did.
        <EmptyState line="Your teacher is setting up your first lesson" />
      ) : (
        <>
          {/*
            NOTHING NEW TODAY, AND THE ONLY LESSON IS PART-WAY (design D99,
            6 Oct). "Today" means open from today - `isOpenToStudent` reads
            `availableFrom`, never `dueAt` - and the heading and grid give way
            rather than draw with nothing in them (D20). The slot used to hold
            an empty state ("Your lessons will show up here soon"), which told
            a child with a lesson underway they had nothing. Design: "the
            part-way lesson appears in continue-where-you-left-off, and the
            slot below shows the caught-up state" - the note under the list.

            Absent rather than an empty heading when nothing new is set - the
            frame never draws Today's lessons with nothing under it.
          */}
          {today.length > 0 && (
            <section aria-labelledby="home-today">
              <div className="mt-7 flex items-baseline justify-between motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500 motion-safe:[animation-delay:140ms]">
                <h2
                  id="home-today"
                  className="text-[17px] font-semibold tracking-[-0.01em] text-nevo-near-black"
                >
                  Today&apos;s lessons
                </h2>
                <span className="text-[13px] text-nevo-near-black/60">
                  {today.length} ready
                </span>
              </div>

              {/* 2-up grid on mobile, 3-up from tablet. Never a horizontal
                  rail - a nested scroller inside the vertical page is off the
                  gesture set (SCRUM-94 G5), and scroll-snap overrides the
                  student's own deceleration curve. */}
              <div className="mt-3.5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4">
                {today.map((item, i) => (
                  <TodayCard
                    key={item.key}
                    item={item}
                    index={i}
                    onOpen={() => openPreview(item.lesson)}
                  />
                ))}
              </div>
            </section>
          )}

          {pickup.length > 0 && (
            <section
              aria-labelledby="home-pickup"
              className="mt-[34px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500 motion-safe:[animation-delay:260ms]"
            >
              <h2
                id="home-pickup"
                className="text-[17px] font-semibold tracking-[-0.01em] text-nevo-near-black"
              >
                Pick up where you left off
              </h2>
              <div className="mt-3.5 flex flex-col gap-3">
                {pickup.map((item) => (
                  <PickUpCard key={item.key} item={item} />
                ))}
              </div>
            </section>
          )}

          {note && (
            <div className="mt-8 flex items-center gap-3.5 rounded-[12px] bg-nevo-violet/14 px-5 py-[18px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500 motion-safe:[animation-delay:340ms]">
              <span className="size-2.5 shrink-0 rounded-full bg-nevo-violet" />
              <p className="text-[15px] leading-[1.45] text-nevo-near-black">
                {note}
              </p>
            </div>
          )}
        </>
      )}

      <LessonPreviewSheet
        lesson={preview}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );

  // Signed in and the read succeeded: this is the child's own week. No mark.
  if (signedIn) return body;

  // Signed out: a fictional child's lessons and a sentence about their week, so
  // the region is marked - an end-to-end run that reaches it while signed in
  // must fail rather than read the fixtures as the answer it was asserting.
  return <SampleRegion kind="student:home">{body}</SampleRegion>;
}

/** One unfinished lesson - straight back in, no preview in the way. */
function PickUpCard({ item }: { item: PickUp }) {
  return (
    <Link
      href={item.href}
      className="flex cursor-pointer items-center gap-4 rounded-[12px] bg-nevo-cream-elevated px-[18px] py-4 shadow-elevation-1 transition-transform active:scale-[0.98]"
    >
      {item.place ? <PickUpRing place={item.place} /> : <PickUpMark />}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold tracking-[-0.005em] text-nevo-near-black">
          {item.title}
        </span>
        {item.subject && (
          <span className="mt-1 block text-[13px] text-nevo-near-black/55">
            {item.subject}
          </span>
        )}
      </span>
      <ChevronRight
        className="size-5 shrink-0 text-nevo-navy"
        strokeWidth={2.2}
        aria-hidden
      />
    </Link>
  );
}

/** The frame's ring: r 24 on a 54 box, so this is its full length. */
const RING_LENGTH = 2 * Math.PI * 24;

/**
 * The frame's ring, run to the child's own fraction (backend B51), with the
 * play glyph in the middle.
 *
 * Read aloud as the position in words, never as a number (rule 9). The arc is
 * left off entirely at the very start rather than drawn as zero, because a
 * round cap on a zero-length dash still paints a dot - an amount nobody sent.
 */
function PickUpRing({ place }: { place: SegmentPlace }) {
  return (
    <span
      role="img"
      aria-label={place.words}
      className="relative flex size-[54px] shrink-0 items-center justify-center text-nevo-navy"
      data-pickup-ring
    >
      <svg
        viewBox="0 0 54 54"
        className="absolute inset-0 size-full -rotate-90"
        aria-hidden
      >
        <circle
          cx="27"
          cy="27"
          r="24"
          fill="none"
          stroke="rgba(59,63,110,0.14)"
          strokeWidth="4"
        />
        {place.fraction > 0 && (
          <circle
            cx="27"
            cy="27"
            r="24"
            fill="none"
            stroke="var(--color-nevo-violet)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - place.fraction)}
          />
        )}
      </svg>
      <Play
        className="relative size-[17px]"
        fill="currentColor"
        strokeWidth={0}
        aria-hidden
      />
    </span>
  );
}

/**
 * The plain mark, for a lesson whose row does not say how far in (design D21).
 *
 * Not a ring with nothing on it: any ring reads as an amount - a full circle
 * as finished, a bare track as not begun. So the mark is the frame's play
 * glyph on a plain tinted disc. It says what tapping does and nothing about
 * how far.
 */
function PickUpMark() {
  return (
    <span
      className="flex size-[54px] shrink-0 items-center justify-center rounded-full bg-nevo-violet/18 text-nevo-navy"
      aria-hidden
      data-pickup-mark
    >
      <Play className="size-[17px]" fill="currentColor" strokeWidth={0} />
    </span>
  );
}

/** 29 Empty States: the Home illustration and one line, nothing more. */
function EmptyState({ line }: { line: string }) {
  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-6 text-center">
      <IllustrationWrapper
        src="/illustrations/welcome-settling.png"
        alt=""
        width={697}
        height={598}
        className="w-[180px]"
      />
      <h2 className="mt-7 max-w-[280px] text-[19px] font-medium leading-[1.35] text-nevo-near-black">
        {line}
      </h2>
    </div>
  );
}

/**
 * One of Today's lessons — icon header, title, time estimate. Opens the lesson
 * preview, as the flow reference and IA draw it: a lesson not yet started gets
 * the calm look before committing, the same as from the Lessons tab.
 */
function TodayCard({
  item,
  index,
  onOpen,
}: {
  item: TodayLesson;
  index: number;
  onOpen: () => void;
}) {
  const Icon = item.icon;
  // Alternating violet tints, matching the frame's rhythm.
  const tints = [
    "bg-nevo-violet/18",
    "bg-nevo-violet/12",
    "bg-nevo-violet/[0.22]",
  ];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="cursor-pointer overflow-hidden rounded-[12px] bg-nevo-cream-elevated text-left shadow-elevation-1 transition-transform active:scale-[0.98] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500"
      style={{ animationDelay: `${180 + index * 60}ms` }}
    >
      <div
        className={`flex h-[88px] items-center justify-center text-nevo-navy ${tints[index % tints.length]}`}
      >
        <Icon className="size-10" strokeWidth={2} />
      </div>
      <div className="p-3.5">
        <p className="text-[15px] font-semibold leading-[1.3] text-nevo-near-black">
          {item.lesson.title}
        </p>
        <p className="mt-1.5 text-[13px] text-nevo-near-black/60">
          {item.lesson.timeEstimate}
        </p>
      </div>
    </button>
  );
}
