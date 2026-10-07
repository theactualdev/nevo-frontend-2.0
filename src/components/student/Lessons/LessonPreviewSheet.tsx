"use client";

import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button, ProgressBar } from "@/components/shared";
import { lessonHref } from "@/lib/lessons/lessonHref";
import type { LessonSummary } from "./lessonCatalog";

/**
 * Lesson Preview (screen 21) — a calm look before committing. A bottom sheet on
 * mobile, a centred modal on tablet/desktop, over the dimmed list. Shows the
 * subject, adaptive estimate, a plain-language "what you'll do", and — if the
 * student is partway — says so. The single action starts (or continues) the
 * lesson.
 *
 * THE PARTWAY BAR CAME BACK WITH THE RING (design D21, backend B51). It went
 * on 1 Oct because its width was a fraction the wire did not carry, and a bar
 * is read as an amount exactly as a ring is. B51 put the true one on the
 * progress row, so the frame's bar runs to `lesson.place` - and says
 * "Segment 3 of 10", never a number. With no place there is no bar; the
 * frame's line stays either way, because being partway is a fact the progress
 * row states.
 *
 * A FINISHED LESSON (design D100, 6 Oct). 21 now draws it on a phone: a navy
 * disc with a check, "You finished this one.", and "Look again". The button
 * does what "Start" did here before (D22) - it opens the lesson from the top,
 * for review, and the player does not write that open back as unfinished.
 * Tablet and desktop take it into the centred modal, as the other states do.
 */
export function LessonPreviewSheet({
  lesson,
  open,
  onOpenChange,
}: {
  lesson: LessonSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  if (!lesson) return null;

  const inProgress = lesson.status === "in_progress";
  const completed = lesson.status === "completed";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="gap-0 rounded-t-[20px] border-0! bg-nevo-cream px-6 pt-5 pb-7 text-nevo-near-black shadow-[0_-8px_32px_rgba(0,0,0,0.16)] sm:inset-x-auto! sm:top-1/2 sm:bottom-auto! sm:left-1/2! sm:w-[480px] sm:max-w-[calc(100%-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px] sm:p-8 sm:shadow-[0_8px_32px_rgba(0,0,0,0.16)]"
      >
        <SheetTitle className="pr-12 text-[23px] font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-2xl">
          {lesson.title}
        </SheetTitle>

        <div className="mt-3.5 flex items-center gap-2.5">
          {/* A lesson with no subject drops the chip rather than drawing it
              empty, and never fills it with a guess. */}
          {lesson.subject && (
            <span className="rounded-full bg-nevo-violet/25 px-3 py-1 text-[13px] text-nevo-navy">
              {lesson.subject}
            </span>
          )}
          <span className="text-sm text-nevo-near-black/60">
            {lesson.timeEstimate.replace(/\bmin\b/, "minutes")}
          </span>
        </div>

        {/* The lesson's own `description` (1 Oct). Null on the wire means no
            line, never one we invented. */}
        {lesson.description && (
          <p className="mt-[18px] text-[15px] leading-[1.6] text-nevo-near-black sm:text-base">
            {lesson.description}
          </p>
        )}

        {inProgress && (
          <p className="mt-5 text-sm font-medium text-nevo-near-black">
            You&apos;re partway through this one
          </p>
        )}
        {inProgress && lesson.place && (
          // 21's bar: 5px, violet on a faint navy track.
          <ProgressBar
            value={lesson.place.fraction}
            aria-label={lesson.place.words}
            className="mt-2.5 h-[5px] bg-nevo-navy/14"
          />
        )}

        {completed && (
          // 21's completed row: a 34px navy disc with the frame's own check.
          <p className="mt-[22px] flex items-center gap-3 text-[15px] font-medium text-nevo-near-black">
            <span
              aria-hidden
              data-finished-disc
              className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-nevo-navy"
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-nevo-cream"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </span>
            You finished this one.
          </p>
        )}

        <Button
          className="mt-7 w-full"
          onClick={() =>
            router.push(lessonHref(lesson.lessonId, lesson.assignmentId))
          }
        >
          {inProgress ? "Continue" : completed ? "Look again" : "Start"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
