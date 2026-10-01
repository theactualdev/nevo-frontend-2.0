"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isOpenToStudent } from "@/lib/lessons/availability";
import { BookOpen, Clock, Play, Shapes } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EmptyState, IllustrationWrapper } from "@/components/shared";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { useHydrated } from "@/hooks/useHydrated";
import { warmUpDoneToday } from "@/lib/profiling/warmUpDone";
import { getSession } from "@/lib/auth/session";
import { useDisplayName } from "@/components/student/Shell/useDisplayName";
import { useHasSession } from "@/hooks/useHasSession";
import { useStudentDashboard } from "@/hooks/useStudentDashboard";
import { useWarmUpDimension } from "@/hooks/useWarmUpDimension";
import { WarmUpCard } from "@/components/student/Profiling/WarmUpCard";
import { dimensionForToday } from "@/components/student/Profiling/WarmUpRun";

// ── Signed-out fixtures ─────────────────────────────────────────────────────
// The designed screen's own content, and ONLY for a visitor with no session.
// A signed-in child's continue card, today's lessons and encouragement line all
// come from `useStudentDashboard` below - the contracts landed and are read.
interface InProgress {
  lessonId: string;
  title: string;
  /** 0–1 through the lesson. */
  progress: number;
  note: string;
  /** Null renders the card without a destination - see the live mapping. */
  href: string | null;
  /**
   * Present when the student is mid-module in a modular lesson (SCRUM-101.4):
   * the card's middle line names the module instead of the segment hint.
   * `index` is 0-based; `title` falls back to the bare position when absent.
   */
  module?: { index: number; count: number; title?: string };
}
interface TodayLesson {
  lessonId: string;
  title: string;
  time: string;
  icon: LucideIcon;
  href: string | null;
}

const CONTINUE: InProgress | null = {
  lessonId: "photosynthesis",
  title: "Photosynthesis",
  progress: 0.55,
  note: "A little over halfway",
  href: "/student/lessons/photosynthesis",
  module: { index: 1, count: 2, title: "Practice" },
};

const MOCK_HREF = "/student/lessons/photosynthesis";
const TODAY: TodayLesson[] = [
  {
    lessonId: "photosynthesis",
    title: "Telling the Time",
    time: "About 10 min",
    icon: Clock,
    href: MOCK_HREF,
  },
  {
    lessonId: "photosynthesis",
    title: "The Lighthouse",
    time: "About 15 min",
    icon: BookOpen,
    href: MOCK_HREF,
  },
  {
    lessonId: "photosynthesis",
    title: "Shapes Around Us",
    time: "About 8 min",
    icon: Shapes,
    href: MOCK_HREF,
  },
];

const ENCOURAGEMENT =
  "You've been showing up this week. Keep going at your own pace.";

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
 * Home Dashboard (screen 19). The student's calm landing surface: pick back up
 * where they left off (primary), today's lessons (secondary), and a warm,
 * pace-affirming note (tertiary — never a score or a streak count). Reduced-motion
 * aware; a settled empty state when there's nothing queued.
 */
/**
 * A lesson link that remembers which assignment it came from.
 *
 * Read back by the player and sent on every progress write. Omitted when there
 * is no assignment, rather than sent empty: a library lesson is not set work,
 * and saying otherwise files a child's own reading under a teacher's name.
 */
function assignmentHref(lessonId: string, assignmentId?: string): string {
  const base = `/student/lessons/${lessonId}`;
  return assignmentId
    ? `${base}?assignment=${encodeURIComponent(assignmentId)}`
    : base;
}

