"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import {
  IllustrationWrapper,
  NevoKeyboard,
  useNevoKeyboardDock,
} from "@/components/shared";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { useHydrated } from "@/hooks/useHydrated";
import { useHasSession } from "@/hooks/useHasSession";
import { useStudentLessons } from "@/hooks/useStudentLessons";
import { cn } from "@/lib/utils";
import {
  LESSON_CATALOG,
  SUBJECT_ICON,
  type LessonStatus,
  type LessonSummary,
} from "./lessonCatalog";
import { LessonPreviewSheet } from "./LessonPreviewSheet";

type Filter = "all" | LessonStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in_progress", label: "In Progress" },
  { id: "not_started", label: "Not Started" },
  { id: "completed", label: "Completed" },
];

/**
 * What a chip's empty list says. "No completed lessons yet" is the frame's
 * (29 Empty States); the other two chips are undrawn and keep the line that
 * shipped, flagged to design rather than written here.
 */
const FILTERED_EMPTY: Record<Filter, string> = {
  all: "Nothing in that group yet",
  in_progress: "Nothing in that group yet",
  not_started: "Nothing in that group yet",
  completed: "No completed lessons yet",
};

/**
 * Lessons Tab (screen 20). The student's lessons, with a calm status on each
 * card. Search + status filters narrow it; tapping a lesson opens its preview.
 * Warm empty state when a search finds nothing.
 *
 * LIVE FIRST. A signed-in child sees their own assignments (see
 * `useStudentLessons`) and never the fixtures - this screen used to render the
 * catalogue unconditionally, so a real student browsed four invented lessons,
 * one of them claiming they were 55% through it. Signed out, the fixtures back
 * the designed screen as before.
 *
 * GROUPED BY SUBJECT where a lesson has one. A live lesson carries the subject
 * its upload recorded (see `useStudentLessons`), and the fixtures carry their
 * own. A lesson with none goes into one unheaded group rather than under an
 * invented subject.
 */
