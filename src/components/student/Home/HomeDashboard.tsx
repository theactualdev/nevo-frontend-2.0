"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isOpenToStudent, unavailableReason } from "@/lib/lessons/availability";
import { lessonHref } from "@/lib/lessons/lessonHref";
import { BookOpen, ChevronRight, Clock, Play, Shapes } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { IllustrationWrapper } from "@/components/shared";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { useHydrated } from "@/hooks/useHydrated";
import { warmUpDoneToday } from "@/lib/profiling/warmUpDone";
import { getSession } from "@/lib/auth/session";
import type { DashboardProgressRow } from "@/lib/api/students";
import { useDisplayName } from "@/components/student/Shell/useDisplayName";
import { useHasSession } from "@/hooks/useHasSession";
import { useStudentDashboard } from "@/hooks/useStudentDashboard";
import { useWarmUpDimension } from "@/hooks/useWarmUpDimension";
import { WarmUpCard } from "@/components/student/Profiling/WarmUpCard";
import { dimensionForToday } from "@/components/student/Profiling/WarmUpRun";
import { LessonPreviewSheet } from "@/components/student/Lessons/LessonPreviewSheet";
import type { LessonSummary } from "@/components/student/Lessons/lessonCatalog";

/** One unfinished lesson on "Pick up where you left off" (SCRUM-146). */
interface PickUp {
  /** React key - the assignment it came from, or the fixture's own id. */
  key: string;
  title: string;
  /** Omitted when the lesson carries none - never a guessed subject. */
  subject?: string;
  /** 0–1 through the lesson. Drives the ring; never shown as a number. */
  progress: number;
  note: string;
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

const PICKUP: PickUp[] = [
  {
    key: "adding-fractions",
    title: "Adding Fractions",
    subject: "Mathematics",
    progress: 0.55,
    note: "A little over halfway",
    href: MOCK_HREF,
  },
  {
    key: "the-water-cycle",
    title: "The Water Cycle",
    subject: "Science",
    progress: 0.18,
    note: "Just getting started",
    href: MOCK_HREF,
  },
  {
    key: "punctuation-marks",
    title: "Punctuation Marks",
    subject: "English",
    progress: 0.85,
    note: "Almost there",
    href: MOCK_HREF,
  },
];

/** The frame's note while there is unfinished work - a fictional child's week. */
const ENCOURAGEMENT =
  "You've been showing up this week. Keep going at your own pace.";

/**
 * The frame's note when nothing is outstanding. True whenever it shows: it is
 * gated on the very thing it states, that no lesson is left part-way.
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
 * "Just getting started" and the rest - a bucket, never a number.
 *
 * Coarse on purpose: whether `segmentPosition` is 0- or 1-based is unstated, so
 * the fraction may be off by one segment and the note only ever claims a
 * bucket. "Just getting started" and "Almost there" are the frame's words.
 */
function noteFor(fraction: number): string {
  if (fraction < 1 / 3) return "Just getting started";
  if (fraction < 2 / 3) return "About halfway in";
  return "Almost there";
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
 * unfinished lessons under "Pick up where you left off" - each with its subject
 * and how far in, never a date - and a quiet note. When nothing is outstanding
 * that section is absent entirely. Reduced-motion aware; a settled empty state
 * when nothing has been set yet.
 */
export function HomeDashboard() {
  const { name: displayName } = useDisplayName();
  const date = useLocalDate();
  const signedIn = useHasSession();
  const hydrated = useHydrated();
  const { data: live, failed, loading } = useStudentDashboard();
  const warmUpDimension = useWarmUpDimension(dimensionForToday());
  const [preview, setPreview] = useState<LessonSummary | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  let today: TodayLesson[] = TODAY;
  let pickup: PickUp[] = PICKUP;
  let note: string | null = ENCOURAGEMENT;
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

      pickup = open
        .filter((a) => partWay(a.lesson.id))
        .sort(
          (a, b) =>
            Date.parse(latest.get(b.lesson.id)!.updatedAt) -
            Date.parse(latest.get(a.lesson.id)!.updatedAt),
        )
        .slice(0, PICKUP_MAX)
        .map((a) => {
          const row = latest.get(a.lesson.id)!;
          const count = a.lesson.segmentCount;
          const progress =
            count > 0
              ? Math.max(0, Math.min(1, row.segmentPosition / count))
              : 0;
          const subject = a.lesson.subject?.trim();
          return {
            key: a.id,
            title: a.lesson.title,
            ...(subject ? { subject } : {}),
            progress,
            note: noteFor(progress),
            // Straight back in, with the assignment riding the link - a
            // lesson the child is already in needs no preview.
            href: lessonHref(a.lesson.id, a.id),
          };
        });

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

      /*
       * THE NOTE IS THE FRAME'S CAUGHT-UP LINE, OR NOTHING.
       *
       * Every child used to read "Go at your own pace - Nevo keeps up with
       * you", which no frame draws. The frame's line for a child with work
       * outstanding ("You've been showing up this week") is a claim about the
       * child that nothing here verifies, so it waits on design. The
       * caught-up line states only what this screen can see.
       */
      note = pickup.length === 0 ? CAUGHT_UP : null;

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
      note = null;
      everSet = false;
    }
  }
  const nothingSet = signedIn && Boolean(live) && !everSet;

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

