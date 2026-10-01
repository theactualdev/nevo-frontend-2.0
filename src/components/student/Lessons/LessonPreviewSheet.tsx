"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/shared";
import { lessonHref } from "@/lib/lessons/lessonHref";
import type { LessonSummary } from "./lessonCatalog";

/**
 * Lesson Preview (screen 21) — a calm look before committing. A bottom sheet on
 * mobile, a centred modal on tablet/desktop, over the dimmed list. Shows the
 * subject, adaptive estimate, a plain-language "what you'll do", and — if the
 * student is partway — says so. The single action starts (or continues) the
 * lesson.
 *
 * THE PARTWAY BAR IS GONE WITH THE RING (design D21, 1 Oct). Its width was
 * `segmentPosition / segmentCount`, a fraction the wire does not carry (see
 * `PickUp` on Home), and a bar is read as an amount exactly as a ring is. The
 * frame's line stays: being partway is a fact the progress row states.
 *
 * A FINISHED LESSON (design D22). 21 draws never-started and partway only, so
 * the completed state is the minimum: the Lessons card's own completed mark and
 * the filter's word for it, and "Start", which is what the button does - it
 * opens the lesson from the top, for review, and the player no longer writes
 * that open back as unfinished. Its label and any line are asked of design.
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

        {completed && (
          <p className="mt-5 flex items-center gap-2 text-sm font-medium text-nevo-near-black">
            <span
              aria-hidden
              className="flex size-5 items-center justify-center rounded-full bg-nevo-navy"
            >
              <Check className="size-3 text-nevo-cream" strokeWidth={3} />
            </span>
            Completed
          </p>
        )}

        <Button
          className="mt-7 w-full"
          onClick={() =>
            router.push(lessonHref(lesson.lessonId, lesson.assignmentId))
          }
        >
          {inProgress ? "Continue" : "Start"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
