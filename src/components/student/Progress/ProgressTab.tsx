"use client";

import { useId, type ReactNode } from "react";
import { IllustrationWrapper } from "@/components/shared";
import { SampleRegion } from "@/components/shared/SampleRegion";
import Link from "next/link";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { useStudentProgress } from "@/hooks/useStudentProgress";
import { GROWTH_SUMMARY, SUBJECTS } from "./progressData";

/**
 * Progress Tab (screen 22, SCRUM-144). Growth in plain language: a warm summary
 * of how the student has been doing, then a card per subject (the Student
 * Subject Card, 33a) under its own calm texture. Deliberately no numbers — no
 * percentile, no score, no peer comparison. Each card opens the subject.
 *
 * A SIGNED-IN CHILD SEES THEIR OWN, and never the fixtures.
 *
 * The fixtures are not placeholder text — they are sentences about a child's
 * learning ("You've been building strong reading skills this month"), so
 * rendering them to a real child told them things we had written about them.
 *
 * They were first gated to an empty state on the belief that Progress had no
 * backend at all. That was wrong, and the correction is this file:
 * `GET /api/students/{id}/progress` returns per-subject mastery, per-concept
 * understanding, and a lesson history. A signed-in child was being shown
 * "nothing yet" while their real data sat behind an already-typed client.
 *
 * THE PROSE ARRIVED ON 3 SEP. The backend now writes `reflection` - a warm,
 * whole-picture sentence in non-diagnostic language - and it takes the slot
 * the designed GROWTH_SUMMARY drew. It is rendered as given, never reworded.
 * The per-card note ("Getting faster at solving problems") still has no field:
 * `highlights` is a student-level list, not a note per subject, so mapping it
 * onto the cards would be fabrication. The live cards carry concept names
 * instead, which are facts, and `highlights` waits on a designed slot.
 *
 * No numbers reach the screen (screen 22: no percentile, no score, no
 * comparison, direction of travel only). `understanding` orders the concepts
 * and never appears.
 */
export function ProgressTab() {
  const signedIn = useHasSession();
  const hydrated = useHydrated();
  const { subjects, lessons, reflection, loading, failed, live } =
    useStudentProgress();

  // The server cannot read the token, so SSR would render the fixtures and
  // hydration would swap them out - meaning a signed-in child sees a frame of
  // invented sentences about themselves. Nothing renders until we know who is
  // looking.
  if (!hydrated) return <ProgressShell />;
  if (signedIn) {
    if (loading) return <ProgressShell />;
    if (failed) return <CouldNotLoad />;
    /*
     * Live and genuinely empty: a child who has not worked on anything yet.
     *
     * LESSONS COUNT TOO. This gated on subject-bearing concepts alone, so a
     * child who had finished lessons whose concepts carry no subject - or none
     * yet - was told there was nothing to show, over the top of a reflection
     * the backend had written about that very work.
     */
    if (!live || (subjects.length === 0 && lessons.length === 0)) {
      return <NothingYet />;
    }
    return <LiveProgress subjects={subjects} reflection={reflection} />;
  }

  // Signed out: the designed walkthrough, which is invented sentences about a
  // fictional child. Marked so an end-to-end run that reached this while signed
  // in fails, rather than reading the fixtures as the assertion's own answer.
  return (
    <SampleRegion kind="student:progress">
    <div className="mx-auto w-full max-w-[900px] px-5 py-2 pb-6 sm:px-8 sm:py-6 lg:py-8">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
        Progress
      </h1>

      <p className="mt-5 max-w-[300px] text-base leading-[1.55] text-nevo-near-black/72 sm:mt-6 sm:max-w-[560px] sm:text-[18px] lg:mt-7 lg:max-w-[640px] lg:text-[19px]">
        {GROWTH_SUMMARY}
      </p>

      <div className={SUBJECT_GRID}>
        {SUBJECTS.map((subject) => (
          <SubjectCard
            key={subject.slug}
            href={`/student/progress/${subject.slug}`}
            name={subject.name}
            line={subject.note}
          />
        ))}
      </div>
      </div>
    </SampleRegion>
  );
}