      {nothingSet ? (
        // 29 Empty States, "Home (No lessons)": the illustration and one line.
        // It used to praise the child ("Nice work staying on top of things")
        // for having nothing, which is not something they did.
        <div className="flex flex-col items-center px-6 pt-12 pb-6 text-center">
          <IllustrationWrapper
            src="/illustrations/welcome-settling.png"
            alt=""
            width={697}
            height={598}
            className="w-[180px]"
          />
          <h2 className="mt-7 max-w-[280px] text-[19px] font-medium leading-[1.35] text-nevo-near-black">
            Your teacher is setting up your first lesson
          </h2>
        </div>
      ) : (
        <>
          {/* The daily warm-up opens the session (SCRUM-104) - a quick
              calibration presented as a game, never an assessment. */}
          {/* The same dimension the run will use - the card naming one task
              and the run opening another would be a small, avoidable lie. */}
          <WarmUpCard
            dimension={warmUpDimension}
            /*
             * Read during render behind `hydrated`, not from an effect: the
             * answer lives in localStorage, which the server cannot see, and
             * setting state to say so trips `set-state-in-effect`. Same shape
             * the run itself uses.
             *
             * False until hydrated means the live card is what renders first,
             * which is the right way round - offering a warm-up to a child who
             * has done one is a smaller wrong than telling a child who has not
             * that they have.
             */
            done={hydrated && warmUpDoneToday(getSession()?.userId)}
          />

          {/* Absent rather than an empty heading when nothing new is set -
              the frame never draws Today's lessons with nothing under it. */}
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
      <ProgressRing value={item.progress} />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold tracking-[-0.005em] text-nevo-near-black">
          {item.title}
        </span>
        {item.subject && (
          <span className="mt-1 block text-[13px] text-nevo-near-black/55">
            {item.subject}
          </span>
        )}
        <span className="mt-[5px] block text-sm text-nevo-near-black/68">
          {item.note}
        </span>
      </span>
      <ChevronRight
        className="size-5 shrink-0 text-nevo-navy"
        strokeWidth={2.2}
        aria-hidden
      />
    </Link>
  );
}

/** A quiet violet arc on a navy-tinted track, with a play glyph — never a %. */
function ProgressRing({ value }: { value: number }) {
  const r = 24;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(1, value)));
  return (
    <span className="relative size-[54px] shrink-0" aria-hidden>
      <svg
        width="54"
        height="54"
        viewBox="0 0 54 54"
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx="27"
          cy="27"
          r={r}
          fill="none"
          stroke="rgba(59,63,110,0.14)"
          strokeWidth="4"
        />
        <circle
          cx="27"
          cy="27"
          r={r}
          fill="none"
          stroke="#9a9ccb"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-nevo-navy">
        <Play className="size-[17px]" fill="currentColor" strokeWidth={0} />
      </span>
    </span>
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