export function HomeDashboard() {
  const { name: displayName } = useDisplayName();
  const date = useLocalDate();
  const signedIn = useHasSession();
  const hydrated = useHydrated();
  const { data: live, failed, loading } = useStudentDashboard();
  const warmUpDimension = useWarmUpDimension(dimensionForToday());

  // Live rows are mapped into the frame's own shapes so the designed cards
  // render either source. These used to carry `href: null` - the player
  // resolved mock ids only, so a real assignment had nowhere to go and the
  // card stated it rather than leading a child into "this page doesn't
  // exist". The player reads live content now, so they link.
  let cont: InProgress | null = CONTINUE;
  let today: TodayLesson[] = TODAY;
  let encouragement = ENCOURAGEMENT;
  if (signedIn) {
    if (live) {
      /*
       * FILTERED ONCE, HERE, BECAUSE THIS SCREEN BUILDS TWO LISTS FROM IT.
       *
       * Today's lessons is the obvious one. The other is the Pick Back Up card,
       * which crosses recentProgress against this map - and it was the worse
       * leak of the two: Today's list excludes whatever is on the continue card
       * BY ID, so a cancelled lesson a child had already started did not merely
       * survive, it was promoted out of the small grid into the single biggest
       * card on the screen.
       *
       * Filtering the array both lists come from closes both, and cannot be
       * half-applied later.
       *
       * The old filter below read `a.status !== "completed"`, which is a
       * comparison that can never be false: `AssignmentStatus` is
       * "assigned" | "cancelled" and has no "completed" member. `Assignment`
       * types the field as a plain `string`, so nothing stopped it being
       * written and typecheck will not stop it coming back - only the tests
       * will.
       */
      const open = live.assignments.filter((a) => isOpenToStudent(a));
      const byLesson = new Map(open.map((a) => [a.lesson.id, a]));
      const ip = [...live.recentProgress]
        // `exited` counts. A child who deliberately left a lesson is still
        // partway through it - the status records HOW they left, not whether
        // they are done. Filtering it out meant tapping "Leave for now" removed
        // the lesson from Pick Back Up altogether, and sent it back to Today's
        // lessons as though it had never been opened.
        //
        // The regression arrived with the exited write in #199: before that,
        // leaving wrote nothing, so the row stayed `in_progress` and the card
        // survived. `useStudentLessons` already folds the two statuses
        // together for its calm indicator; this filter did not.
        .filter((r) => r.status === "in_progress" || r.status === "exited")
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .find((r) => byLesson.get(r.lessonId));
      const ipLesson = ip ? byLesson.get(ip.lessonId)!.lesson : null;
      // Coarse on purpose: whether segmentPosition is 0- or 1-based is
      // unstated, so the fraction may be off by one segment and the note
      // only ever claims a bucket, never a number.
      const frac =
        ip && ipLesson && ipLesson.segmentCount > 0
          ? Math.max(0, Math.min(1, ip.segmentPosition / ipLesson.segmentCount))
          : 0;
      cont =
        ip && ipLesson
          ? {
              lessonId: ip.lessonId,
              title: ipLesson.title,
              progress: frac,
              note:
                frac < 1 / 3
                  ? "Just getting started"
                  : frac < 2 / 3
                    ? "About halfway in"
                    : "Nearly there",
              /*
               * THE ASSIGNMENT RIDES THE LINK.
               *
               * `ProgressWrite.assignmentId` has been typed and unsent since
               * the contract shipped, so every progress write said a child had
               * moved through a lesson and never which set work that was. The
               * player's route is `/student/lessons/{id}` and knows nothing
               * about assignments, but this card does - it was built from one.
               *
               * Only on cards that genuinely came from an assignment. A lesson
               * opened from the library carries none, which is the truth.
               */
              href: assignmentHref(ip.lessonId, byLesson.get(ip.lessonId)?.id),
            }
          : null;
      const contId = cont ? cont.lessonId : null;
      today = open
        .filter((a) => a.lesson.id !== contId)
        .map((a) => ({
          lessonId: a.lesson.id,
          title: a.lesson.title,
          time: a.dueAt
            ? `Due ${new Date(a.dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
            : `${a.lesson.segmentCount} ${a.lesson.segmentCount === 1 ? "section" : "sections"}`,
          icon: BookOpen,
          href: assignmentHref(a.lesson.id, a.id),
        }));
      // The designed line claims "You've been showing up this week" - a
      // claim about the child that nothing verifies. Live students get a
      // line that asserts nothing. Flagged to design.
      encouragement = "Go at your own pace - Nevo keeps up with you.";
    } else {
      cont = null;
      today = [];
      encouragement = "";
    }
  }
  const nothingQueued = signedIn
    ? Boolean(live) && !cont && today.length === 0
    : !cont && today.length === 0;

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
        <div className="mt-6 h-[132px] animate-pulse rounded-[16px] bg-nevo-cream-elevated" />
        <div className="mt-8 grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4">
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

  // ONE BODY, TWO MEANINGS. Everything above fills `cont` and `today` from the
  // live read when there is a session, and from the fixtures when there is not,
  // so this markup is the child's own dashboard OR the designed walkthrough
  // depending only on who is looking. The mark has to go on the second, and
  // this used to wrap both: a signed-in child whose read SUCCEEDED fell through
  // to here and had their real data stamped `student:home`. That is the sample
  // mark lying in the more dangerous direction - the end-to-end assertion it
  // exists for ("no sample marks once signed in") would have failed on a
  // perfectly healthy Home, and the obvious way to make that test pass is to
  // delete the mark.
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

      {nothingQueued ? (
        <div className="mt-10">
          <EmptyState
            illustration={
              <IllustrationWrapper
                src="/illustrations/welcome-settling.png"
                alt=""
                width={697}
                height={598}
                className="w-[180px]"
              />
            }
            title="Nothing waiting right now"
            description="When your teacher assigns a lesson, it'll show up here. Nice work staying on top of things."
          />
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

          {cont && <ContinueCard lesson={cont} />}

          <div className="mt-8 flex items-baseline justify-between motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500 motion-safe:[animation-delay:200ms]">
            <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-nevo-near-black">
              Today&apos;s lessons
            </h2>
            {today.length > 0 && (
              <span className="text-[13px] text-nevo-near-black/60">
                {today.length} ready
              </span>
            )}
          </div>

          {/* 2-up grid on mobile, 3-up from tablet. Never a horizontal rail - a
              nested scroller inside the vertical page is off the gesture set
              (SCRUM-94 G5), and scroll-snap overrides the student's own
              deceleration curve. */}
          <div className="mt-3.5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-4">
            {today.map((lesson, i) => (
              <LessonCard key={i} lesson={lesson} index={i} />
            ))}
          </div>

          {encouragement && (
            <div className="mt-8 flex items-center gap-3.5 rounded-[12px] bg-nevo-violet/14 px-5 py-[18px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500 motion-safe:[animation-delay:320ms]">
              <span className="size-2.5 shrink-0 rounded-full bg-nevo-violet" />
              <p className="text-[15px] leading-[1.45] text-nevo-near-black">
                {encouragement}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );

  // Signed in and the read succeeded: this is the child's own week. No mark.
  if (signedIn) return body;

  // Signed out: a fictional child's lessons and a sentence about their week, so
  // the region is marked - an end-to-end run that reaches it while signed in
  // must fail rather than read the fixtures as the answer it was asserting.
  return <SampleRegion kind="student:home">{body}</SampleRegion>;
}

/** Primary "pick back up" card — the one at Design System Level 3 elevation. */
function ContinueCard({ lesson }: { lesson: InProgress }) {
  // No destination -> no Link, no Continue button, no play glyph. A card that
  // states the fact of the lesson beats one whose Play lands on a 404.
  const Wrap = lesson.href ? Link : "div";
  return (
    <Wrap
      href={lesson.href ?? "#"}
      className={`mt-6 block rounded-[16px] bg-nevo-cream-elevated p-[22px] shadow-elevation-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 motion-safe:[animation-delay:120ms]${lesson.href ? " transition-transform active:scale-[0.99]" : ""}`}
    >
      <span className="font-mono text-[11px] tracking-[0.08em] text-nevo-near-black/60 uppercase">
        Pick back up
      </span>
      <div className="mt-4 sm:flex sm:items-center sm:gap-7">
        <div className="flex flex-1 items-center gap-[18px]">
          <ProgressRing value={lesson.progress} glyph={Boolean(lesson.href)} />
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-semibold tracking-[-0.01em] text-nevo-near-black">
              {lesson.title}
            </p>
            {/* Mid-module, the line names the module (SCRUM-101.4); one line,
                truncated, so a long title never reflows the card. */}
            <p className="mt-1.5 truncate text-sm text-nevo-near-black/68">
              {lesson.module
                ? `Module ${lesson.module.index + 1} of ${lesson.module.count}${lesson.module.title ? `: ${lesson.module.title}` : ""}`
                : lesson.note}
            </p>
          </div>
        </div>
        {lesson.href && (
          <span className="mt-5 flex h-[52px] w-full shrink-0 items-center justify-center rounded-[12px] bg-nevo-navy px-8 text-base font-medium text-nevo-cream sm:mt-0 sm:w-auto">
            Continue
          </span>
        )}
      </div>
    </Wrap>
  );
}

/** A quiet violet arc on a navy-tinted track, with a play glyph — never a %. */
function ProgressRing({
  value,
  glyph = true,
}: {
  value: number;
  glyph?: boolean;
}) {
  const r = 32;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(1, value)));
  return (
    <span className="relative size-[68px] shrink-0">
      <svg
        width="68"
        height="68"
        viewBox="0 0 68 68"
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke="rgba(59,63,110,0.14)"
          strokeWidth="5"
        />
        <circle
          cx="34"
          cy="34"
          r={r}
          fill="none"
          stroke="#9a9ccb"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      {glyph && (
        <span className="absolute inset-0 flex items-center justify-center text-nevo-navy">
          <Play className="size-6" fill="currentColor" strokeWidth={0} />
        </span>
      )}
    </span>
  );
}

/** Secondary lesson card — icon header + title + adaptive time estimate. */
function LessonCard({ lesson, index }: { lesson: TodayLesson; index: number }) {
  const Icon = lesson.icon;
  // Alternating violet tints, matching the frame's rhythm.
  const tints = [
    "bg-nevo-violet/18",
    "bg-nevo-violet/12",
    "bg-nevo-violet/[0.22]",
  ];
  const Wrap = lesson.href ? Link : "div";
  return (
    <Wrap
      href={lesson.href ?? "#"}
      className={`overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500${lesson.href ? " transition-transform active:scale-[0.98]" : ""}`}
      style={{ animationDelay: `${240 + index * 70}ms` }}
    >
      <div
        className={`flex h-[88px] items-center justify-center text-nevo-navy ${tints[index % tints.length]}`}
      >
        <Icon className="size-10" strokeWidth={2} />
      </div>
      <div className="p-3.5">
        <p className="text-[15px] font-semibold leading-[1.3] text-nevo-near-black">
          {lesson.title}
        </p>
        <p className="mt-1.5 text-[13px] text-nevo-near-black/60">
          {lesson.time}
        </p>
      </div>
    </Wrap>
  );
}
