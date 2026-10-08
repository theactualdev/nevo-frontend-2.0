"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/shared";
import type { DashboardProgressRow } from "@/lib/api/students";
import {
  checkOutcomeFrom,
  type CheckOutcome,
} from "@/lib/lessons/checkOutcome";
import type { Lesson } from "@/lib/types";
import { loadCheckOutcome } from "./reviewStore";

const LESSONS_HREF = "/student/lessons";

/**
 * Lesson Summary (frame 18 · Lesson Summary) — the calm after-lesson recap,
 * reached from the completion screen's "See summary". Unlike the immersive
 * player, this renders **inside the app shell** (sidebar / mobile top bar), so
 * this component owns only the content column and its pinned footer actions.
 *
 * Growth framing, never numbers: a warm recap paragraph and a "what you covered"
 * card — no score, no percentile.
 *
 * "FROM THE CHECK-IN" IS THE SERVER'S (B26): the outcome the completion write
 * brought back, kept by the player on this device. Where the device has no
 * copy - the lesson was finished on another visit or another tablet - it is
 * read off the child's progress row for the lesson (B84, 8 Oct), and only a
 * completed one (`checkOutcomeFrom`). With neither, or a dashboard read that
 * failed, the section is not drawn. The signed-out walkthrough keeps its
 * authored lists.
 *
 * A concept to revisit is its name and the revisit mark, without the frame's
 * "· we'll revisit soon": design D96 (6 Oct) renders that promise only where
 * the engine scheduled the return, and nothing this screen reads carries one.
 */
export function LessonSummaryScreen({
  lesson,
  progressRow = null,
}: {
  lesson: Lesson;
  /** The child's newest progress row for this lesson; null when unread. */
  progressRow?: DashboardProgressRow | null;
}) {
  const router = useRouter();
  const summary = lesson.summary;
  // Kept in sessionStorage (client-only) - read after mount. Undefined until
  // it has been, so the row's copy is never drawn and then swapped for it.
  const [kept, setKept] = useState<CheckOutcome | null | undefined>(undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKept(loadCheckOutcome(lesson.id));
  }, [lesson.id]);
  const outcome =
    kept === undefined ? null : (kept ?? checkOutcomeFrom(progressRow));
  const mastered =
    outcome?.mastered ?? lesson.assessment?.masteredConcepts ?? [];
  const revisit = outcome?.revisit ?? lesson.assessment?.revisitConcepts ?? [];

  return (
    <div className="flex min-h-full flex-col bg-nevo-cream text-nevo-near-black">
      <div className="flex-1 px-6 pt-8 pb-6 sm:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-[560px] lg:max-w-[640px]">
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[30px] lg:text-[32px]">
            {lesson.title}
          </h1>

          {summary?.recap && (
            <p className="mt-5 text-base leading-[1.7] text-nevo-near-black/72 sm:mt-6 sm:text-[17px] lg:text-lg">
              {summary.recap}
            </p>
          )}

          {/*
            The two halves are gated SEPARATELY now, because they have separate
            sources. `recap` comes off the wire; `covered` is derived from the
            concepts the lesson's checkpoints actually name, and a lesson that
            names none produces nothing.

            Gating them together drew a card headed WHAT YOU COVERED with an
            empty paragraph under it - failure rendered as emptiness, on the
            screen the frame makes most prominent.
          */}
          {summary?.covered && (
            <div className="mt-7 rounded-[12px] bg-nevo-cream-elevated p-[18px] shadow-elevation-1 sm:p-[22px] lg:p-6">
              <span className="font-mono text-[11px] tracking-[0.06em] text-nevo-near-black/55">
                WHAT YOU COVERED
              </span>
              <p className="mt-2.5 text-[15px] leading-[1.6] text-nevo-near-black sm:text-base">
                {summary.covered}
              </p>
            </div>
          )}

          {(mastered.length > 0 || revisit.length > 0) && (
            <>
              <span className="mt-7 block font-mono text-[11px] tracking-[0.06em] text-nevo-near-black/55">
                FROM THE CHECK-IN
              </span>
              <div className="mt-3 flex flex-col gap-2.5">
                {mastered.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-[12px] bg-nevo-cream-elevated px-4 py-3.5 shadow-elevation-1"
                  >
                    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-nevo-navy">
                      <Check
                        className="size-3 text-nevo-cream"
                        strokeWidth={2.8}
                      />
                    </span>
                    <span className="text-[15px] font-medium text-nevo-near-black">
                      {item}
                    </span>
                  </div>
                ))}
                {revisit.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-[12px] bg-nevo-cream-elevated px-4 py-3.5 shadow-elevation-1"
                  >
                    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-nevo-violet/35">
                      <span className="size-2 rounded-full bg-nevo-violet" />
                    </span>
                    <span className="text-[15px] font-medium text-nevo-near-black">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 px-6 pb-8 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-2 sm:flex-row sm:gap-3 lg:max-w-[640px]">
          <Button
            className="w-full sm:flex-1 lg:w-[260px] lg:flex-none"
            onClick={() => router.push(LESSONS_HREF)}
          >
            Back to lessons
          </Button>
          {/* Only where there is a check-in to look back at. A lesson with
              no questions opened a review screen with nothing on it. */}
          {(lesson.assessment?.questions.length ?? 0) > 0 && (
            <Button
              variant="ghost"
              className="w-full sm:w-auto sm:px-7"
              onClick={() => router.push(`${LESSONS_HREF}/${lesson.id}/review`)}
            >
              Review answers
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