export function LessonsTab() {
  const signedIn = useHasSession();
  const hydrated = useHydrated();
  const { lessons: liveLessons, live, loading, failed } = useStudentLessons();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const kb = useNevoKeyboardDock();
  const [preview, setPreview] = useState<LessonSummary | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Fixtures only when there is no session to read from.
  const source = useMemo(
    () => (live ? liveLessons : signedIn ? [] : LESSON_CATALOG),
    [live, liveLessons, signedIn],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = source.filter(
      (l) =>
        (filter === "all" || l.status === filter) &&
        (q === "" || l.title.toLowerCase().includes(q)),
    );
    // Grouped by subject where one exists; lessons without one fall into a
    // single unlabelled group.
    const bySubject = new Map<string, LessonSummary[]>();
    for (const lesson of matched) {
      const key = lesson.subject ?? "";
      const list = bySubject.get(key) ?? [];
      list.push(lesson);
      bySubject.set(key, list);
    }
    return [...bySubject.entries()];
  }, [source, query, filter]);

  const noResults = groups.length === 0;
  /*
   * WHAT IS ACTUALLY NARROWING THE LIST.
   *
   * The empty state said "No lessons match your search" and offered "Clear
   * search", which cleared the query alone. Two things were wrong with that.
   *
   * A status chip empties the list just as easily as a search does, and with
   * no query typed the copy blamed a search the child never made. And after
   * tapping "Clear search" with a chip still on, the screen stayed empty - the
   * one control offered did not restore anything, which reads as the button
   * being broken rather than as the chip still being on.
   *
   * So the copy names whichever is narrowing, in the frames' words, and the
   * control clears exactly what it names. With both on, "Clear search" lands
   * on the chip's own empty state, which says so and offers "Clear filter" -
   * every tap changes what the child sees.
   */
  const searching = query.trim().length > 0;
  /** Nothing has been assigned yet - different from a search finding nothing. */
  const nothingAssigned = live && liveLessons.length === 0;

  const openPreview = (lesson: LessonSummary) => {
    setPreview(lesson);
    setPreviewOpen(true);
  };

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto w-full max-w-[900px] px-5 py-2 pb-6 sm:px-8 sm:py-6">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
        Lessons
      </h1>
      {children}
    </div>
  );

  // NOT HYDRATED IS NOT SIGNED OUT - the same gate Progress, Subject Detail,
  // Connect and Downloads already carry. `useHasSession()` is false on the
  // server, so without it the SSR pass takes the fixture branch and a
  // signed-in child sees a frame of the sample catalogue as though it were
  // their own assignments.
  if (!hydrated || (signedIn && loading)) {
    return shell(
      <div className="mt-6 grid grid-cols-2 gap-3.5 lg:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[150px] animate-pulse rounded-[12px] bg-nevo-cream-elevated"
          />
        ))}
      </div>,
    );
  }

  if (signedIn && failed) {
    return shell(
      <div className="mt-6 rounded-[16px] bg-nevo-cream-elevated p-[22px] shadow-elevation-1">
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
      </div>,
    );
  }

  if (nothingAssigned) {
    return shell(
      <div className="flex flex-col items-center px-6 pt-11 pb-6 text-center">
        <IllustrationWrapper
          src="/illustrations/empty-lessons.png"
          alt=""
          width={512}
          height={512}
          className="w-[170px]"
        />
        {/* 29 Empty States, "Lessons (No lessons)": one line, no more. */}
        <h2 className="mt-5 max-w-[280px] text-lg font-medium leading-[1.35] text-nevo-near-black">
          Your lessons will show up here soon
        </h2>
      </div>,
    );
  }

  // Held rather than returned, because this same markup renders a real child's
  // lessons AND the signed-out catalogue - only the latter is sample data, so
  // the mark is conditional. Marking both would make the end-to-end assertion
  // fire on a correct screen, which is the fastest way to get a mark deleted.
  const body = (
    <div className="mx-auto w-full max-w-[900px] px-5 py-2 pb-6 sm:px-8 sm:py-6">
      <h1 className="text-2xl font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
        Lessons
      </h1>

      {/* Search */}
      <div className="relative mt-4">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-nevo-near-black/42"
          strokeWidth={2}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={kb.onFocus}
          onBlur={kb.onBlur}
          // A.12: the Nevo Keyboard drives entry on touch; hardware keyboards
          // still type on desktop, where the on-screen one is hidden.
          inputMode="none"
          placeholder="Search lessons"
          aria-label="Search lessons"
          className="h-[46px] w-full rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream-elevated pr-3.5 pl-[42px] text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy"
        />
      </div>

      {kb.open && (
        <NevoKeyboard
          layout="qwerty"
          onKey={(c) => setQuery((q) => q + c)}
          onBackspace={() => setQuery((q) => q.slice(0, -1))}
          onReturn={kb.close}
          className="fixed inset-x-0 bottom-0 z-40"
        />
      )}

      {/* Status filters */}
      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map(({ id, label }) => {
          const on = filter === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={on}
              className={cn(
                "inline-flex h-11 shrink-0 cursor-pointer items-center rounded-full border-[1.5px] px-4 text-[13px] font-medium whitespace-nowrap transition-colors",
                on
                  ? "border-nevo-navy bg-nevo-navy text-nevo-cream"
                  : "border-nevo-near-black/20 bg-transparent text-nevo-near-black hover:border-nevo-near-black/35",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {noResults ? (
        <div className="flex flex-col items-center px-6 pt-11 pb-6 text-center">
          <IllustrationWrapper
            src="/illustrations/empty-lessons.png"
            alt=""
            width={512}
            height={512}
            className="w-[170px]"
          />
          <h2 className="mt-5 text-lg font-medium text-nevo-near-black">
            {searching
              ? "No lessons match your search"
              : FILTERED_EMPTY[filter]}
          </h2>
          {/* Nevo Lessons Frame draws this line for a search only; the
              chip's empty state (29 Empty States) is the heading alone. */}
          {searching && (
            <p className="mt-1.5 max-w-[280px] text-sm leading-[1.5] text-nevo-near-black/60">
              Try a different word, or clear the search to see everything.
            </p>
          )}
          <button
            type="button"
            onClick={() => (searching ? setQuery("") : setFilter("all"))}
            className="mt-5 h-11 cursor-pointer rounded-[10px] px-[22px] text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
          >
            {searching ? "Clear search" : "Clear filter"}
          </button>
        </div>
      ) : (
        <div className="mt-6">
          {groups.map(([subject, lessons]) => (
            <section key={subject} className="mb-7">
              {/* Not sticky: a pinned header overlays cards (taps land on it)
                  and perturbs the scroll signal (SCRUM-94). Lessons with no
                  subject render headingless rather than under an invented
                  one. */}
              {subject && (
                <h2 className="mb-3 py-1.5 text-lg font-semibold text-nevo-near-black">
                  {subject}
                </h2>
              )}
              <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-3">
                {lessons.map((lesson) => (
                  <LessonCard
                    key={lesson.id}
                    lesson={lesson}
                    onOpen={() => openPreview(lesson)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <LessonPreviewSheet
        lesson={preview}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );

  return signedIn ? (
    body
  ) : (
    <SampleRegion kind="student:lessons">{body}</SampleRegion>
  );
}

function LessonCard({
  lesson,
  onOpen,
}: {
  lesson: LessonSummary;
  onOpen: () => void;
}) {
  // A live subject is free text, so one outside the three marks, or no
  // subject at all, gets the neutral book mark.
  const Icon =
    (lesson.subject ? SUBJECT_ICON[lesson.subject] : undefined) ??
    SUBJECT_ICON.English;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative cursor-pointer overflow-hidden rounded-[12px] bg-nevo-cream-elevated text-left shadow-elevation-1 transition-transform active:scale-[0.98]"
    >
      {/* Accent bar (subject) */}
      <div className="h-[5px] bg-nevo-violet/70" />
      <StatusMark status={lesson.status} />
      <div className="p-4">
        <span className="flex size-10 items-center justify-center rounded-[10px] bg-nevo-cream text-nevo-navy">
          <Icon className="size-5" strokeWidth={2} />
        </span>
        <p className="mt-3 text-[15px] font-semibold leading-[1.3] text-nevo-near-black">
          {lesson.title}
        </p>
        <p className="mt-1.5 text-[13px] text-nevo-near-black/60">
          {lesson.timeEstimate}
        </p>
      </div>
    </button>
  );
}

/**
 * Calm status dot — completed (navy check), in-progress (violet ring with a
 * navy centre), or not started.
 *
 * IN PROGRESS IS A STATE, NOT AN AMOUNT (design D21, 1 Oct). It drew a conic
 * fill fixed at 55% on every in-progress card, which a child reads as how far
 * they are - the same for everyone, so it was the rising curve again. The real
 * fraction is not on the wire (see `PickUp` on Home), so the mark is a plain
 * one: a centre dot, which no reading turns into a portion.
 */
function StatusMark({ status }: { status: LessonStatus }) {
  if (status === "completed") {
    return (
      <span
        role="img"
        aria-label="Completed"
        className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-nevo-navy"
      >
        <Check className="size-3 text-nevo-cream" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span
        role="img"
        aria-label="In progress"
        className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full border-2 border-nevo-violet"
      >
        <span className="size-2 rounded-full bg-nevo-navy" aria-hidden />
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label="Not started"
      className="absolute top-3 right-3 size-5 rounded-full border-2 border-nevo-near-black/28"
    />
  );
}