/** The child's own subjects, from their concept rows. */
function LiveProgress({
  subjects,
  reflection,
}: {
  subjects: ReturnType<typeof useStudentProgress>["subjects"];
  reflection: string | null;
}) {
  // The contract requires a reflection, but an empty string is still a
  // possible payload, and an empty paragraph is not what the frame drew. The
  // fallback is claim-free: it says nothing about the child - and it only
  // stands where there are cards below for it to introduce.
  const summary =
    reflection?.trim() ||
    (subjects.length > 0 ? "Here’s what you’ve been working on." : null);
  return (
    <div className="mx-auto w-full max-w-[900px] px-5 py-2 pb-6 sm:px-8 sm:py-6 lg:py-8">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
        Progress
      </h1>

      {summary && (
        <p className="mt-5 max-w-[300px] text-base leading-[1.55] text-nevo-near-black/72 sm:mt-6 sm:max-w-[560px] sm:text-[18px] lg:mt-7 lg:max-w-[640px] lg:text-[19px]">
          {summary}
        </p>
      )}

      {subjects.length > 0 && (
        <div className={SUBJECT_GRID}>
          {subjects.map((subject) => (
            <SubjectCard
              key={subject.slug}
              href={`/student/progress/${subject.slug}`}
              name={subject.name}
              // Concept NAMES, not scores - what they have worked on is a
              // fact; how well is a judgement the contract carries as a
              // number and screen 22 forbids showing. The card's "Working on"
              // line and topic squares need a topic count the contract does
              // not carry, and wait on it.
              line={subject.concepts
                .slice(0, 3)
                .map((c) => c.name)
                .join(" · ")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** The read failed - not the same as having done nothing. */
function CouldNotLoad() {
  return (
    <div className="mx-auto w-full max-w-[900px] px-5 py-2 pb-6 sm:px-8 sm:py-6 lg:py-8">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
        Progress
      </h1>
      <div className="mt-8 rounded-[16px] bg-nevo-cream-elevated p-[22px] shadow-elevation-1">
        <p className="text-[17px] font-semibold text-nevo-near-black">
          We couldn&rsquo;t load your progress just now
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

/** Heading only, while we work out who is looking. */
function ProgressShell() {
  return (
    <div className="mx-auto w-full max-w-[900px] px-5 py-2 pb-6 sm:px-8 sm:py-6 lg:py-8">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
        Progress
      </h1>
      <div className="mt-8 h-24 max-w-[560px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
    </div>
  );
}

/**
 * What a signed-in child sees until the backend can say something true.
 *
 * Framed as "not yet", never as "you have made no progress". The absence is
 * ours, not theirs, and a child reading this should not take it as a verdict
 * on their work.
 */
function NothingYet() {
  return (
    <div className="mx-auto w-full max-w-[900px] px-5 py-2 pb-6 sm:px-8 sm:py-6 lg:py-8">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
        Progress
      </h1>

      <div className="flex flex-col items-center px-6 pt-10 pb-6 text-center">
        <IllustrationWrapper
          src="/illustrations/empty-lessons.png"
          alt=""
          width={512}
          height={512}
          className="w-[170px]"
        />
        {/* 29 Empty States, "Progress (Empty)": one line. */}
        <h2 className="mt-5 max-w-[280px] text-lg font-medium leading-[1.35] text-nevo-near-black">
          Your progress will show here as you complete lessons
        </h2>
      </div>
    </div>
  );
}

/**
 * One column on a phone, two on a tablet, three on a desktop (Nevo Progress
 * Frame). It was a sideways scroller on phones: a horizontal scroll nested in
 * the vertical page, which the Touch Signal Contract rules out (SCRUM-94 G5) -
 * the swipe reads as a gesture the page did not ask for.
 */
const SUBJECT_GRID =
  "mt-8 grid max-w-[900px] grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3";

/** One subject (Nevo Student Subject Card, 33a): its texture, name and line. */
function SubjectCard({
  href,
  name,
  line,
}: {
  href: string;
  name: string;
  line: string;
}) {
  return (
    <Link
      href={href}
      className="block cursor-pointer overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1 transition-transform active:scale-[0.99]"
    >
      <SubjectTexture subject={name} />
      <div className="px-4 pt-3.5 pb-4 sm:px-5 sm:pt-[18px] sm:pb-5">
        <p className="text-base font-semibold text-nevo-near-black sm:text-[18px]">
          {name}
        </p>
        <p className="mt-1.5 text-sm leading-[1.4] text-nevo-near-black/66 sm:text-[15px]">
          {line}
        </p>
      </div>
    </Link>
  );
}

/** The six symmetric motifs of 33a, each one tile of a 240 × 96 band. */
const MOTIFS: { w: number; h: number; tile: (mark: string) => ReactNode }[] = [
  // dots
  { w: 20, h: 20, tile: (m) => <circle cx="10" cy="10" r="2.4" fill={m} /> },
  // rings
  {
    w: 36,
    h: 36,
    tile: (m) => (
      <>
        <circle cx="18" cy="18" r="12" fill="none" stroke={m} strokeWidth="1.6" />
        <circle cx="18" cy="18" r="5" fill="none" stroke={m} strokeWidth="1.6" />
      </>
    ),
  },
  // cross
  {
    w: 18,
    h: 18,
    tile: (m) => <path d="M0 18L18 0M0 0L18 18" stroke={m} strokeWidth="1.3" />,
  },
  // wave
  {
    w: 28,
    h: 18,
    tile: (m) => (
      <path d="M0 11 Q7 3 14 11 T28 11" fill="none" stroke={m} strokeWidth="1.5" />
    ),
  },
  // squares
  {
    w: 26,
    h: 26,
    tile: (m) => (
      <rect x="5" y="5" width="16" height="16" fill="none" stroke={m} strokeWidth="1.4" />
    ),
  },
  // diamond lattice
  {
    w: 24,
    h: 24,
    tile: (m) => (
      <path d="M12 2 L22 12 L12 22 L2 12 Z" fill="none" stroke={m} strokeWidth="1.4" />
    ),
  },
];

/** The two families of 33a: violet and navy, each a wash and a mark. */
const FAMILIES = [
  { bg: "rgba(154,156,203,0.16)", mark: "rgba(154,156,203,0.55)" },
  { bg: "rgba(59,63,110,0.10)", mark: "rgba(59,63,110,0.34)" },
];

/**
 * Which texture a subject wears - from its NAME, and nothing else.
 *
 * SCRUM-144's test is that a child could not read it as trend, improvement or
 * decline. So it is identity, not data: the same pattern for every child
 * however the term has gone. That is why it is chosen from the subject's name
 * and never from anything about the child's work in it.
 */
export function textureFor(subject: string): {
  motif: number;
  family: number;
} {
  let h = 0;
  for (const ch of subject.trim().toLowerCase()) {
    h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  }
  return { motif: h % MOTIFS.length, family: (h >>> 8) % FAMILIES.length };
}

/**
 * The calm per-subject band that replaced the rising line (SCRUM-144).
 *
 * The line was one fixed upward curve on every card, so every child was told
 * every subject was going up. Every motif here is symmetric and repeating: it
 * tells subjects apart and carries no direction. Decorative (`aria-hidden`).
 */
function SubjectTexture({ subject }: { subject: string }) {
  const id = useId();
  const { motif, family } = textureFor(subject);
  const m = MOTIFS[motif];
  const f = FAMILIES[family];
  return (
    <div
      className="h-[72px] overflow-hidden sm:h-24"
      data-texture={`${motif}-${family}`}
    >
      <svg
        viewBox="0 0 240 96"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <pattern id={id} patternUnits="userSpaceOnUse" width={m.w} height={m.h}>
            {m.tile(f.mark)}
          </pattern>
        </defs>
        <rect width="240" height="96" fill={f.bg} />
        <rect width="240" height="96" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}
